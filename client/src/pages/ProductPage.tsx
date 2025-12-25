import "../styles/ProductPage.css";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiAlertTriangle,
  FiLogIn,
  FiShoppingCart,
  FiXCircle,
  FiUser,
} from "react-icons/fi";
import { getProduct } from "../api/products";
import type { Product } from "../types/models";
import { addToCart, getCartCount } from "../store/cart";

const api = axios.create({
  baseURL: "http://localhost:8000",
  withCredentials: true,
});

type AuthState = "unknown" | "authed" | "guest";

type MeResponse =
  | { success: true; data: { id: string; email: string; name: string; picture?: string | null; email_verified: boolean } }
  | { success: false; error: string };

function getProductId(p: Product): string {
  return String((p as any)._id || (p as any).id || "");
}

function moneyUAH(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  return `${formatted} ₴`;
}

function clampInt(v: number, min: number, max: number) {
  const n = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, n));
}

function stockMeta(qty: number) {
  if (qty <= 0) return { kind: "out" as const, label: "Out of stock", hint: "Temporarily unavailable", Icon: FiXCircle };
  if (qty <= 3) return { kind: "low" as const, label: "Low stock", hint: "Limited quantity", Icon: FiAlertTriangle };
  return { kind: "in" as const, label: "In stock", hint: "Available now", Icon: FiCheckCircle };
}

function safeReturnTo(v: unknown, fallback: string) {
  const s = String(v || "").trim();
  if (!s) return fallback;
  if (!s.startsWith("/")) return fallback;
  if (s.startsWith("/login")) return fallback;
  return s;
}

