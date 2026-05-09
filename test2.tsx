type Currency = "USD" | "EUR" | "GBP";

type OrderStatus =
  | "draft"
  | "validated"
  | "reserved"
  | "pending_payment"
  | "paid"
  | "cancelled"
  | "refunded";

type ShipmentStatus =
  | "not_required"
  | "pending"
  | "ready"
  | "shipped"
  | "returned";

interface Address {
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode: string;
  country: string;
}

interface Customer {
  id: string;
  email: string;
  billingAddress: Address;
  shippingAddress: Address;
  blocked: boolean;
}

interface Product {
  sku: string;
  title: string;
  priceCents: number;
  taxable: boolean;
  shippable: boolean;
  active: boolean;
}

interface LineItem {
  sku: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  shippable: boolean;
}

interface Order {
  id: string;
  customerId: string;
  currency: Currency;
  status: OrderStatus;
  shipmentStatus: ShipmentStatus;
  items: LineItem[];
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  couponCode?: string;
  paymentRef?: string;
  refundRef?: string;
  audit: string[];
}

interface Charge {
  ref: string;
  orderId: string;
  customerId: string;
  amountCents: number;
  currency: Currency;
}

interface Refund {
  ref: string;
  orderId: string;
  chargeRef: string;
  amountCents: number;
}

interface Coupon {
  code: string;
  percentOff: number;
  active: boolean;
  minimumSubtotalCents: number;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const cloneAddress = (address: Address): Address => ({
  line1: address.line1,
  line2: address.line2,
  city: address.city,
  region: address.region,
  postalCode: address.postalCode,
  country: address.country,
});

const cloneCustomer = (customer: Customer): Customer => ({
  id: customer.id,
  email: customer.email,
  billingAddress: cloneAddress(customer.billingAddress),
  shippingAddress: cloneAddress(customer.shippingAddress),
  blocked: customer.blocked,
});

const cloneProduct = (product: Product): Product => ({
  sku: product.sku,
  title: product.title,
  priceCents: product.priceCents,
  taxable: product.taxable,
  shippable: product.shippable,
  active: product.active,
});

const cloneLineItem = (item: LineItem): LineItem => ({
  sku: item.sku,
  quantity: item.quantity,
  unitPriceCents: item.unitPriceCents,
  taxable: item.taxable,
  shippable: item.shippable,
});

const cloneOrder = (order: Order): Order => ({
  id: order.id,
  customerId: order.customerId,
  currency: order.currency,
  status: order.status,
  shipmentStatus: order.shipmentStatus,
  items: order.items.map(cloneLineItem),
  subtotalCents: order.subtotalCents,
  taxCents: order.taxCents,
  shippingCents: order.shippingCents,
  discountCents: order.discountCents,
  totalCents: order.totalCents,
  couponCode: order.couponCode,
  paymentRef: order.paymentRef,
  refundRef: order.refundRef,
  audit: [...order.audit],
});

const normalizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

const normalizeSku = (sku: string): string => {
  return sku.trim().toUpperCase();
};

const isPositiveInteger = (value: number): boolean => {
  return Number.isInteger(value) && value > 0;
};

const formatMoney = (amountCents: number, currency: Currency): string => {
  const amount = amountCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
};

const makeAddress = (
  line1: string,
  city: string,
  postalCode: string,
  country: string,
  region?: string,
): Address => ({
  line1,
  city,
  postalCode,
  country,
  region,
});

const makeCustomer = (id: string, email: string): Customer => ({
  id,
  email: normalizeEmail(email),
  billingAddress: makeAddress("1 Main St", "Berlin", "10115", "DE"),
  shippingAddress: makeAddress("1 Main St", "Berlin", "10115", "DE"),
  blocked: false,
});

const makeProduct = (
  sku: string,
  title: string,
  priceCents: number,
  taxable = true,
  shippable = true,
): Product => ({
  sku: normalizeSku(sku),
  title,
  priceCents,
  taxable,
  shippable,
  active: true,
});

const makeOrder = (
  id: string,
  customerId: string,
  currency: Currency = "USD",
): Order => ({
  id,
  customerId,
  currency,
  status: "draft",
  shipmentStatus: "pending",
  items: [],
  subtotalCents: 0,
  taxCents: 0,
  shippingCents: 0,
  discountCents: 0,
  totalCents: 0,
  audit: [],
});

class CustomerRepository {
  private customers = new Map<string, Customer>();

