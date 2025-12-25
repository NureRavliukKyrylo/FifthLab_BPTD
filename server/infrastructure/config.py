# C:\Users\m_she\Documents\GitHub\FifthLab_BPTD\server\infrastructure\config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str
    GOOGLE_AUTH_URL: str
    GOOGLE_TOKEN_URL: str
    GOOGLE_USERINFO_URL: str

    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_DAYS: int

    MONGODB_URL: str
    MONGODB_NAME: str

    HOST: str
    PORT: int

    FRONTEND_URL: str = "http://localhost:5173"

    LIQPAY_PUBLIC_KEY: str = ""
    LIQPAY_PRIVATE_KEY: str = ""
    LIQPAY_RESULT_URL: str = ""
    LIQPAY_SERVER_URL: str = ""
    LIQPAY_SANDBOX: int = 1

    @property
    def liqpay_public_key(self) -> str:
        return self.LIQPAY_PUBLIC_KEY

    @property
    def liqpay_private_key(self) -> str:
        return self.LIQPAY_PRIVATE_KEY

    @property
    def liqpay_result_url(self) -> str:
        return self.LIQPAY_RESULT_URL

    @property
    def liqpay_server_url(self) -> str:
        return self.LIQPAY_SERVER_URL

    @property
    def liqpay_sandbox(self) -> bool:
        return bool(int(self.LIQPAY_SANDBOX or 0))

    class Config:
        env_file = ".env"

settings = Settings()
