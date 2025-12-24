import { useEffect, useMemo, useState } from "react";
import { getOrder, getProducts, type Order, type Product } from "../lib/api";

function readOrderId(): string {
  const url = new URL(window.location.href);
  const q = (url.searchParams.get("order_id") || "").trim();
  if (q) return q;
  return (localStorage.getItem("last_order_id") || "").trim();
}

function pickId(p: Product): string {
  return String(p._id || p.id || "");
}

export default function PaymentResult() {
  const [orderId, setOrderId] = useState<string>(() => readOrderId());
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [status, setStatus] = useState<string>("init");
  const [err, setErr] = useState<string>("");
  const [pollLeft, setPollLeft] = useState<number>(8);

  const lastProductId = useMemo(() => (localStorage.getItem("last_product_id") || "").trim(), []);

  async function loadOnce(oid: string) {
    setErr("");
    const o = await getOrder(oid);
    setOrder(o);
    setStatus(String(o.status || ""));
    try {
      const ps = await getProducts();
      setProducts(ps);
    } catch {
      setProducts(null);
    }
  }

  async function poll(oid: string) {
    setErr("");
    setPollLeft(8);

    for (let i = 0; i < 8; i++) {
      try {
        const o = await getOrder(oid);
        setOrder(o);
        const st = String(o.status || "");
        setStatus(st);

        if (st === "success" || st === "failure") {
          try {
            const ps = await getProducts();
            setProducts(ps);
          } catch {
            setProducts(null);
          }
          return;
        }
      } catch (e: any) {
        const msg = String(e?.response?.data?.detail || e?.message || "Не вдалося отримати статус замовлення.");
        setErr(msg);
        return;
      }

      setPollLeft((x) => Math.max(0, x - 1));
      await new Promise((r) => setTimeout(r, 1500));
    }

    try {
      const ps = await getProducts();
      setProducts(ps);
    } catch {
      setProducts(null);
    }
  }

  useEffect(() => {
    if (!orderId) {
      setErr("Не знайдено order_id. Поверніться у магазин і ініціюйте оплату ще раз.");
      return;
    }
    poll(orderId);
  }, []);

  const productLine = useMemo(() => {
    if (!products || !lastProductId) return null;
    const p = products.find((x) => pickId(x) === lastProductId);
    if (!p) return null;
    return `${p.title} | На складі: ${p.quantity}`;
  }, [products, lastProductId]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Результат оплати</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <a href="/shop">← Назад до магазину</a>
        <button
          onClick={() => {
            const oid = readOrderId();
            setOrderId(oid);
            if (oid) poll(oid);
          }}
          style={{ padding: "8px 12px" }}
        >
          Оновити статус
        </button>
        <button
          onClick={() => {
            localStorage.removeItem("last_order_id");
            localStorage.removeItem("last_product_id");
            setOrderId("");
            setOrder(null);
            setProducts(null);
            setStatus("init");
            setErr("Локальні дані очищено. Для нової перевірки ініціюйте оплату в магазині.");
          }}
          style={{ padding: "8px 12px" }}
        >
          Очистити
        </button>
      </div>

      {err && (
        <div style={{ marginBottom: 16, padding: 12, border: "1px solid #b33", borderRadius: 8 }}>
          {err}
        </div>
      )}

      <div style={{ padding: 12, border: "1px solid #444", borderRadius: 12, marginBottom: 12 }}>
        <div>
          order_id: <b>{orderId || "—"}</b>
        </div>
        <div style={{ marginTop: 6 }}>
          status: <b>{status}</b> {status === "pending" ? `(polling залишилось: ${pollLeft})` : ""}
        </div>
        {order && (
          <>
            <div style={{ marginTop: 6 }}>
              amount: <b>{order.amount}</b> {order.currency}
            </div>
            <div style={{ marginTop: 6 }}>
              description: <b>{order.description}</b>
            </div>
            <div style={{ marginTop: 6 }}>
              transaction_id: <b>{order.transaction_id || "—"}</b>
            </div>
          </>
        )}
      </div>

      <div style={{ padding: 12, border: "1px solid #444", borderRadius: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Стан складу </div>
        {productLine ? (
          <div>{productLine}</div>
        ) : (
          <div style={{ opacity: 0.8 }}>
            Не вдалося визначити товар для відображення. Перевірте, що покупка ініційована з магазину і products доступні.
          </div>
        )}
      </div>

      {order && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Raw order</div>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", padding: 12, border: "1px solid #333", borderRadius: 12 }}>
            {JSON.stringify(order, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