  save(customer: Customer): void {
    this.customers.set(customer.id, cloneCustomer(customer));
  }

  get(customerId: string): Customer {
    const customer = this.customers.get(customerId);

    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    return cloneCustomer(customer);
  }

  exists(customerId: string): boolean {
    return this.customers.has(customerId);
  }

  all(): Customer[] {
    return [...this.customers.values()].map(cloneCustomer);
  }
}

class ProductCatalog {
  private products = new Map<string, Product>();

  add(product: Product): void {
    this.products.set(product.sku, cloneProduct(product));
  }

  get(sku: string): Product {
    const product = this.products.get(normalizeSku(sku));

    if (!product) {
      throw new Error(`Product not found: ${sku}`);
    }

    return cloneProduct(product);
  }

  deactivate(sku: string): void {
    const key = normalizeSku(sku);
    const product = this.products.get(key);

    if (!product) {
      throw new Error(`Product not found: ${sku}`);
    }

    product.active = false;
    this.products.set(key, product);
  }

  allActive(): Product[] {
    return [...this.products.values()]
      .filter((product) => product.active)
      .map(cloneProduct);
  }
}

class CouponRepository {
  private coupons = new Map<string, Coupon>();

  save(coupon: Coupon): void {
    this.coupons.set(coupon.code.toUpperCase(), {
      code: coupon.code.toUpperCase(),
      percentOff: coupon.percentOff,
      active: coupon.active,
      minimumSubtotalCents: coupon.minimumSubtotalCents,
    });
  }

  get(code: string): Coupon | undefined {
    const coupon = this.coupons.get(code.toUpperCase());

    if (!coupon) {
      return undefined;
    }

    return {
      code: coupon.code,
      percentOff: coupon.percentOff,
      active: coupon.active,
      minimumSubtotalCents: coupon.minimumSubtotalCents,
    };
  }
}

class InventoryLedger {
  private available = new Map<string, number>();
  private reserved = new Map<string, number>();

  setAvailable(sku: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error("Inventory quantity must be a non-negative integer");
    }

    this.available.set(normalizeSku(sku), quantity);
  }

  getAvailable(sku: string): number {
    return this.available.get(normalizeSku(sku)) ?? 0;
  }

  getReserved(sku: string): number {
    return this.reserved.get(normalizeSku(sku)) ?? 0;
  }

  reserve(sku: string, quantity: number): void {
    const key = normalizeSku(sku);
    const currentAvailable = this.available.get(key) ?? 0;

    if (!isPositiveInteger(quantity)) {
      throw new Error(`Invalid reserve quantity for ${key}`);
    }

    if (currentAvailable < quantity) {
      throw new Error(`Insufficient inventory for ${key}`);
    }

    this.available.set(key, currentAvailable - quantity);
    this.reserved.set(key, (this.reserved.get(key) ?? 0) + quantity);
  }

  release(sku: string, quantity: number): void {
    const key = normalizeSku(sku);
    const currentReserved = this.reserved.get(key) ?? 0;

    if (!isPositiveInteger(quantity)) {
      throw new Error(`Invalid release quantity for ${key}`);
    }

    if (currentReserved < quantity) {
      throw new Error(`Insufficient reserved inventory for ${key}`);
    }

    this.reserved.set(key, currentReserved - quantity);
    this.available.set(key, (this.available.get(key) ?? 0) + quantity);
  }

  commit(sku: string, quantity: number): void {
    const key = normalizeSku(sku);
    const currentReserved = this.reserved.get(key) ?? 0;

    if (!isPositiveInteger(quantity)) {
      throw new Error(`Invalid commit quantity for ${key}`);
    }

    if (currentReserved < quantity) {
      throw new Error(`Insufficient reserved inventory for ${key}`);
    }

    this.reserved.set(key, currentReserved - quantity);
  }
}

class OrderRepository {
  private orders = new Map<string, Order>();

  save(order: Order): void {
    this.orders.set(order.id, cloneOrder(order));
  }

