from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str
    GOOGLE_AUTH_URL:str
    GOOGLE_TOKEN_URL:str
    GOOGLE_USERINFO_URL:str

    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_DAYS: int
    
    MONGODB_URL: str
    MONGODB_NAME: str
    
    HOST: str 
    PORT: int
    
    LIQPAY_PUBLIC_KEY: str = ""
    LIQPAY_PRIVATE_KEY: str = ""
    LIQPAY_RESULT_URL: str = ""
    LIQPAY_SERVER_URL: str = ""
    LIQPAY_SANDBOX: int = 1  # 1 = sandbox/test
    
    class Config:
        env_file = ".env"

settings = Settings()
