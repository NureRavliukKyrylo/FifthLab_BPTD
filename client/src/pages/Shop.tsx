import { useEffect, useMemo, useState } from "react";
import { getMe, getProducts, initPayment, logout, submitLiqPayCheckout, type Product } from "../lib/api";

type MeState =
  | { state: "loading" }
  | { state: "anon" }
  | { state: "authed"; id: string; email: string; name: string; picture?: string | null };

function pickId(p: Product): string {
  return String(p._id || p.id || "");
}

export default function Shop() {
  const [me, setMe] = useState<MeState>({ state: "loading" });
  const [products, setProducts] = useState<Product[]>([]);
  const [busyId, setBusyId] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const isAuthed = me.state === "authed";

  const loginUrl = useMemo(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
    return `${apiBase}/auth/google`;
  }, []);

  async function refreshAll() {
    setErr("");
    try {
      const m = await getMe();
      if (m.success) {
        setMe({
          state: "authed",
          id: m.data.id,
          email: m.data.email,
          name: m.data.name,
          picture: m.data.picture ?? null,
        });
      } else {
        setMe({ state: "anon" });
      }
    } catch {
      setMe({ state: "anon" });
    }

    try {
      const ps = await getProducts();
      setProducts(ps);
    } catch {
      setErr("Не вдалося завантажити товари. Перевірте, що сервер запущений та CORS дозволяє ваш домен.");
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function onLogout() {
    setErr("");
    try {
      await logout();
      setMe({ state: "anon" });
    } catch {
      setErr("Не вдалося виконати вихід.");
    }
  }

  async function onBuy(p: Product) {
    const productId = pickId(p);
    if (!productId) {
      setErr("Некоректний ідентифікатор товару.");
      return;
    }
    if (!isAuthed) {
      setErr("Купівля доступна лише після входу через Google.");
      return;
    }
    if (p.quantity <= 0) {
      setErr("Товар відсутній на складі.");
      return;
    }

    setBusyId(productId);
    setErr("");

    try {
      const init = await initPayment({
        productId,
        qty: 1,
        currency: "UAH",
        description: `Buying ${p.title}`,
        type: "buy",
      });

      localStorage.setItem("last_order_id", init.order_id);
      localStorage.setItem("last_product_id", productId);

      submitLiqPayCheckout(init.liqpay.action, init.liqpay.data, init.liqpay.signature);
    } catch (e: any) {
      const msg = String(e?.response?.data?.detail || e?.message || "Помилка ініціалізації оплати.");
      setErr(msg);
      setBusyId("");
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Перевірка оплати (Lab 5)</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {me.state === "loading" && <span>Перевірка сесії...</span>}

          {me.state === "anon" && (
            <>
              <span>Не авторизовано</span>
              <a href={loginUrl} style={{ padding: "8px 12px", border: "1px solid #666", borderRadius: 8 }}>
                Увійти через Google
              </a>
            </>
          )}

          {me.state === "authed" && (
            <>
              <span>
                Авторизовано: <b>{me.name}</b> ({me.email})
              </span>
              <button onClick={onLogout} style={{ padding: "8px 12px" }}>
                Вийти
              </button>
            </>
          )}
        </div>

        <button onClick={refreshAll} style={{ padding: "8px 12px" }}>
          Оновити дані
        </button>
      </div>

      {err && (
        <div style={{ marginBottom: 16, padding: 12, border: "1px solid #b33", borderRadius: 8 }}>
          {err}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {products.map((p) => {
          const pid = pickId(p);
          const disabled = !isAuthed || p.quantity <= 0 || busyId === pid;
          return (
            <div
              key={pid || p.title}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr auto",
                gap: 12,
                alignItems: "center",
                padding: 12,
                border: "1px solid #444",
                borderRadius: 12,
              }}
            >
              <img
                src={p.image_url}
                alt={p.title}
                style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 10, border: "1px solid #333" }}
                onError={(e) => {
                  const t = e.currentTarget;
                  t.style.display = "none";
                }}
              />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{p.title}</div>
                <div style={{ opacity: 0.85, marginTop: 4 }}>{p.description}</div>
                <div style={{ marginTop: 8 }}>
                  Ціна: <b>{p.price}</b> {""} | На складі: <b>{p.quantity}</b>
                </div>
                <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>product_id: {pid || "—"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  onClick={() => onBuy(p)}
                  disabled={disabled}
                  style={{ padding: "10px 14px", borderRadius: 10, opacity: disabled ? 0.6 : 1 }}
                >
                  {busyId === pid ? "Створення платежу..." : "Купити 1"}
                </button>
                <a href="/payment-result" style={{ textAlign: "center", opacity: 0.8 }}>
                  Перейти до результату
                </a>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