  get(orderId: string): Order {
    const order = this.orders.get(orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    return cloneOrder(order);
  }

  update(order: Order): Order {
    this.save(order);
    return this.get(order.id);
  }

  all(): Order[] {
    return [...this.orders.values()].map(cloneOrder);
  }
}

class TaxCalculator {
  constructor(private readonly rateBasisPoints: number) {}

  calculate(items: LineItem[]): number {
    const taxableSubtotal = items.reduce((sum, item) => {
      if (!item.taxable) {
        return sum;
      }

      return sum + item.unitPriceCents * item.quantity;
    }, 0);

    return Math.round(taxableSubtotal * (this.rateBasisPoints / 10000));
  }
}

class ShippingCalculator {
  calculate(items: LineItem[]): number {
    const shippableQuantity = items.reduce((sum, item) => {
      if (!item.shippable) {
        return sum;
      }

      return sum + item.quantity;
    }, 0);

    if (shippableQuantity === 0) {
      return 0;
    }

    if (shippableQuantity <= 2) {
      return 599;
    }

    if (shippableQuantity <= 5) {
      return 899;
    }

    return 1299;
  }
}

class PricingService {
  constructor(
    private readonly coupons: CouponRepository,
    private readonly tax: TaxCalculator,
    private readonly shipping: ShippingCalculator,
  ) {}

  price(order: Order): Order {
    const next = cloneOrder(order);

    next.subtotalCents = next.items.reduce((sum, item) => {
      return sum + item.unitPriceCents * item.quantity;
    }, 0);

    const coupon = next.couponCode
      ? this.coupons.get(next.couponCode)
      : undefined;

    if (
      coupon &&
      coupon.active &&
      next.subtotalCents >= coupon.minimumSubtotalCents
    ) {
      next.discountCents = Math.round(
        next.subtotalCents * (coupon.percentOff / 100),
      );
    } else {
      next.discountCents = 0;
    }

    next.taxCents = this.tax.calculate(next.items);
    next.shippingCents = this.shipping.calculate(next.items);
    next.totalCents =
      next.subtotalCents - next.discountCents + next.taxCents + next.shippingCents;

    return next;
  }
}

class OrderBuilder {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly catalog: ProductCatalog,
    private readonly pricing: PricingService,
    private readonly orders: OrderRepository,
  ) {}

  createOrder(orderId: string, customerId: string, currency: Currency): Order {
    const customer = this.customers.get(customerId);

    if (customer.blocked) {
      throw new Error(`Customer is blocked: ${customerId}`);
    }

    const order = makeOrder(orderId, customer.id, currency);
    order.audit.push("created");
    return this.orders.update(order);
  }

  addItem(orderId: string, sku: string, quantity: number): Order {
    if (!isPositiveInteger(quantity)) {
      throw new Error("Quantity must be a positive integer");
    }

    const order = this.orders.get(orderId);

    if (order.status !== "draft") {
      throw new Error(`Cannot modify order in status ${order.status}`);
    }

    const product = this.catalog.get(sku);

    if (!product.active) {
      throw new Error(`Product is inactive: ${sku}`);
    }

    const existing = order.items.find((item) => item.sku === product.sku);

    if (existing) {
      existing.quantity += quantity;
    } else {
      order.items.push({
        sku: product.sku,
        quantity,
        unitPriceCents: product.priceCents,
        taxable: product.taxable,
        shippable: product.shippable,
      });
    }

    order.audit.push("item_added");
    return this.orders.update(this.pricing.price(order));
  }

  applyCoupon(orderId: string, code: string): Order {
    const order = this.orders.get(orderId);

    if (order.status !== "draft") {
      throw new Error(`Cannot modify order in status ${order.status}`);
    }

    order.couponCode = code.toUpperCase();
    order.audit.push("coupon_applied");
    return this.orders.update(this.pricing.price(order));
  }

  validate(orderId: string): Order {
    const order = this.orders.get(orderId);

    if (order.items.length === 0) {
      throw new Error("Order must contain at least one item");
    }

    if (order.totalCents <= 0) {
      throw new Error("Order total must be greater than zero");
    }

    order.status = "validated";
    order.audit.push("validated");
    return this.orders.update(order);
  }
}

class ShipmentService {
  private shipped = new Set<string>();

