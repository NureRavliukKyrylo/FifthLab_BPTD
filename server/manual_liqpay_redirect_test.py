import asyncio
import importlib
import os
import pathlib
import webbrowser

import httpx

from main import create_app


async def main():
    os.environ.setdefault("GOOGLE_CLIENT_ID", "x")
    os.environ.setdefault("GOOGLE_CLIENT_SECRET", "x")
    os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost")
    os.environ.setdefault("GOOGLE_AUTH_URL", "http://localhost")
    os.environ.setdefault("GOOGLE_TOKEN_URL", "http://localhost")
    os.environ.setdefault("GOOGLE_USERINFO_URL", "http://localhost")

    os.environ.setdefault("SECRET_KEY", "test-secret")
    os.environ.setdefault("ALGORITHM", "HS256")
    os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "10")
    os.environ.setdefault("REFRESH_TOKEN_EXPIRE_DAYS", "1")

    os.environ.setdefault("MONGODB_URL", "mongodb://fake")
    os.environ.setdefault("MONGODB_NAME", "testdb")

    os.environ.setdefault("HOST", "127.0.0.1")
    os.environ.setdefault("PORT", "8000")

    os.environ.setdefault("LIQPAY_PUBLIC_KEY", "sandbox_i54800522711")
    os.environ.setdefault("LIQPAY_PRIVATE_KEY", "sandbox_U8yzIKM4Iz6JTFR7AMX0SwXEGyN0ldb6tViw2JaU")
    os.environ.setdefault("LIQPAY_RESULT_URL", "http://localhost:5173/payment-result")
    os.environ.setdefault("LIQPAY_SERVER_URL", "http://localhost:8000/payments/liqpay/callback")
    os.environ.setdefault("LIQPAY_SANDBOX", "1")

    import infrastructure.config as cfg
    importlib.reload(cfg)

    from tests.conftest import _FakeClient, _FakeDB

    fake_db = _FakeDB()

    import infrastructure.db as dbmod
    dbmod.client = _FakeClient(fake_db)

    app = create_app()

    from dependencies.auth import get_current_user
    from models.user import User

    async def _fake_user():
        return User(
            _id="507f1f77bcf86cd799439011",
            google_sub="sub",
            email="test@example.com",
            email_verified=True,
            name="Test User",
        )

    app.dependency_overrides[get_current_user] = _fake_user

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        prod = {
            "title": "Demo product",
            "description": "For payment redirect test",
            "image_url": "http://localhost/image1.png",
            "price": 1000.0,
            "quantity": 3,
        }
        r1 = await c.post("/products/", json=prod)
        if r1.status_code != 200:
            print("POST /products/ failed:", r1.status_code)
            print(r1.text)
            return

        p = r1.json()
        product_id = p.get("_id") or p.get("id")

        init_payload = {
            "items": [{"product_id": product_id, "qty": 1}],
            "currency": "UAH",
            "description": "Demo payment",
        }
        r2 = await c.post("/payments/liqpay/init", json=init_payload)
        if r2.status_code != 200:
            print("POST /payments/liqpay/init failed:", r2.status_code)
            print(r2.text)
            return

        init = r2.json()

    action = init["liqpay"]["action"]
    data = init["liqpay"]["data"]
    signature = init["liqpay"]["signature"]

    html = f"""<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <title>LiqPay redirect test</title>
  </head>
  <body>
    <form method="POST" action="{action}">
      <input type="hidden" name="data" value="{data}" />
      <input type="hidden" name="signature" value="{signature}" />
      <button type="submit">Перейти на оплату</button>
    </form>
    <script>document.forms[0].submit();</script>
  </body>
</html>
"""
    path = pathlib.Path("liqpay_test.html").resolve()
    path.write_text(html, encoding="utf-8")

    print("Created:", str(path))
    webbrowser.open(path.as_uri())


if __name__ == "__main__":
    asyncio.run(main())
