import os
import sys
import asyncio
import pytest
import pytest_asyncio
import importlib
from dataclasses import dataclass
from typing import Any, Dict, Optional, List
from bson import ObjectId

import httpx


# -------------------- In-memory fake MongoDB --------------------

@dataclass
class _InsertOneResult:
    inserted_id: ObjectId


@dataclass
class _UpdateResult:
    matched_count: int
    modified_count: int


@dataclass
class _DeleteResult:
    deleted_count: int


class _FakeCursor:
    def __init__(self, docs: List[Dict[str, Any]]):
        self._docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    def limit(self, _n: int):
        return self

    def __aiter__(self):
        async def gen():
            for d in self._docs:
                await asyncio.sleep(0)  # allow interleaving
                yield d
        return gen()


class _FakeCollection:
    def __init__(self):
        self._docs: List[Dict[str, Any]] = []

    async def insert_one(self, doc: Dict[str, Any]) -> _InsertOneResult:
        await asyncio.sleep(0)
        doc = dict(doc)
        if "_id" not in doc:
            doc["_id"] = ObjectId()
        self._docs.append(doc)
        return _InsertOneResult(inserted_id=doc["_id"])

    async def find_one(self, filt: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        await asyncio.sleep(0)
        for d in self._docs:
            if _match_filter(d, filt):
                return dict(d)
        return None

    def find(self, filt: Optional[Dict[str, Any]] = None):
        filt = filt or {}
        docs = [dict(d) for d in self._docs if _match_filter(d, filt)]
        return _FakeCursor(docs)

    async def update_one(self, filt: Dict[str, Any], upd: Dict[str, Any]) -> _UpdateResult:
        await asyncio.sleep(0)
        for i, d in enumerate(self._docs):
            if _match_filter(d, filt):
                before = dict(d)
                # apply $set
                if "$set" in upd:
                    for k, v in upd["$set"].items():
                        d[k] = v
                # apply $inc
                if "$inc" in upd:
                    for k, v in upd["$inc"].items():
                        d[k] = d.get(k, 0) + v
                self._docs[i] = d
                modified = 1 if d != before else 0
                return _UpdateResult(matched_count=1, modified_count=modified)
        return _UpdateResult(matched_count=0, modified_count=0)

    async def delete_one(self, filt: Dict[str, Any]) -> _DeleteResult:
        await asyncio.sleep(0)
        for i, d in enumerate(self._docs):
            if _match_filter(d, filt):
                self._docs.pop(i)
                return _DeleteResult(deleted_count=1)
        return _DeleteResult(deleted_count=0)


def _match_filter(doc: Dict[str, Any], filt: Dict[str, Any]) -> bool:
    for k, v in filt.items():
        if isinstance(v, dict):
            # support {"$gte": x} and {"$ne": y}
            if "$gte" in v:
                if doc.get(k, None) is None or doc.get(k) < v["$gte"]:
                    return False
            elif "$ne" in v:
                if doc.get(k) == v["$ne"]:
                    return False
            else:
                return False
        else:
            if doc.get(k) != v:
                return False
    return True


class _FakeDB:
    def __init__(self):
        self._cols = {
            "products": _FakeCollection(),
            "orders": _FakeCollection(),
            "users": _FakeCollection(),
        }

    def __getitem__(self, name: str):
        return self._cols[name]

    def __getattr__(self, name: str):
        if name in self._cols:
            return self._cols[name]
        raise AttributeError(name)


class _FakeClient:
    def __init__(self, db: _FakeDB):
        self._db = db

    def __getitem__(self, _db_name: str):
        return self._db


# -------------------- pytest fixtures --------------------

@pytest.fixture(scope="session")
def event_loop():
    # pytest-asyncio on Windows sometimes needs explicit session loop
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def test_env(monkeypatch):
    # Make server imports work even when pytest launched from repo root
    server_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    # Required env vars for Settings()
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "x")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "x")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "http://localhost")
    monkeypatch.setenv("GOOGLE_AUTH_URL", "http://localhost")
    monkeypatch.setenv("GOOGLE_TOKEN_URL", "http://localhost")
    monkeypatch.setenv("GOOGLE_USERINFO_URL", "http://localhost")

    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("ALGORITHM", "HS256")
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10")
    monkeypatch.setenv("REFRESH_TOKEN_EXPIRE_DAYS", "1")

    monkeypatch.setenv("MONGODB_URL", "mongodb://fake")
    monkeypatch.setenv("MONGODB_NAME", "testdb")

    monkeypatch.setenv("HOST", "127.0.0.1")
    monkeypatch.setenv("PORT", "8000")

    # LiqPay (tests use sandbox keys)
    monkeypatch.setenv("LIQPAY_PUBLIC_KEY", "sandbox_public")
    monkeypatch.setenv("LIQPAY_PRIVATE_KEY", "sandbox_private")
    monkeypatch.setenv("LIQPAY_RESULT_URL", "http://localhost/result")
    monkeypatch.setenv("LIQPAY_SERVER_URL", "http://localhost/payments/liqpay/callback")
    monkeypatch.setenv("LIQPAY_SANDBOX", "1")

    # Reload settings after env patch
    import infrastructure.config as cfg
    importlib.reload(cfg)

    return True


@pytest.fixture
def fake_db():
    return _FakeDB()


@pytest.fixture
def app(test_env, fake_db, monkeypatch):
    # Patch db client globally so infrastructure.db.get_db() works everywhere
    import infrastructure.db as dbmod
    dbmod.client = _FakeClient(fake_db)

    # Patch connect_db/close_db used by lifespan (avoid real Mongo)
    async def _noop():
        return None

    import main as mainmod
    monkeypatch.setattr(mainmod, "connect_db", _noop, raising=False)
    monkeypatch.setattr(mainmod, "close_db", _noop, raising=False)

    # Build app
    app = mainmod.create_app()

    # Override auth dependency for payment init/orders
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
    return app


@pytest_asyncio.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