  markReady(order: Order): Order {
    const next = cloneOrder(order);

    if (!next.items.some((item) => item.shippable)) {
      next.shipmentStatus = "not_required";
      return next;
    }

    next.shipmentStatus = "ready";
    next.audit.push("shipment_ready");
    return next;
  }

  ship(order: Order): Order {
    const next = cloneOrder(order);

    if (next.shipmentStatus !== "ready") {
      throw new Error(`Shipment is not ready for ${next.id}`);
    }

    this.shipped.add(next.id);
    next.shipmentStatus = "shipped";
    next.audit.push("shipped");
    return next;
  }

  hasShipped(orderId: string): boolean {
    return this.shipped.has(orderId);
  }
}

class EmailService {
  private sent: string[] = [];

  sendReceipt(order: Order): void {
    this.sent.push(`receipt:${order.id}:${formatMoney(order.totalCents, order.currency)}`);
  }

  sendRefund(order: Order): void {
    this.sent.push(`refund:${order.id}`);
  }

  sendCancellation(order: Order): void {
    this.sent.push(`cancelled:${order.id}`);
  }

  messages(): string[] {
    return [...this.sent];
  }
}

class AuditReporter {
  summarize(order: Order): string {
    return `${order.id}:${order.status}:${order.audit.join(">")}`;
  }

  hasEvent(order: Order, event: string): boolean {
    return order.audit.includes(event);
  }

  countEvent(order: Order, event: string): number {
    return order.audit.filter((entry) => entry === event).length;
  }
}

class FakePaymentGateway {
  private charges: Charge[] = [];
  private refunds: Refund[] = [];
  private nextChargeId = 1;
  private nextRefundId = 1;
  private failingCustomers = new Set<string>();

  failCustomer(customerId: string): void {
    this.failingCustomers.add(customerId);
  }

  async charge(
    orderId: string,
    customerId: string,
    amountCents: number,
    currency: Currency,
  ): Promise<string> {
    await delay(20);

    if (this.failingCustomers.has(customerId)) {
      throw new Error(`Payment declined for ${customerId}`);
    }

    const ref = `ch_${String(this.nextChargeId).padStart(6, "0")}`;
    this.nextChargeId += 1;

    this.charges.push({
      ref,
      orderId,
      customerId,
      amountCents,
      currency,
    });

    return ref;
  }

  async refund(
    orderId: string,
    chargeRef: string,
    amountCents: number,
  ): Promise<string> {
    await delay(20);

    const ref = `rf_${String(this.nextRefundId).padStart(6, "0")}`;
    this.nextRefundId += 1;

    this.refunds.push({
      ref,
      orderId,
      chargeRef,
      amountCents,
    });

    return ref;
  }

  chargesForOrder(orderId: string): Charge[] {
    return this.charges.filter((charge) => charge.orderId === orderId);
  }

  refundsForOrder(orderId: string): Refund[] {
    return this.refunds.filter((refund) => refund.orderId === orderId);
  }
}

class CheckoutFacade {
  constructor(
    private readonly orders: OrderRepository,
    private readonly inventory: InventoryLedger,
    private readonly pricing: PricingService,
    private readonly payments: FakePaymentGateway,
    private readonly shipments: ShipmentService,
    private readonly emails: EmailService,
  ) {}

  async reserve(orderId: string): Promise<Order> {
    let order = this.orders.get(orderId);

    if (order.status !== "validated") {
      throw new Error(`Cannot reserve order in status ${order.status}`);
    }

    for (const item of order.items) {
      this.inventory.reserve(item.sku, item.quantity);
    }

    order.status = "reserved";
    order.audit.push("reserved");
    order = this.orders.update(order);
    return order;
  }

  async cancel(orderId: string): Promise<Order> {
    let order = this.orders.get(orderId);

    if (order.status === "paid") {
      throw new Error("Paid orders must be refunded");
    }

    if (order.status === "cancelled") {
      return order;
    }

    if (order.status === "reserved" || order.status === "pending_payment") {
      for (const item of order.items) {
        this.inventory.release(item.sku, item.quantity);
      }
    }

    order.status = "cancelled";
    order.audit.push("cancelled");
    order = this.orders.update(order);
    this.emails.sendCancellation(order);
    return order;
  }