export function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [auth, setAuth] = useState<AuthState>("unknown");
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [profilePic, setProfilePic] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);

  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState<number>(() => getCartCount());

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

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const pid = String(id || "").trim();
        if (!pid) {
          setError("Product id is missing");
          setProduct(null);
          return;
        }

        const p = await getProduct(pid);
        if (!mounted) return;

        setProduct(p);

        const stock = Number.isFinite(Number(p?.quantity)) ? Number(p.quantity) : 0;
        setQty(stock > 0 ? 1 : 1);
      } catch (e: any) {
        if (!mounted) return;
        setError(String(e?.message || "Failed to load product"));
        setProduct(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    const onStorage = () => setCartCount(getCartCount());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const stock = useMemo(() => {
    if (!product) return 0;
    const v = Number(product.quantity || 0);
    return Number.isFinite(v) ? v : 0;
  }, [product]);

  const s = useMemo(() => stockMeta(stock), [stock]);
  const safeQtyMax = useMemo(() => Math.max(1, stock), [stock]);
  const canBuy = stock > 0 && !loading && !error && !!product;

  const onAdd = () => {
    if (!product) return;

    const pid = getProductId(product);
    if (!pid) {
      setToast("Invalid product");
      return;
    }

    if (stock <= 0) {
      setToast("Out of stock");
      return;
    }

    const safeQty = clampInt(qty, 1, safeQtyMax);

    addToCart({
      productId: pid,
      title: product.title,
      price: Number(product.price || 0),
      imageUrl: product.image_url,
      qty: safeQty,
      maxQty: stock,
    });

    setCartCount(getCartCount());
    setToast("Added to cart");
  };

  const total = useMemo(() => {
    const p = Number(product?.price || 0);
    const q = clampInt(qty, 1, safeQtyMax);
    return Number.isFinite(p) ? p * q : 0;
  }, [product, qty, safeQtyMax]);

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
              <div className="ps-brandSub">Product details</div>
            </div>
          </div>

          <div className="ps-topRight">
            <Link className="ps-topBtn ps-topBtnSoft" to="/products" aria-label="Catalog">
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

        <div className="pd-breadcrumbs" aria-label="Breadcrumbs">
          <button className="pd-crumbBtn" type="button" onClick={() => navigate(-1)}>
            <FiArrowLeft size={16} />
            <span>Back</span>
          </button>

          <span className="pd-crumbSep">/</span>
          <span className="pd-crumbHere">{loading ? "Loading…" : product?.title || "Product"}</span>
        </div>

        <section className="pd-wrap">
          {loading && (
            <div className="pd-skeletonGrid">
              <div className="pd-skeletonMedia" />
              <div className="pd-skeletonCard">
                <div className="pd-sLine pd-sLineLg" />
                <div className="pd-sLine pd-sLineSm" />
                <div className="pd-sRow">
                  <div className="pd-sPill" />
                  <div className="pd-sPill" />
                </div>
                <div className="pd-sLine" />
                <div className="pd-sLine" />
                <div className="pd-sLine pd-sLineSm" />
                <div className="pd-sActions">
                  <div className="pd-sBtn" />
                  <div className="pd-sBtn pd-sBtnWide" />
                </div>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="ps-alert ps-alertBad">
              <div className="ps-alertTitle">Error</div>
              <div className="ps-alertText">{error}</div>
              <div className="ps-alertActions">
                <Link className="ps-actionBtn ps-actionSoft" to="/products">
                  Go to catalog
                </Link>
                <button className="ps-actionBtn ps-actionPrimary" onClick={() => window.location.reload()} type="button">
                  Reload
                </button>
              </div>
            </div>
          )}

          {!loading && !error && product && (
            <div className="pd-grid2">
              <div className="pd-left">
                <div className="pd-media">
                  <div className="pd-mediaTop">
                    <div className="pd-stockPill" data-kind={s.kind} aria-label={s.label}>
                      <s.Icon size={16} />
                      <span>{s.label}</span>
                      <span className="pd-stockHint">{s.hint}</span>
                    </div>

                    <div className="pd-priceTag" aria-label="Price">
                      {moneyUAH(Number(product.price || 0))}
                    </div>
                  </div>

                  {String(product.image_url || "").trim() ? (
                    <div className="pd-imgFrame">
                      <img className="pd-img2" src={product.image_url} alt={product.title} loading="lazy" />
                    </div>
                  ) : (
                    <div className="pd-imgPh2">No image</div>
                  )}
                </div>

                <div className="pd-info">
                  <div className="pd-title2">{product.title}</div>

                  <div className="pd-chips">
                    <span className="pd-chip" data-kind={s.kind}>
                      <span className="pd-chipKey">Stock</span>
                      <span className="pd-chipVal">{Math.max(0, stock)}</span>
                    </span>
                  </div>

                  <div className="pd-desc2">{String(product.description || "").trim() || "No description"}</div>
                </div>
              </div>

              <aside className="pd-right" aria-label="Purchase panel">
                <div className="pd-buyCard">
                  <div className="pd-buyHead">
                    <div className="pd-buyTitle">Purchase</div>
                    <div className="pd-buySub">Select quantity and add to cart.</div>
                  </div>

                  <div className="pd-qty2">
                    <div className="pd-qtyLabel2">Quantity</div>
                    <div className="pd-qtyCtrl2" role="group" aria-label="Quantity control">
                      <button
                        className="pd-qtyBtn2"
                        type="button"
                        onClick={() => setQty((v) => clampInt(v - 1, 1, safeQtyMax))}
                        disabled={!canBuy || qty <= 1}
                        aria-label="Decrease quantity"
                      >
                        –
                      </button>

                      <div className="pd-qtyValue2" aria-label="Selected quantity">
                        {String(clampInt(qty, 1, safeQtyMax))}
                      </div>

                      <button
                        className="pd-qtyBtn2"
                        type="button"
                        onClick={() => setQty((v) => clampInt(v + 1, 1, safeQtyMax))}
                        disabled={!canBuy || qty >= safeQtyMax}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <div className="pd-qtyHint2">{stock > 0 ? `Up to ${safeQtyMax} item(s) available` : "Unavailable right now"}</div>
                  </div>

                  <div className="pd-summary">
                    <div className="pd-sumRow">
                      <span className="pd-sumKey">Unit price</span>
                      <span className="pd-sumVal">{moneyUAH(Number(product.price || 0))}</span>
                    </div>
                    <div className="pd-sumRow">
                      <span className="pd-sumKey">Quantity</span>
                      <span className="pd-sumVal">{clampInt(qty, 1, safeQtyMax)}</span>
                    </div>
                    <div className="pd-sumSep" />
                    <div className="pd-sumRow pd-sumRowTotal">
                      <span className="pd-sumKey">Total</span>
                      <span className="pd-sumVal">{moneyUAH(total)}</span>
                    </div>
                  </div>

                  <div className="pd-buyActions">
                    <button className="pd-add2" type="button" onClick={onAdd} disabled={!canBuy}>
                      <FiShoppingCart size={18} />
                      <span>Add to cart</span>
                    </button>

                    <Link className="pd-softBtn" to="/cart" aria-label="Open cart">
                      <span>Open cart</span>
                    </Link>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </section>

        {toast && <div className="ps-toast">{toast}</div>}
      </div>
    </div>
  );
}
