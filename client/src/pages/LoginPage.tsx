// client/src/pages/LoginPage.tsx
import "../styles/LoginPage.css";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  FiCheckCircle,
  FiLogIn,
  FiLogOut,
  FiPackage,
  FiRefreshCcw,
  FiShoppingCart,
  FiUser,
  FiAlertTriangle,
} from "react-icons/fi";
import { getCartCount } from "../store/cart";

const api = axios.create({
  baseURL: "http://localhost:8000",
  withCredentials: true,
});

type MeResponse =
  | {
      success: true;
      data: {
        id: string;
        email: string;
        name: string;
        picture?: string | null;
        email_verified: boolean;
      };
    }
  | { success: false; error: string };

function safeReturnTo(v: string | null | undefined): string {
  const s = String(v || "").trim();
  if (!s) return "/products";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("//"))
    return "/products";
  if (!s.startsWith("/")) return `/${s}`;
  return s;
}

export function LoginPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [cartCount, setCartCount] = useState<number>(() => getCartCount());
  const [loading, setLoading] = useState<boolean>(true);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isAuthed = useMemo(
    () => Boolean(user && "success" in user && user.success),
    [user]
  );
  const me = useMemo(
    () => (isAuthed ? (user as any).data : null),
    [isAuthed, user]
  );

  const returnTo = useMemo(() => {
    const qp = safeReturnTo(searchParams.get("return_to"));
    const st = safeReturnTo((location.state as any)?.return_to);
    return qp || st || "/products";
  }, [location.state, searchParams]);

  useEffect(() => {
    const onStorage = () => setCartCount(getCartCount());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1700);
    return () => window.clearTimeout(t);
  }, [toast]);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const r = await api.get<MeResponse>("/users/me");
      setUser(r.data);
    } catch {
      setUser({ success: false, error: "Not authenticated" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const loginWithGoogle = () => {
    const rt = safeReturnTo(returnTo);
    window.location.href = `http://localhost:8000/auth/google?return_to=${encodeURIComponent(
      rt
    )}`;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
      setToast("Signed out");
      await checkAuth();
    } catch {
      setToast("Sign out failed");
    }
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
              <div className="ps-brandSub">Account</div>
            </div>
          </div>

          <div className="ps-topRight">
            <Link
              className="ps-topBtn ps-topBtnSoft"
              to="/products"
              aria-label="Catalog"
            >
              <FiPackage size={18} />
              <span>Catalog</span>
            </Link>

            <Link
              className="ps-topBtn ps-topBtnSoft"
              to="/cart"
              aria-label="Cart"
            >
              <FiShoppingCart size={18} />
              <span>Cart</span>
              <span className="ps-count">{cartCount}</span>
            </Link>

            {!isAuthed ? (
              <button
                className="ps-topBtn ps-topBtnPrimary"
                type="button"
                onClick={loginWithGoogle}
                disabled={loading}
              >
                <FiLogIn size={18} />
                <span>Sign in</span>
              </button>
            ) : (
              <Link className="lp-topAvatar" to="/login" aria-label="Profile">
                {String(me?.picture || "").trim() ? (
                  <img
                    className="lp-topAvatarImg"
                    src={me.picture as string}
                    alt={me?.name || "Profile"}
                  />
                ) : (
                  <span className="lp-topAvatarPh">
                    <FiUser size={16} />
                  </span>
                )}
              </Link>
            )}
          </div>
        </header>

        <main className="lp-wrap">
          <section className="lp-card" aria-label="Login card">
            <div className="lp-cardTop">
              <div className="lp-cardTitle">
                <FiUser size={18} />
                <span>{isAuthed ? "Account" : "Sign in"}</span>
              </div>

              <button
                className="lp-ghost"
                type="button"
                onClick={checkAuth}
                disabled={loading}
                aria-label="Refresh session"
              >
                <FiRefreshCcw size={18} />
              </button>
            </div>

            {loading && (
              <div className="lp-skel" aria-label="Loading">
                <div className="lp-skelLine" />
                <div className="lp-skelLine lp-skelLine2" />
                <div className="lp-skelLine lp-skelLine3" />
              </div>
            )}

            {!loading && !isAuthed && (
              <>
                <div className="lp-state lp-stateWarn">
                  <FiAlertTriangle size={18} />
                  <div className="lp-stateText">
                    <div className="lp-stateTitle">Not authenticated</div>
                    <div className="lp-stateDesc">
                      Continue with Google to view your profile and checkout.
                    </div>
                  </div>
                </div>

                <div className="lp-actions">
                  <button
                    className="lp-btn lp-btnPrimary"
                    type="button"
                    onClick={loginWithGoogle}
                  >
                    <FiLogIn size={18} />
                    <span>Continue with Google</span>
                  </button>

                  <Link className="lp-btn lp-btnSoft" to="/products">
                    <FiPackage size={18} />
                    <span>Open catalog</span>
                  </Link>
                </div>
              </>
            )}

            {!loading && isAuthed && me && (
              <>
                <div className="lp-profile">
                  <div className="lp-avatar">
                    {String(me.picture || "").trim() ? (
                      <img
                        className="lp-avatarImg"
                        src={me.picture as string}
                        alt={me.name}
                      />
                    ) : (
                      <div className="lp-avatarPh">
                        <FiUser size={18} />
                      </div>
                    )}
                  </div>

                  <div className="lp-profText">
                    <div className="lp-profName">{me.name}</div>
                    <div className="lp-profEmail">{me.email}</div>

                    <div className="lp-profBadges">
                      <span
                        className="lp-pill"
                        data-kind={me.email_verified ? "ok" : "warn"}
                      >
                        {me.email_verified ? (
                          <FiCheckCircle size={16} />
                        ) : (
                          <FiAlertTriangle size={16} />
                        )}
                        <span>
                          {me.email_verified
                            ? "Email verified"
                            : "Email not verified"}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="lp-actions">
                  <Link className="lp-btn lp-btnSoft lp-btnStrong" to="/cart">
                    <FiShoppingCart size={18} />
                    <span>Go to cart</span>
                  </Link>

                  <Link className="lp-btn lp-btnSoft" to="/products">
                    <FiPackage size={18} />
                    <span>Continue shopping</span>
                  </Link>

                  <button
                    className="lp-btn lp-btnDanger"
                    type="button"
                    onClick={logout}
                  >
                    <FiLogOut size={18} />
                    <span>Sign out</span>
                  </button>
                </div>
              </>
            )}
          </section>
        </main>

        {toast && <div className="ps-toast">{toast}</div>}
      </div>
    </div>
  );
}