  async markShipmentReady(orderId: string): Promise<Order> {
    const order = this.orders.get(orderId);

    if (order.status !== "paid") {
      throw new Error(`Order must be paid before shipment: ${orderId}`);
    }

    const next = this.shipments.markReady(order);
    return this.orders.update(next);
  }

  async ship(orderId: string): Promise<Order> {
    const order = this.orders.get(orderId);
    const next = this.shipments.ship(order);
    return this.orders.update(next);
  }

  async pay(orderId: string): Promise<Order> {
    let order = this.orders.get(orderId);

    if (order.status === "paid") {
      return order;
    }

    if (order.status === "draft") {
      throw new Error("Order must be validated before payment");
    }

    if (order.status === "validated") {
      for (const item of order.items) {
        this.inventory.reserve(item.sku, item.quantity);
      }

      order.status = "reserved";
      order.audit.push("reserved");
      order = this.orders.update(order);
    }

    if (order.status !== "reserved" && order.status !== "pending_payment") {
      throw new Error(`Cannot pay order in status ${order.status}`);
    }

    order.status = "pending_payment";
    order.audit.push("payment_started");
    order = this.orders.update(this.pricing.price(order));

    const paymentRef = await this.payments.charge(
      order.id,
      order.customerId,
      order.totalCents,
      order.currency,
    );

    for (const item of order.items) {
      this.inventory.commit(item.sku, item.quantity);
    }

    order.paymentRef = paymentRef;
    order.status = "paid";
    order.audit.push("payment_captured");
    order = this.orders.update(order);
    this.emails.sendReceipt(order);
    return order;
  }

  async refund(orderId: string): Promise<Order> {
    let order = this.orders.get(orderId);

    if (order.status === "refunded") {
      return order;
    }

    if (order.status !== "paid") {
      throw new Error(`Order is not refundable in status ${order.status}`);
    }

    if (!order.paymentRef) {
      throw new Error(`Missing payment reference for ${order.id}`);
    }

    const refundRef = await this.payments.refund(
      order.id,
      order.paymentRef,
      order.totalCents,
    );

    order.refundRef = refundRef;
    order.status = "refunded";
    order.audit.push("refunded");
    order = this.orders.update(order);
    this.emails.sendRefund(order);
    return order;
  }
}

const setupSystem = () => {
  const customers = new CustomerRepository();
  const catalog = new ProductCatalog();
  const coupons = new CouponRepository();
  const inventory = new InventoryLedger();
  const orders = new OrderRepository();
  const tax = new TaxCalculator(825);
  const shipping = new ShippingCalculator();
  const pricing = new PricingService(coupons, tax, shipping);
  const builder = new OrderBuilder(customers, catalog, pricing, orders);
  const gateway = new FakePaymentGateway();
  const shipments = new ShipmentService();
  const emails = new EmailService();
  const checkout = new CheckoutFacade(
    orders,
    inventory,
    pricing,
    gateway,
    shipments,
    emails,
  );

  customers.save(makeCustomer("cust_001", "first@example.com"));
  customers.save(makeCustomer("cust_002", "second@example.com"));
  customers.save(makeCustomer("cust_fail", "fail@example.com"));

  catalog.add(makeProduct("sku_keyboard", "Keyboard", 5000));
  catalog.add(makeProduct("sku_mouse", "Mouse", 2500));
  catalog.add(makeProduct("sku_monitor", "Monitor", 20000));
  catalog.add(makeProduct("sku_warranty", "Warranty", 3000, false, false));

  coupons.save({
    code: "SAVE10",
    percentOff: 10,
    active: true,
    minimumSubtotalCents: 1000,
  });

  inventory.setAvailable("sku_keyboard", 100);
  inventory.setAvailable("sku_mouse", 100);
  inventory.setAvailable("sku_monitor", 100);
  inventory.setAvailable("sku_warranty", 1000);

  return {
    customers,
    catalog,
    coupons,
    inventory,
    orders,
    pricing,
    builder,
    gateway,
    shipments,
    emails,
    checkout,
  };
};

