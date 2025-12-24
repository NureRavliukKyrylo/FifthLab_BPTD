import axios from "axios";

export type MeResponse =
  | { success: true; data: { id: string; email: string; name: string; picture?: string | null; email_verified: boolean } }
  | { success: false; error: string };

export type Product = {
  _id?: string;
  id?: string;
  title: string;
  description: string;
  image_url: string;
  price: number;
  quantity: number;
};

export type OrderItem = {
  product_id: string;
  qty: number;
  unit_price: number;
};

export type Order = {
  _id?: string;
  id?: string;
  order_id: string;
  user_id: string;
  items: OrderItem[];
  amount: number;
  currency: string;
  description: string;
  status: string;
  provider?: string | null;
  transaction_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type InitPaymentResponse = {
  order_id: string;
  liqpay: { action: string; data: string; signature: string };
  liqpay_action: string;
  liqpay_fields: Record<string, unknown>;
};

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

export async function getMe(): Promise<MeResponse> {
  const res = await api.get("/users/me");
  return res.data as MeResponse;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function getProducts(): Promise<Product[]> {
  const res = await api.get("/products");
  return res.data as Product[];
}

export async function initPayment(args: {
  productId: string;
  qty: number;
  currency?: string;
  description?: string;
  type?: string;
}): Promise<InitPaymentResponse> {
  const res = await api.post("/payments/liqpay/init", {
    items: [{ product_id: args.productId, qty: args.qty }],
    currency: args.currency ?? "UAH",
    description: args.description ?? "Buying product1",
    type: args.type ?? "buy",
  });
  return res.data as InitPaymentResponse;
}

export async function getOrder(orderId: string): Promise<Order> {
  const res = await api.get(`/payments/orders/${encodeURIComponent(orderId)}`);
  return res.data as Order;
}

export function submitLiqPayCheckout(action: string, data: string, signature: string): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;

  const inData = document.createElement("input");
  inData.type = "hidden";
  inData.name = "data";
  inData.value = data;

  const inSig = document.createElement("input");
  inSig.type = "hidden";
  inSig.name = "signature";
  inSig.value = signature;

  form.appendChild(inData);
  form.appendChild(inSig);

  document.body.appendChild(form);
  form.submit();
}
