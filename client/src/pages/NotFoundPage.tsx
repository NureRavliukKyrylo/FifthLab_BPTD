import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="page">
      <div className="shell">
        <div className="card">
          <div className="card__header">
            <div>
              <div className="title">Сторінку не знайдено</div>
              <div className="muted">Маршрут не існує або був змінений.</div>
            </div>
          </div>
          <div className="card__body">
            <Link className="btn btn--primary" to="/products">
              Перейти до каталогу
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