describe("customer repository", () => {
  test("stores and retrieves customers", () => {
    const repo = new CustomerRepository();
    repo.save(makeCustomer("cust_test", "TEST@EXAMPLE.COM"));

    const customer = repo.get("cust_test");

    expect(customer.email).toBe("test@example.com");
    expect(repo.exists("cust_test")).toBe(true);
  });

  test("returns defensive copies", () => {
    const repo = new CustomerRepository();
    repo.save(makeCustomer("cust_copy", "copy@example.com"));

    const first = repo.get("cust_copy");
    first.email = "changed@example.com";

    const second = repo.get("cust_copy");

    expect(second.email).toBe("copy@example.com");
  });
});

describe("product catalog", () => {
  test("normalizes sku values", () => {
    const catalog = new ProductCatalog();
    catalog.add(makeProduct(" abc-123 ", "Test", 1000));

    expect(catalog.get("ABC-123").sku).toBe("ABC-123");
  });

  test("hides inactive products from active listing", () => {
    const catalog = new ProductCatalog();
    catalog.add(makeProduct("sku_a", "A", 1000));
    catalog.add(makeProduct("sku_b", "B", 1000));
    catalog.deactivate("sku_b");

    expect(catalog.allActive().map((product) => product.sku)).toEqual(["SKU_A"]);
  });
});

describe("pricing service", () => {
  test("prices taxable and shippable items", () => {
    const coupons = new CouponRepository();
    const pricing = new PricingService(
      coupons,
      new TaxCalculator(1000),
      new ShippingCalculator(),
    );

    const order = makeOrder("ord_price_1", "cust_001");
    order.items.push({
      sku: "SKU_A",
      quantity: 2,
      unitPriceCents: 1000,
      taxable: true,
      shippable: true,
    });

    const priced = pricing.price(order);

    expect(priced.subtotalCents).toBe(2000);
    expect(priced.taxCents).toBe(200);
    expect(priced.shippingCents).toBe(599);
    expect(priced.totalCents).toBe(2799);
  });

  test("applies active coupons", () => {
    const coupons = new CouponRepository();
    coupons.save({
      code: "SAVE25",
      percentOff: 25,
      active: true,
      minimumSubtotalCents: 1000,
    });

    const pricing = new PricingService(
      coupons,
      new TaxCalculator(0),
      new ShippingCalculator(),
    );

    const order = makeOrder("ord_price_2", "cust_001");
    order.couponCode = "save25";
    order.items.push({
      sku: "SKU_A",
      quantity: 4,
      unitPriceCents: 1000,
      taxable: true,
      shippable: false,
    });

    const priced = pricing.price(order);

    expect(priced.discountCents).toBe(1000);
    expect(priced.totalCents).toBe(3000);
  });
});

describe("order builder", () => {
  test("creates and validates an order", () => {
    const system = setupSystem();

    system.builder.createOrder("ord_builder_1", "cust_001", "USD");
    system.builder.addItem("ord_builder_1", "sku_keyboard", 1);
    const order = system.builder.validate("ord_builder_1");

    expect(order.status).toBe("validated");
    expect(order.totalCents).toBeGreaterThan(0);
  });

  test("does not validate empty order", () => {
    const system = setupSystem();

    system.builder.createOrder("ord_builder_2", "cust_001", "USD");

    expect(() => system.builder.validate("ord_builder_2")).toThrow(
      "Order must contain at least one item",
    );
  });
});

describe("inventory ledger", () => {
  test("reserves and releases stock", () => {
    const ledger = new InventoryLedger();
    ledger.setAvailable("sku_a", 5);

    ledger.reserve("sku_a", 2);

    expect(ledger.getAvailable("sku_a")).toBe(3);
    expect(ledger.getReserved("sku_a")).toBe(2);

    ledger.release("sku_a", 2);

    expect(ledger.getAvailable("sku_a")).toBe(5);
    expect(ledger.getReserved("sku_a")).toBe(0);
  });

  test("commits stock", () => {
    const ledger = new InventoryLedger();
    ledger.setAvailable("sku_a", 5);

    ledger.reserve("sku_a", 2);
    ledger.commit("sku_a", 2);

    expect(ledger.getAvailable("sku_a")).toBe(3);
    expect(ledger.getReserved("sku_a")).toBe(0);
  });
});

