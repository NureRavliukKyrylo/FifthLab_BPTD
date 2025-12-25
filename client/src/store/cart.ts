export type CartItem = {
  productId: string;
  title: string;
  price: number;
  imageUrl?: string;
  qty: number;
  maxQty?: number;
};

const KEY = "fl_cart_v1";

function safeParse(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalize(items: any): CartItem[] {
  if (!Array.isArray(items)) return [];
  const out: CartItem[] = [];
  for (const it of items) {
    const productId = String(it?.productId || "").trim();
    if (!productId) continue;
    const title = String(it?.title || "Product").trim() || "Product";
    const price = Number(it?.price || 0);
    const imageUrl = String(it?.imageUrl || "").trim() || undefined;

    const maxQtyRaw = it?.maxQty;
    const maxQty = maxQtyRaw === undefined || maxQtyRaw === null ? undefined : Math.max(0, Math.trunc(Number(maxQtyRaw) || 0));

    const qtyRaw = Number(it?.qty || 1);
    const qty = Math.max(1, Math.trunc(Number.isFinite(qtyRaw) ? qtyRaw : 1));
    const clampedQty = maxQty !== undefined && maxQty > 0 ? Math.min(qty, maxQty) : qty;

    out.push({ productId, title, price: Number.isFinite(price) ? price : 0, imageUrl, qty: clampedQty, maxQty });
  }
  return out;
}

function write(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function getCart(): CartItem[] {
  const raw = safeParse(localStorage.getItem(KEY));
  return normalize(raw);
}

export function getCartCount(): number {
  const items = getCart();
  return items.reduce((acc, it) => acc + Math.max(0, Math.trunc(Number(it.qty || 0))), 0);
}

export function clearCart(): void {
  write([]);
}

export function removeFromCart(productId: string): void {
  const id = String(productId || "").trim();
  if (!id) return;
  const next = getCart().filter((x) => x.productId !== id);
  write(next);
}

export function updateQty(productId: string, qty: number, maxQty?: number): void {
  const id = String(productId || "").trim();
  if (!id) return;

  const nextQty = Math.max(0, Math.trunc(Number(qty || 0)));
  const max = maxQty === undefined || maxQty === null ? undefined : Math.max(0, Math.trunc(Number(maxQty) || 0));

  const items = getCart();
  const idx = items.findIndex((x) => x.productId === id);
  if (idx < 0) return;

  if (nextQty <= 0) {
    items.splice(idx, 1);
    write(items);
    return;
  }

  const clamped = max !== undefined && max > 0 ? Math.min(nextQty, max) : nextQty;
  items[idx] = { ...items[idx], qty: clamped, maxQty: max ?? items[idx].maxQty };
  write(items);
}

export function addToCart(item: CartItem): void {
  const productId = String(item?.productId || "").trim();
  if (!productId) return;

  const title = String(item?.title || "Product").trim() || "Product";
  const price = Number(item?.price || 0);
  const imageUrl = String(item?.imageUrl || "").trim() || undefined;

  const maxQtyRaw = item?.maxQty;
  const maxQty = maxQtyRaw === undefined || maxQtyRaw === null ? undefined : Math.max(0, Math.trunc(Number(maxQtyRaw) || 0));

  const qtyRaw = Number(item?.qty || 1);
  const qty = Math.max(1, Math.trunc(Number.isFinite(qtyRaw) ? qtyRaw : 1));

  const items = getCart();
  const idx = items.findIndex((x) => x.productId === productId);

  if (idx >= 0) {
    const curr = items[idx];
    const mergedMax = maxQty !== undefined ? maxQty : curr.maxQty;
    const mergedQtyRaw = (curr.qty || 0) + qty;
    const mergedQty = mergedMax !== undefined && mergedMax > 0 ? Math.min(mergedQtyRaw, mergedMax) : mergedQtyRaw;

    items[idx] = {
      ...curr,
      title,
      price: Number.isFinite(price) ? price : curr.price,
      imageUrl: imageUrl ?? curr.imageUrl,
      qty: Math.max(1, mergedQty),
      maxQty: mergedMax,
    };
  } else {
    const clampedQty = maxQty !== undefined && maxQty > 0 ? Math.min(qty, maxQty) : qty;
    items.push({
      productId,
      title,
      price: Number.isFinite(price) ? price : 0,
      imageUrl,
      qty: Math.max(1, clampedQty),
      maxQty,
    });
  }

  write(items);
}
