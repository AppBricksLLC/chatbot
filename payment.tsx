type OrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "cancelled"
  | "refunded";

interface LineItem {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  lineItems: LineItem[];
  couponPercent?: number;
  paymentRef?: string;
  refundRef?: string;
  audit: string[];
}

interface Charge {
  ref: string;
  customerId: string;
  amountCents: number;
  idempotencyKey: string;
}

interface Refund {
  ref: string;
  chargeRef: string;
  amountCents: number;
  idempotencyKey: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

class FakePaymentGateway {
  private charges: Charge[] = [];
  private refunds: Refund[] = [];
  private nextChargeId = 1;
  private nextRefundId = 1;
  private failingCustomers = new Set<string>();

  failChargesFor(customerId: string): void {
    this.failingCustomers.add(customerId);
  }

  async charge(
    customerId: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<string> {
    await sleep(15);

    if (this.failingCustomers.has(customerId)) {
      throw new Error(`Card declined for customer ${customerId}`);
    }

    const ref = `ch_${String(this.nextChargeId).padStart(6, "0")}`;
    this.nextChargeId += 1;

    this.charges.push({
      ref,
      customerId,
      amountCents,
      idempotencyKey,
    });

    return ref;
  }

  async refund(
    chargeRef: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<string> {
    await sleep(15);

    const ref = `rf_${String(this.nextRefundId).padStart(6, "0")}`;
    this.nextRefundId += 1;

    this.refunds.push({
      ref,
      chargeRef,
      amountCents,
      idempotencyKey,
    });

    return ref;
  }

  chargesForOrder(orderId: string): Charge[] {
    return this.charges.filter((charge) => charge.idempotencyKey === orderId);
  }

  refundsForOrder(orderId: string): Refund[] {
    return this.refunds.filter((refund) => refund.idempotencyKey === orderId);
  }
}

class InventoryService {
  private stock = new Map<string, number>();
  private reserved = new Map<string, number>();

  setStock(sku: string, quantity: number): void {
    this.stock.set(sku, quantity);
  }

  getAvailable(sku: string): number {
    return this.stock.get(sku) ?? 0;
  }

  getReserved(sku: string): number {
    return this.reserved.get(sku) ?? 0;
  }

  reserve(sku: string, quantity: number): void {
    const available = this.stock.get(sku) ?? 0;

    if (available < quantity) {
      throw new Error(`Insufficient stock for ${sku}`);
    }

    this.stock.set(sku, available - quantity);
    this.reserved.set(sku, (this.reserved.get(sku) ?? 0) + quantity);
  }

  commitReservation(sku: string, quantity: number): void {
    const reserved = this.reserved.get(sku) ?? 0;

    if (reserved < quantity) {
      throw new Error(`Cannot commit unreserved stock for ${sku}`);
    }

    this.reserved.set(sku, reserved - quantity);
  }

  releaseReservation(sku: string, quantity: number): void {
    const reserved = this.reserved.get(sku) ?? 0;

    if (reserved < quantity) {
      return;
    }

    this.reserved.set(sku, reserved - quantity);
    this.stock.set(sku, (this.stock.get(sku) ?? 0) + quantity);
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

class CheckoutService {
  private recentlySubmitted = new Map<string, number>();
  private inFlight = new Set<string>();

  constructor(
    private readonly orders: OrderRepository,
    private readonly inventory: InventoryService,
    private readonly gateway: FakePaymentGateway,
  ) {}


  async submitOrder(orderId: string): Promise<string> {
    const order = this.orders.get(orderId);

    if (order.status === "paid") {
      if (!order.paymentRef) {
        throw new Error(`Paid order is missing payment reference: ${order.id}`);
      }

      return order.paymentRef;
    }

    const now = Date.now();
    const lastSubmit = this.recentlySubmitted.get(orderId);

    if (
      lastSubmit !== undefined &&
      now - lastSubmit < 300 &&
      order.paymentRef !== undefined
    ) {
      return order.paymentRef;
    }

    this.recentlySubmitted.set(orderId, now);
    order.audit.push("submit_started");

    for (const item of order.lineItems) {
      this.inventory.reserve(item.sku, item.quantity);
    }

    order.status = "pending_payment";
    this.orders.save(order);

    const amountCents = this.calculateAmountCents(order);

    try {
      const paymentRef = await this.gateway.charge(
        order.customerId,
        amountCents,
        order.id,
      );

      order.paymentRef = paymentRef;
      order.status = "paid";
      order.audit.push("payment_captured");

      for (const item of order.lineItems) {
        this.inventory.commitReservation(item.sku, item.quantity);
      }

      this.orders.save(order);
      return paymentRef;
    } catch (err) {
      // Release any reserved stock if payment fails
      for (const item of order.lineItems) {
        this.inventory.releaseReservation(item.sku, item.quantity);
      }
      // Reset order state to allow retry
      order.status = "draft";
      order.audit.push("payment_failed");
      this.orders.save(order);
      throw err;
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);

    if (order.status === "paid") {
      throw new Error("Paid orders must be refunded, not cancelled");
    }

    if (order.status === "cancelled") {
      return;
    }

    for (const item of order.lineItems) {
      this.inventory.releaseReservation(item.sku, item.quantity);
    }

    order.status = "cancelled";
    order.audit.push("cancelled");
    this.orders.save(order);
  }

  async refundOrder(orderId: string): Promise<string> {
    const order = this.orders.get(orderId);

    if (order.status !== "paid") {
      if (order.refundRef) {
        return order.refundRef;
      }

      throw new Error(`Order ${order.id} is not refundable`);
    }

    if (!order.paymentRef) {
      throw new Error(`Order ${order.id} has no payment reference`);
    }

    const amountCents = this.calculateAmountCents(order);

    const refundRef = await this.gateway.refund(
      order.paymentRef,
      amountCents,
      order.id,
    );

    order.refundRef = refundRef;
    order.status = "refunded";
    order.audit.push("refunded");
    this.orders.save(order);

    return refundRef;
  }

  private calculateAmountCents(order: Order): number {
    const subtotal = order.lineItems.reduce((sum, item) => {
      return sum + item.unitPriceCents * item.quantity;
    }, 0);

    if (!order.couponPercent) {
      return subtotal;
    }

    return Math.round(subtotal * (order.couponPercent / 100));
  }
}

const createOrder = (
  id: string,
  customerId: string,
  lineItems: LineItem[],
  couponPercent?: number,
): Order => ({
  id,
  customerId,
  lineItems,
  couponPercent,
  status: "draft",
  audit: [],
});

describe("CheckoutService", () => {
  test("concurrent submit should only charge once", async () => {
    const orders = new OrderRepository();
    const inventory = new InventoryService();
    const gateway = new FakePaymentGateway();

    inventory.setStock("sku_keyboard", 50);

    const service = new CheckoutService(orders, inventory, gateway);
    const order = createOrder("ord_parallel_1", "cust_001", [
      {
        sku: "sku_keyboard",
        quantity: 1,
        unitPriceCents: 4999,
      },
    ]);

    orders.save(order);

    const workers = Array.from({ length: 10 }, async () => {
      return service.submitOrder(order.id);
    });

    const refs = await Promise.all(workers);
    const charges = gateway.chargesForOrder(order.id);

    expect(charges).toHaveLength(1);
    expect(new Set(refs).size).toBe(1);
  });

  test("failed payment should release reserved inventory", async () => {
    const orders = new OrderRepository();
    const inventory = new InventoryService();
    const gateway = new FakePaymentGateway();

    inventory.setStock("sku_mouse", 3);
    gateway.failChargesFor("cust_declined");

    const service = new CheckoutService(orders, inventory, gateway);
    const order = createOrder("ord_declined_1", "cust_declined", [
      {
        sku: "sku_mouse",
        quantity: 2,
        unitPriceCents: 2999,
      },
    ]);

    orders.save(order);

    await expect(service.submitOrder(order.id)).rejects.toThrow("Card declined");

    expect(inventory.getAvailable("sku_mouse")).toBe(3);
    expect(inventory.getReserved("sku_mouse")).toBe(0);
  });

  test("concurrent refund should only issue one refund", async () => {
    const orders = new OrderRepository();
    const inventory = new InventoryService();
    const gateway = new FakePaymentGateway();

    inventory.setStock("sku_monitor", 20);

    const service = new CheckoutService(orders, inventory, gateway);
    const order = createOrder("ord_refund_1", "cust_002", [
      {
        sku: "sku_monitor",
        quantity: 1,
        unitPriceCents: 15999,
      },
    ]);

    orders.save(order);

    await service.submitOrder(order.id);

    const workers = Array.from({ length: 8 }, async () => {
      return service.refundOrder(order.id);
    });

    const refs = await Promise.all(workers);
    const refunds = gateway.refundsForOrder(order.id);

    expect(refunds).toHaveLength(1);
    expect(new Set(refs).size).toBe(1);
  });

  test("coupon should discount the subtotal, not replace it", async () => {
    const orders = new OrderRepository();
    const inventory = new InventoryService();
    const gateway = new FakePaymentGateway();

    inventory.setStock("sku_laptop_stand", 10);

    const service = new CheckoutService(orders, inventory, gateway);
    const order = createOrder(
      "ord_coupon_1",
      "cust_003",
      [
        {
          sku: "sku_laptop_stand",
          quantity: 2,
          unitPriceCents: 2500,
        },
      ],
      20,
    );

    orders.save(order);

    await service.submitOrder(order.id);

    const charges = gateway.chargesForOrder(order.id);

    expect(charges).toHaveLength(1);
    expect(charges[0].amountCents).toBe(4000);
  });

  test("sequential submit should not double charge", async () => {
    const orders = new OrderRepository();
    const inventory = new InventoryService();
    const gateway = new FakePaymentGateway();

    inventory.setStock("sku_cable", 5);

    const service = new CheckoutService(orders, inventory, gateway);
    const order = createOrder("ord_sequential_1", "cust_004", [
      {
        sku: "sku_cable",
        quantity: 1,
        unitPriceCents: 999,
      },
    ]);

    orders.save(order);

    const firstRef = await service.submitOrder(order.id);
    const secondRef = await service.submitOrder(order.id);

    expect(firstRef).toBe(secondRef);
    expect(gateway.chargesForOrder(order.id)).toHaveLength(1);
  });
});
