type OrderStatus = "pending" | "paid";

interface Order {
  id: string;
  customerId: string;
  amount: number;
  status: OrderStatus;
  paymentRef?: string;
  audit: string[];
}

interface Charge {
  ref: string;
  customerId: string;
  amount: number;
  idempotencyKey: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

class FakePaymentGateway {
  private charges: Charge[] = [];
  private nextId = 1;

  async charge(
    customerId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<string> {
    // Simulate a remote processor taking time to respond.
    await sleep(15);

    const ref = `ch_${String(this.nextId).padStart(6, "0")}`;
    this.nextId += 1;

    this.charges.push({
      ref,
      customerId,
      amount,
      idempotencyKey,
    });

    return ref;
  }

  chargesForOrder(orderId: string): Charge[] {
    return this.charges.filter((charge) => charge.idempotencyKey === orderId);
  }
}

class OrderRepository {
  private orders = new Map<string, Order>();

  save(order: Order): void {
    this.orders.set(order.id, order);
  }

  get(orderId: string): Order {
    const order = this.orders.get(orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    return order;
  }
}

class PaymentService {
  private recentlySeen = new Map<string, number>();
  private inFlight = new Map<string, Promise<string>>();
  constructor(
    private readonly repo: OrderRepository,
    private readonly gateway: FakePaymentGateway,
  ) {}

  async capturePayment(orderId: string): Promise<string> {
    const order = this.repo.get(orderId);

    if (order.status === "paid") {
      if (!order.paymentRef) {
        throw new Error(`Paid order has no payment reference: ${order.id}`);
      }

      return order.paymentRef;
    }

    const existing = this.inFlight.get(orderId);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const lastSeen = this.recentlySeen.get(orderId);

    if (lastSeen !== undefined && now - lastSeen < 250 && order.paymentRef !== undefined) {
      return order.paymentRef;
    }

    // duplicate prevention: do not mark recentlySeen until after success
    // hence, do not set recentlySeen here

    const chargePromise = (async (): Promise<string> => {
      try {
        order.audit.push("capture_started");
        const paymentRef = await this.gateway.charge(
          order.customerId,
          order.amount,
          order.id,
        );
        order.paymentRef = paymentRef;
        this.recentlySeen.set(orderId, Date.now());
        order.status = "paid";
        order.audit.push("capture_finished");
        this.repo.save(order);
        return paymentRef;
      } finally {
        this.inFlight.delete(orderId);
      }
    })();

    this.inFlight.set(orderId, chargePromise);
    return chargePromise;
  }
}

const createOrder = (
  id: string,
  customerId: string,
  amount: number,
): Order => ({
  id,
  customerId,
  amount,
  status: "pending",
  audit: [],
});

describe("PaymentService", () => {
  test("concurrent capture should charge order once", async () => {
    const repo = new OrderRepository();
    const gateway = new FakePaymentGateway();
    const service = new PaymentService(repo, gateway);

    const order = createOrder("ord_1001", "cust_abc", 49.99);
    repo.save(order);

    const workers = Array.from({ length: 12 }, async () => {
      return service.capturePayment(order.id);
    });

    const refs = await Promise.all(workers);
    const charges = gateway.chargesForOrder(order.id);

    expect(charges).toHaveLength(1);
    expect(new Set(refs).size).toBe(1);
  });

  test("repeated sequential capture is not double charged", async () => {
    const repo = new OrderRepository();
    const gateway = new FakePaymentGateway();
    const service = new PaymentService(repo, gateway);

    const order = createOrder("ord_1002", "cust_xyz", 19.99);
    repo.save(order);

    const firstRef = await service.capturePayment(order.id);
    const secondRef = await service.capturePayment(order.id);

    expect(firstRef).toBe(secondRef);
    expect(gateway.chargesForOrder(order.id)).toHaveLength(1);
  });
});
