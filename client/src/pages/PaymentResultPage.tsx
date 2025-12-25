import "../styles/PaymentResultPage.css";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiPackage,
  FiRefreshCcw,
  FiShoppingCart,
  FiUser,
  FiXCircle,
} from "react-icons/fi";
import { getCartCount } from "../store/cart";

const api = axios.create({
  baseURL: "http://localhost:8000",
  withCredentials: true,
});

type MeResponse =
  | { success: true; data: { id: string; email: string; name: string; picture?: string | null; email_verified: boolean } }
  | { success: false; error: string };

type StatusKind = "success" | "processing" | "failure" | "unknown";

function safeReturnTo(v: string): string {
  const s = String(v || "").trim();
  if (!s) return "/products";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("//")) return "/products";
  if (!s.startsWith("/")) return `/${s}`;
  return s;
}

function moneyUAH(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  return `${formatted} ₴`;
}

function normalizeStatus(raw: string | null | undefined): StatusKind {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "unknown";

  const success = new Set(["success", "sandbox", "paid", "completed", "ok"]);
  const processing = new Set([
    "processing",
    "wait_accept",
    "wait_secure",
    "3ds_verify",
    "hold_wait",
    "in_progress",
    "pending",
    "created",
    "init",
  ]);
  const failure = new Set([
    "failure",
    "fail",
    "error",
    "reversed",
    "expired",
    "declined",
    "canceled",
    "cancelled",
    "refund",
    "refunded",
    "chargeback",
  ]);

  if (success.has(s)) return "success";
  if (processing.has(s)) return "processing";
  if (failure.has(s)) return "failure";
  return "unknown";
}

function pickStatusFromAny(payload: any): string {
  const cands = [
    payload?.status,
    payload?.payment_status,
    payload?.liqpay_status,
    payload?.state,
    payload?.result,
    payload?.data?.status,
    payload?.data?.payment_status,
    payload?.data?.liqpay_status,
    payload?.data?.state,
    payload?.data?.result,
    payload?.order?.status,
    payload?.order?.payment_status,
    payload?.order?.liqpay_status,
    payload?.order?.state,
  ];
  for (const v of cands) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function pickAmountFromAny(payload: any): { amount?: number; currency?: string } {
  const amountCands = [
    payload?.amount,
    payload?.price,
    payload?.total,
    payload?.data?.amount,
    payload?.data?.price,
    payload?.data?.total,
    payload?.order?.amount,
    payload?.order?.price,
    payload?.order?.total,
  ];
  let amount: number | undefined = undefined;
  for (const v of amountCands) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) {
      amount = n;
      break;
    }
  }

  const currencyCands = [payload?.currency, payload?.data?.currency, payload?.order?.currency];
  let currency: string | undefined = undefined;
  for (const v of currencyCands) {
    const s = String(v ?? "").trim();
    if (s) {
      currency = s;
      break;
    }
  }
  return { amount, currency };
}

async function tryGet(paths: string[]) {
  for (const p of paths) {
    try {
      const r = await api.get(p);
      return r.data;
    } catch {}
  }
  return null;
}

function statusMeta(kind: StatusKind) {
  if (kind === "success") return { Icon: FiCheckCircle, title: "Payment successful", tone: "ok" as const };
  if (kind === "processing") return { Icon: FiClock, title: "Payment processing", tone: "wait" as const };
  if (kind === "failure") return { Icon: FiXCircle, title: "Payment failed", tone: "bad" as const };
  return { Icon: FiAlertTriangle, title: "Payment status unknown", tone: "neutral" as const };
}

