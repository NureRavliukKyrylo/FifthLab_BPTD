const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function listProducts() {
  const res = await fetch(`${API_BASE}/products/`, { method: "GET" });
  return jsonOrThrow(res);
}

export async function getProduct(productId: string) {
  const id = String(productId || "").trim();
  if (!id) throw new Error("product_id_required");
  const res = await fetch(`${API_BASE}/products/${encodeURIComponent(id)}`, { method: "GET" });
  return jsonOrThrow(res);
}
