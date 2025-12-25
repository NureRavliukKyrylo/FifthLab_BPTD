import "../styles/CartPage.css";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiLogIn,
  FiPackage,
  FiRefreshCcw,
  FiShield,
  FiShoppingCart,
  FiTrash2,
  FiX,
  FiAlertTriangle,
  FiXCircle,
  FiUser,
} from "react-icons/fi";
import {
  clearCart,
  getCart,
  getCartCount,
  removeFromCart,
  updateQty,
  type CartItem,
} from "../store/cart";

const api = axios.create({
  baseURL: "http://localhost:8000",
  withCredentials: true,
});

function moneyUAH(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  return `${formatted} ₴`;
}

function clampInt(v: number, min: number, max: number) {
  const n = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, n));
}

function stockMeta(maxQty: number) {
  if (maxQty <= 0) return { kind: "out" as const, label: "Out of stock", Icon: FiXCircle };
  if (maxQty <= 3) return { kind: "low" as const, label: "Low stock", Icon: FiAlertTriangle };
  return { kind: "in" as const, label: "In stock", Icon: FiCheckCircle };
}

type AuthState = "unknown" | "authed" | "guest";

type MeResponse =
  | { success: true; data: { id: string; email: string; name: string; picture?: string | null; email_verified: boolean } }
  | { success: false; error: string };

function safeReturnTo(v: unknown, fallback: string) {
  const s = String(v || "").trim();
  if (!s) return fallback;
  if (!s.startsWith("/")) return fallback;
  if (s.startsWith("/login")) return fallback;
  return s;
}