export function PaymentResultPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [cartCount, setCartCount] = useState<number>(() => getCartCount());
  const [meState, setMeState] = useState<MeResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [statusRaw, setStatusRaw] = useState<string>("");
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>("UAH");
  const [orderId, setOrderId] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  const isAuthed = useMemo(() => Boolean(meState && "success" in meState && meState.success), [meState]);
  const me = useMemo(() => (isAuthed ? (meState as any).data : null), [isAuthed, meState]);

  const kind = useMemo(() => normalizeStatus(statusRaw), [statusRaw]);
  const meta = useMemo(() => statusMeta(kind), [kind]);

  const returnToHere = useMemo(() => safeReturnTo(location.pathname + location.search), [location.pathname, location.search]);

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
        const r = await api.get<MeResponse>("/users/me");
        if (!mounted) return;
        setMeState(r.data);
      } catch {
        if (!mounted) return;
        setMeState({ success: false, error: "Not authenticated" });
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const resolveOrderId = () => {
    const qp =
      searchParams.get("order_id") ||
      searchParams.get("orderId") ||
      searchParams.get("id") ||
      searchParams.get("order") ||
      "";
    const qpTrim = String(qp || "").trim();
    if (qpTrim) return qpTrim;

    const ls = String(localStorage.getItem("fl_last_order_id") || "").trim();
    return ls;
  };

  const resolveStatusFromQuery = () => {
    const qp =
      searchParams.get("status") ||
      searchParams.get("payment_status") ||
      searchParams.get("result") ||
      searchParams.get("state") ||
      "";
    return String(qp || "").trim();
  };

  const loadStatus = async (oid: string) => {
    const data = await tryGet([
      `/payments/orders/${encodeURIComponent(oid)}`,
      `/payments/orders/${encodeURIComponent(oid)}/status`,
      `/payments/liqpay/status/${encodeURIComponent(oid)}`,
      `/orders/${encodeURIComponent(oid)}`,
    ]);

    if (!data) {
      setNote("Order status could not be fetched from the server. Please refresh or check later.");
      return;
    }

    const raw = pickStatusFromAny(data);
    const { amount: a, currency: c } = pickAmountFromAny(data);

    if (raw) setStatusRaw(raw);
    if (typeof a === "number") setAmount(a);
    if (c) setCurrency(c);

    const msg = String(data?.message || data?.detail || "").trim();
    if (msg) setNote(msg);
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        const oid = resolveOrderId();
        const rawFromQuery = resolveStatusFromQuery();

        if (!mounted) return;
        setOrderId(oid);

        if (oid) localStorage.setItem("fl_last_order_id", oid);

        if (rawFromQuery) setStatusRaw(rawFromQuery);

        if (oid) {
          await loadStatus(oid);
        } else {
          setNote("Order id is missing. Please return to the cart and try checkout again.");
        }
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
    if (!orderId) return;
    if (kind !== "processing") return;

    let cancelled = false;
    const t = window.setInterval(async () => {
      if (cancelled) return;
      await loadStatus(orderId);
    }, 2200);

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [orderId, kind]);

  const refresh = async () => {
    if (!orderId) {
      setToast("Order id is missing");
      return;
    }
    setToast("Refreshing…");
    await loadStatus(orderId);
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
              <div className="ps-brandSub">Payment result</div>
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

            {!isAuthed ? (
              <Link className="ps-topBtn ps-topBtnPrimary" to={`/login?return_to=${encodeURIComponent(returnToHere)}`} aria-label="Sign in">
                <FiUser size={18} />
                <span>Sign in</span>
              </Link>
            ) : (
              <Link className="pr-topAvatar" to="/login" aria-label="Profile">
                {String(me?.picture || "").trim() ? (
                  <img className="pr-topAvatarImg" src={me.picture as string} alt={me?.name || "Profile"} />
                ) : (
                  <span className="pr-topAvatarPh">
                    <FiUser size={16} />
                  </span>
                )}
              </Link>
            )}
          </div>
        </header>

        <main className="pr-wrap" aria-label="Payment result">
          <section className="pr-card">
            <div className="pr-head">
              <div className="pr-icon" data-tone={meta.tone} aria-hidden="true">
                <meta.Icon size={22} />
              </div>
              <div className="pr-headText">
                <div className="pr-title">{meta.title}</div>
                <div className="pr-sub">
                  {loading ? "Loading details…" : orderId ? `Order #${orderId}` : "Order"}
                </div>
              </div>

              <button className="pr-refresh" type="button" onClick={refresh} disabled={loading || !orderId} aria-label="Refresh status">
                <FiRefreshCcw size={18} />
              </button>
            </div>

            <div className="pr-body">
              <div className="pr-grid">
                <div className="pr-kv">
                  <div className="pr-k">Status</div>
                  <div className="pr-v">
                    <span className="pr-pill" data-tone={meta.tone}>
                      {String(statusRaw || "unknown").trim() ? String(statusRaw).trim() : "unknown"}
                    </span>
                  </div>
                </div>

                <div className="pr-kv">
                  <div className="pr-k">Amount</div>
                  <div className="pr-v">
                    {amount === null ? (
                      <span className="pr-muted">—</span>
                    ) : currency.toUpperCase() === "UAH" ? (
                      moneyUAH(amount)
                    ) : (
                      `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)} ${currency}`
                    )}
                  </div>
                </div>
              </div>

              {note && <div className="pr-note">{note}</div>}

              {kind === "processing" && (
                <div className="pr-hint">
                  <FiClock size={16} />
                  <span>Confirmation may take a moment. This page will auto-refresh.</span>
                </div>
              )}

              {kind === "failure" && (
                <div className="pr-hint" data-bad="1">
                  <FiAlertTriangle size={16} />
                  <span>Return to the cart and try checkout again.</span>
                </div>
              )}

              <div className="pr-actions">
                <Link className="pr-btn pr-btnSoft" to="/cart">
                  <FiShoppingCart size={18} />
                  <span>Go to cart</span>
                </Link>

                <Link className="pr-btn pr-btnSoft" to="/products">
                  <FiPackage size={18} />
                  <span>Open catalog</span>
                </Link>
              </div>
            </div>
          </section>
        </main>

        {toast && <div className="ps-toast">{toast}</div>}
      </div>
    </div>
  );
}
