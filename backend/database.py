import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


def build_postgres_dsn() -> str:
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    db_name = os.getenv("POSTGRES_DB", "kinepitch_db")
    user = os.getenv("POSTGRES_USER", "kinepitch_app")
    password = os.getenv("POSTGRES_PASSWORD", "changeme_dev_only")
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{db_name}"


engine = create_engine(
    build_postgres_dsn(),
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