describe("checkout normal flows", () => {
  test("pays a simple order", async () => {
    const system = setupSystem();

    system.builder.createOrder("ord_flow_1", "cust_001", "USD");
    system.builder.addItem("ord_flow_1", "sku_keyboard", 1);
    system.builder.validate("ord_flow_1");

    const paid = await system.checkout.pay("ord_flow_1");

    expect(paid.status).toBe("paid");
    expect(paid.paymentRef).toMatch(/^ch_/);
    expect(system.gateway.chargesForOrder("ord_flow_1")).toHaveLength(1);
  });

  test("can mark a paid order ready for shipment", async () => {
    const system = setupSystem();

    system.builder.createOrder("ord_flow_2", "cust_001", "USD");
    system.builder.addItem("ord_flow_2", "sku_mouse", 1);
    system.builder.validate("ord_flow_2");

    await system.checkout.pay("ord_flow_2");
    const ready = await system.checkout.markShipmentReady("ord_flow_2");

    expect(ready.shipmentStatus).toBe("ready");
  });

  test("can cancel a reserved order", async () => {
    const system = setupSystem();

    system.builder.createOrder("ord_flow_3", "cust_001", "USD");
    system.builder.addItem("ord_flow_3", "sku_monitor", 1);
    system.builder.validate("ord_flow_3");

    await system.checkout.reserve("ord_flow_3");
    const cancelled = await system.checkout.cancel("ord_flow_3");

    expect(cancelled.status).toBe("cancelled");
    expect(system.inventory.getAvailable("sku_monitor")).toBe(100);
  });
});

describe("audit reporter", () => {
  test("summarizes audit state", () => {
    const reporter = new AuditReporter();
    const order = makeOrder("ord_audit_1", "cust_001");
    order.status = "validated";
    order.audit.push("created", "item_added", "validated");

    expect(reporter.summarize(order)).toBe(
      "ord_audit_1:validated:created>item_added>validated",
    );
    expect(reporter.hasEvent(order, "created")).toBe(true);
    expect(reporter.countEvent(order, "created")).toBe(1);
  });
});

describe("long-file bottom checks", () => {
  test("failed payment should restore order and inventory state", async () => {
    const system = setupSystem();

    system.gateway.failCustomer("cust_fail");

    system.builder.createOrder("ord_bottom_1", "cust_fail", "USD");
    system.builder.addItem("ord_bottom_1", "sku_keyboard", 2);
    system.builder.validate("ord_bottom_1");

    await expect(system.checkout.pay("ord_bottom_1")).rejects.toThrow(
      "Payment declined",
    );

    const order = system.orders.get("ord_bottom_1");

    expect(order.status).toBe("validated");
    expect(order.paymentRef).toBeUndefined();
    expect(system.inventory.getAvailable("sku_keyboard")).toBe(100);
    expect(system.inventory.getReserved("sku_keyboard")).toBe(0);
  });

  test("overlapping payments should only create one charge", async () => {
    const system = setupSystem();

    system.builder.createOrder("ord_bottom_2", "cust_001", "USD");
    system.builder.addItem("ord_bottom_2", "sku_mouse", 1);
    system.builder.validate("ord_bottom_2");

    const results = await Promise.all(
      Array.from({ length: 10 }, async () => system.checkout.pay("ord_bottom_2")),
    );

    const charges = system.gateway.chargesForOrder("ord_bottom_2");

    expect(charges).toHaveLength(1);
    expect(new Set(results.map((order) => order.paymentRef)).size).toBe(1);
    expect(system.inventory.getAvailable("sku_mouse")).toBe(99);
    expect(system.inventory.getReserved("sku_mouse")).toBe(0);
  });

  test("overlapping refunds should only create one refund", async () => {
    const system = setupSystem();

    system.builder.createOrder("ord_bottom_3", "cust_002", "USD");
    system.builder.addItem("ord_bottom_3", "sku_monitor", 1);
    system.builder.validate("ord_bottom_3");

    await system.checkout.pay("ord_bottom_3");

    const results = await Promise.all(
      Array.from({ length: 10 }, async () =>
        system.checkout.refund("ord_bottom_3"),
      ),
    );

    const refunds = system.gateway.refundsForOrder("ord_bottom_3");

    expect(refunds).toHaveLength(1);
    expect(new Set(results.map((order) => order.refundRef)).size).toBe(1);
  });
});
