import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { FiSearch, FiShoppingCart, FiLogIn, FiCheckCircle, FiAlertTriangle, FiXCircle, FiUser } from "react-icons/fi";
import { listProducts } from "../api/products";
import type { Product } from "../types/models";
import { addToCart, getCartCount } from "../store/cart";

const api = axios.create({
  baseURL: "http://localhost:8000",
  withCredentials: true,
});

type SortKey = "popular" | "price_asc" | "price_desc" | "stock_desc" | "name_asc";

function getProductId(p: Product): string {
  return String((p as any)._id || (p as any).id || "");
}

function moneyUAH(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  return `${formatted} ₴`;
}

function stockMeta(qty: number) {
  if (qty <= 0) return { kind: "out" as const, label: "Out of stock", Icon: FiXCircle };
  if (qty <= 3) return { kind: "low" as const, label: "Low stock", Icon: FiAlertTriangle };
  return { kind: "in" as const, label: "In stock", Icon: FiCheckCircle };
}

type MeResponse =
  | { success: true; data: { id: string; email: string; name: string; picture?: string | null; email_verified: boolean } }
  | { success: false; error: string };

type AuthState = "unknown" | "authed" | "guest";

function safeReturnTo(v: unknown, fallback: string) {
  const s = String(v || "").trim();
  if (!s) return fallback;
  if (!s.startsWith("/")) return fallback;
  if (s.startsWith("/login")) return fallback;
  return s;
}

