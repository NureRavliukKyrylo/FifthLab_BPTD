from fastapi import FastAPI
from contextlib import asynccontextmanager
from infrastructure.config import settings
from infrastructure.db import connect_db, close_db
from api.product_routes import router as product_router
from api.auth_routes import router as auth_router
from api.user_routes import router as user_router
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting application...")
    await connect_db()
    yield
    print("Shutting down...")
    await close_db()

def create_app() -> FastAPI:
    app = FastAPI(
        title="FastAPI MongoDB App with Google OAuth",
        version="1.0.0",
        lifespan=lifespan
    )
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    app.include_router(auth_router)
    app.include_router(product_router)
    app.include_router(user_router)
    
    return app

app = create_app()

app.mount("/images", StaticFiles(directory="images"), name="images")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True
    )