export function CartPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [items, setItems] = useState<CartItem[]>(() => getCart());
  const [cartCount, setCartCount] = useState<number>(() => getCartCount());
  const [toast, setToast] = useState<string | null>(null);

  const [auth, setAuth] = useState<AuthState>("unknown");
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [profilePic, setProfilePic] = useState<string | null>(null);

  const [loadingPay, setLoadingPay] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    const onStorage = () => {
      setItems(getCart());
      setCartCount(getCartCount());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1700);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setCheckingAuth(true);
        const r = await api.get<MeResponse>("/users/me");
        if (!mounted) return;

        if (r?.data && "success" in r.data && r.data.success) {
          setAuth("authed");
          const pic = String(r.data.data.picture || "").trim();
          setProfilePic(pic ? pic : null);

          const pending = sessionStorage.getItem("fl_return_to");
          if (pending) {
            const here = `${location.pathname}${location.search}`;
            const target = safeReturnTo(pending, "");
            if (target && target !== here) navigate(target, { replace: true });
            sessionStorage.removeItem("fl_return_to");
          }
        } else {
          setAuth("guest");
          setProfilePic(null);
        }
      } catch {
        if (!mounted) return;
        setAuth("guest");
        setProfilePic(null);
      } finally {
        if (!mounted) return;
        setCheckingAuth(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [location.pathname, location.search, navigate]);

  const totals = useMemo(() => {
    const count = items.reduce((acc, it) => acc + clampInt(it.qty, 0, 9999), 0);
    const subtotal = items.reduce((acc, it) => {
      const p = Number(it.price || 0);
      const q = clampInt(it.qty, 0, 9999);
      return acc + (Number.isFinite(p) ? p * q : 0);
    }, 0);
    return { count, subtotal };
  }, [items]);

  const onDec = (it: CartItem) => {
    const max = Math.max(0, it.maxQty ?? 9999);
    const next = clampInt((it.qty ?? 1) - 1, 0, max || 0);
    if (next <= 0) {
      removeFromCart(it.productId);
      setToast("Removed");
    } else {
      updateQty(it.productId, next, it.maxQty);
    }
    setItems(getCart());
    setCartCount(getCartCount());
  };

  const onInc = (it: CartItem) => {
    const max = Math.max(0, it.maxQty ?? 9999);
    if (max > 0 && (it.qty ?? 1) >= max) {
      setToast("Stock limit reached");
      return;
    }
    const next = clampInt((it.qty ?? 1) + 1, 1, max > 0 ? max : 9999);
    updateQty(it.productId, next, it.maxQty);
    setItems(getCart());
    setCartCount(getCartCount());
  };

  const onRemove = (it: CartItem) => {
    removeFromCart(it.productId);
    setItems(getCart());
    setCartCount(getCartCount());
    setToast("Removed");
  };

  const onClear = () => {
    clearCart();
    setItems(getCart());
    setCartCount(getCartCount());
    setToast("Cart cleared");
  };

  const submitLiqPay = (action: string, data: string, signature: string) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = action;

    const i1 = document.createElement("input");
    i1.type = "hidden";
    i1.name = "data";
    i1.value = data;

    const i2 = document.createElement("input");
    i2.type = "hidden";
    i2.name = "signature";
    i2.value = signature;

    form.appendChild(i1);
    form.appendChild(i2);

    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  const checkout = async () => {
    setPayError(null);

    if (!items.length) {
      setToast("Your cart is empty");
      return;
    }

    if (auth !== "authed") {
      setToast("Please sign in to checkout");
      return;
    }

    const payload = {
      items: items.map((it) => ({
        product_id: it.productId,
        qty: clampInt(it.qty ?? 1, 1, Math.max(1, it.maxQty ?? 9999)),
      })),
      currency: "UAH",
      description: "Order payment",
      type: "buy",
    };

    try {
      setLoadingPay(true);
      const r = await api.post("/payments/liqpay/init", payload);
      const data = r?.data;

      const orderId = String(data?.order_id || "").trim();
      const action = String(data?.liqpay?.action || "").trim();
      const liqData = String(data?.liqpay?.data || "").trim();
      const sig = String(data?.liqpay?.signature || "").trim();

      if (!orderId || !action || !liqData || !sig) throw new Error("Invalid checkout payload");

      localStorage.setItem("fl_last_order_id", orderId);
      submitLiqPay(action, liqData, sig);
    } catch (e: any) {
      const msg = String(e?.response?.data?.detail || e?.message || "Checkout failed").trim() || "Checkout failed";
      setPayError(msg);
      setToast("Checkout failed");
    } finally {
      setLoadingPay(false);
    }
  };

  const goLogin = () => {
    const from = `${location.pathname}${location.search}`;
    sessionStorage.setItem("fl_return_to", from);
    navigate("/login", { state: { from } });
  };

  return (
    <div className="ps-page">
      <div className="ps-shell">
        <header className="ps-top">
          <div className="ps-brand">
            <div className="ps-logo" aria-hidden="true">
              <span className="ps-logoText">FL</span>
            </div>
            <div className="ps-brandText">
              <div className="ps-brandName">ProductStore</div>
              <div className="ps-brandSub">Cart</div>
            </div>
          </div>

          <div className="ps-topRight">
            <Link className="ps-topBtn ps-topBtnSoft" to="/products" aria-label="Catalog">
              <FiPackage size={18} />
              <span>Catalog</span>
            </Link>

            <Link className="ps-topBtn ps-topBtnSoft" to="/cart" aria-label="Cart">
              <FiShoppingCart size={18} />
              <span>Cart</span>
              <span className="ps-count">{cartCount}</span>
            </Link>

            {auth === "authed" ? (
              <Link
                to="/login"
                aria-label="Profile"
                className="ps-topBtn ps-topBtnSoft"
                style={{ padding: 6, width: 44, justifyContent: "center" }}
              >
                {profilePic ? (
                  <img
                    src={profilePic}
                    alt="Profile"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(11,18,32,0.04)",
                      border: "1px solid rgba(15,23,42,0.10)",
                    }}
                  >
                    <FiUser size={18} />
                  </span>
                )}
              </Link>
            ) : (
              <button className="ps-topBtn ps-topBtnPrimary" type="button" onClick={goLogin} disabled={checkingAuth}>
                <FiLogIn size={18} />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </header>

        <div className="cp-head">
          <div className="cp-titleRow">
            <div className="cp-titleLeft">
              <Link className="cp-back" to="/products" aria-label="Back to catalog">
                <FiArrowLeft size={16} />
                <span>Back</span>
              </Link>
              <div>
                <div className="cp-h1">Your cart</div>
                <div className="cp-sub">
                  {items.length ? `${totals.count} item(s) • ${moneyUAH(totals.subtotal)}` : "Add products to start checkout."}
                </div>
              </div>
            </div>

            <div className="cp-headActions">
              <button className="cp-headBtn" type="button" onClick={() => window.location.reload()}>
                <FiRefreshCcw size={18} />
                <span>Refresh</span>
              </button>

              <button className="cp-headBtn cp-headBtnDanger" type="button" onClick={onClear} disabled={!items.length}>
                <FiTrash2 size={18} />
                <span>Clear</span>
              </button>
            </div>
          </div>
        </div>

        <main className="cp-grid">
          <section className="cp-list" aria-label="Cart items">
            {!items.length && (
              <div className="cp-empty">
                <div className="cp-emptyIcon">
                  <FiShoppingCart size={22} />
                </div>
                <div className="cp-emptyTitle">Cart is empty</div>
                <div className="cp-emptyText">Browse the catalog and add products to checkout.</div>
                <div className="cp-emptyActions">
                  <Link className="cp-btn cp-btnPrimary" to="/products">
                    <FiPackage size={18} />
                    <span>Open catalog</span>
                  </Link>
                </div>
              </div>
            )}

            {!!items.length && (
              <div className="cp-cards">
                {items.map((it) => {
                  const maxQty = Math.max(0, it.maxQty ?? 0);
                  const q = clampInt(it.qty ?? 1, 1, maxQty > 0 ? maxQty : 9999);
                  const unit = Number(it.price || 0);
                  const line = (Number.isFinite(unit) ? unit : 0) * q;
                  const sm = stockMeta(maxQty);

                  return (
                    <article className="cp-item" key={it.productId}>
                      <div className="cp-thumb">
                        {String(it.imageUrl || "").trim() ? (
                          <img className="cp-img" src={it.imageUrl} alt={it.title} loading="lazy" />
                        ) : (
                          <div className="cp-imgPh">No image</div>
                        )}
                      </div>

                      <div className="cp-mid">
                        <div className="cp-rowTop">
                          <div className="cp-nameWrap">
                            <Link className="cp-name" to={`/products/${it.productId}`}>
                              {it.title}
                            </Link>
                            <div className="cp-meta">
                              <span className="cp-pill" data-kind={sm.kind}>
                                <sm.Icon size={15} />
                                <span>{sm.label}</span>
                                <span className="cp-pillNum">{Math.max(0, maxQty)}</span>
                              </span>
                            </div>
                          </div>

                          <button className="cp-x" type="button" onClick={() => onRemove(it)} aria-label="Remove">
                            <FiX size={18} />
                          </button>
                        </div>

                        <div className="cp-rowBottom">
                          <div className="cp-priceCol">
                            <div className="cp-priceKey">Unit</div>
                            <div className="cp-priceVal">{moneyUAH(unit)}</div>
                          </div>

                          <div className="cp-qtyCol" aria-label="Quantity control">
                            <button className="cp-qtyBtn" type="button" onClick={() => onDec(it)} aria-label="Decrease">
                              –
                            </button>
                            <div className="cp-qtyVal">{q}</div>
                            <button
                              className="cp-qtyBtn"
                              type="button"
                              onClick={() => onInc(it)}
                              aria-label="Increase"
                              disabled={maxQty > 0 ? q >= maxQty : false}
                            >
                              +
                            </button>
                          </div>

                          <div className="cp-totalCol">
                            <div className="cp-priceKey">Subtotal</div>
                            <div className="cp-totalVal">{moneyUAH(line)}</div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="cp-side" aria-label="Order summary">
            <div className="cp-sumCard">
              <div className="cp-sumTitle">
                <FiShield size={18} />
                <span>Order summary</span>
              </div>

              <div className="cp-sumRows">
                <div className="cp-sumRow">
                  <span className="cp-sumKey">Items</span>
                  <span className="cp-sumVal">{totals.count}</span>
                </div>
                <div className="cp-sumRow">
                  <span className="cp-sumKey">Subtotal</span>
                  <span className="cp-sumVal">{moneyUAH(totals.subtotal)}</span>
                </div>

                <div className="cp-sumSep" />

                <div className="cp-sumRow cp-sumRowTotal">
                  <span className="cp-sumKey">Total</span>
                  <span className="cp-sumVal">{moneyUAH(totals.subtotal)}</span>
                </div>
              </div>

              {payError && (
                <div className="cp-payError" role="alert">
                  {payError}
                </div>
              )}

              <div className="cp-checkoutArea">
                {auth !== "authed" ? (
                  <button className="cp-checkout cp-checkoutSoft" type="button" onClick={goLogin} disabled={checkingAuth}>
                    <FiLogIn size={18} />
                    <span>Sign in to checkout</span>
                  </button>
                ) : (
                  <button
                    className="cp-checkout cp-checkoutPrimary"
                    type="button"
                    onClick={checkout}
                    disabled={loadingPay || !items.length}
                  >
                    <FiShield size={18} />
                    <span>{loadingPay ? "Redirecting…" : "Checkout"}</span>
                  </button>
                )}

                <Link className="cp-checkout cp-checkoutSoft" to="/products">
                  <FiPackage size={18} />
                  <span>Continue shopping</span>
                </Link>
              </div>
            </div>
          </aside>
        </main>

        {toast && <div className="ps-toast">{toast}</div>}
      </div>
    </div>
  );
}