export function ProductsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [query, setQuery] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("popular");

  const [toast, setToast] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState<number>(() => getCartCount());

  const [auth, setAuth] = useState<AuthState>("unknown");
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [profilePic, setProfilePic] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await listProducts();
        if (!mounted) return;
        setProducts(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!mounted) return;
        setError(String(e?.message || "Failed to load catalog"));
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = products;

    if (q) {
      items = items.filter((p) => {
        const t = String(p.title || "").toLowerCase();
        const d = String(p.description || "").toLowerCase();
        return t.includes(q) || d.includes(q);
      });
    }

    if (inStockOnly) {
      items = items.filter((p) => Number(p.quantity || 0) > 0);
    }

    const arr = [...items];

    arr.sort((a, b) => {
      const ap = Number(a.price || 0);
      const bp = Number(b.price || 0);
      const aq = Number(a.quantity || 0);
      const bq = Number(b.quantity || 0);

      if (sortKey === "price_asc") return ap - bp;
      if (sortKey === "price_desc") return bp - ap;
      if (sortKey === "stock_desc") return bq - aq;
      if (sortKey === "name_asc") return String(a.title || "").localeCompare(String(b.title || ""), "en");

      if (aq === 0 && bq > 0) return 1;
      if (bq === 0 && aq > 0) return -1;
      return bq - aq;
    });

    return arr;
  }, [products, query, inStockOnly, sortKey]);

  const onAdd = (p: Product) => {
    const id = getProductId(p);
    if (!id) {
      setToast("Invalid product");
      return;
    }

    const stock = Number.isFinite(p.quantity) ? Number(p.quantity) : 0;
    if (stock <= 0) {
      setToast("Out of stock");
      return;
    }

    addToCart({
      productId: id,
      title: p.title,
      price: Number(p.price || 0),
      imageUrl: (p as any).image_url,
      qty: 1,
      maxQty: stock,
    });

    setCartCount(getCartCount());
    setToast("Added to cart");
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
              <div className="ps-brandSub">Product catalog</div>
            </div>
          </div>

          <div className="ps-topRight">
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

        <div className="ps-headRow">
          <div className="ps-headLeft">
            <h1 className="ps-h1">Catalog</h1>
            <div className="ps-h1Sub">Search, filter, sort and checkout via integrated payment.</div>
          </div>

          <div className="ps-miniStats" aria-label="Catalog stats">
            <div className="ps-miniStat">
              <div className="ps-miniLabel">Showing</div>
              <div className="ps-miniValue">{filtered.length}</div>
            </div>
            <div className="ps-miniSep" />
            <div className="ps-miniStat">
              <div className="ps-miniLabel">Total</div>
              <div className="ps-miniValue">{products.length}</div>
            </div>
          </div>
        </div>

        <section className="ps-panel">
          <div className="ps-toolbar">
            <div className="ps-search">
              <FiSearch size={18} className="ps-searchIcon" />
              <input
                className="ps-searchInput"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or description"
              />
              {query.trim() && (
                <button className="ps-clear" onClick={() => setQuery("")} aria-label="Clear">
                  ✕
                </button>
              )}
            </div>

            <div className="ps-controls">
              <label className={`ps-toggle ${inStockOnly ? "is-on" : ""}`}>
                <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
                <span>In stock only</span>
              </label>

              <select className="ps-select" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="popular">Popular</option>
                <option value="price_asc">Price ↑</option>
                <option value="price_desc">Price ↓</option>
                <option value="stock_desc">Stock</option>
                <option value="name_asc">Name A–Z</option>
              </select>
            </div>
          </div>

          {loading && (
            <div className="ps-grid">
              {Array.from({ length: 9 }).map((_, i) => (
                <div className="ps-card ps-skeleton" key={i}>
                  <div className="ps-skelMedia" />
                  <div className="ps-skelBody">
                    <div className="ps-skelLine ps-skelLineLg" />
                    <div className="ps-skelLine ps-skelLineSm" />
                    <div className="ps-skelRow">
                      <div className="ps-skelPill" />
                      <div className="ps-skelBtn" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="ps-alert ps-alertBad">
              <div className="ps-alertTitle">Error</div>
              <div className="ps-alertText">{error}</div>
              <div className="ps-alertActions">
                <button className="ps-actionBtn ps-actionPrimary" onClick={() => window.location.reload()}>
                  Reload
                </button>
              </div>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="ps-alert">
              <div className="ps-alertTitle">No results</div>
              <div className="ps-alertText">Try a different query or turn off filters.</div>
              <div className="ps-alertActions">
                <button
                  className="ps-actionBtn ps-actionSoft"
                  onClick={() => {
                    setQuery("");
                    setInStockOnly(false);
                    setSortKey("popular");
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="ps-grid">
              {filtered.map((p) => {
                const id = getProductId(p);
                const stock = Number.isFinite(p.quantity) ? Number(p.quantity) : 0;
                const s = stockMeta(stock);
                const img = String((p as any).image_url || "").trim();

                return (
                  <article className="ps-card" key={id || p.title}>
                    <div className="ps-media">
                      <div className="ps-stockPill" data-kind={s.kind} aria-label={s.label}>
                        <s.Icon size={16} />
                        <span>{s.label}</span>
                      </div>

                      {img ? <img className="ps-img" src={img} alt={p.title} loading="lazy" /> : <div className="ps-imgPh">No image</div>}
                    </div>

                    <div className="ps-body">
                      <div className="ps-topRow">
                        <div className="ps-name" title={p.title}>
                          {p.title}
                        </div>
                        <div className="ps-price">{moneyUAH(Number(p.price || 0))}</div>
                      </div>

                      <div className="ps-metaRow">
                        <span className="ps-chip" data-kind={s.kind}>
                          <span className="ps-chipKey">Stock</span>
                          <span className="ps-chipVal">{Math.max(0, stock)}</span>
                        </span>
                      </div>

                      <div className="ps-bottomRow">
                        <Link className="ps-link" to={`/products/${id}`}>
                          Details
                        </Link>

                        <button className="ps-add" disabled={stock <= 0} onClick={() => onAdd(p)} aria-label="Add to cart">
                          <FiShoppingCart size={18} />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {toast && <div className="ps-toast">{toast}</div>}
      </div>
    </div>
  );
}
