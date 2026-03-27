from contextlib import asynccontextmanager

import sqlalchemy
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import email_sync, gmail, jobs, yahoo


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add soft-delete columns to existing tables (idempotent)
        await conn.execute(
            sqlalchemy.text("""
                DO $$ BEGIN
                    ALTER TABLE jobs ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
        )
        await conn.execute(
            sqlalchemy.text("""
                DO $$ BEGIN
                    ALTER TABLE jobs ADD COLUMN deleted_at TIMESTAMPTZ;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
        )
        await conn.execute(
            sqlalchemy.text("""
                DO $$ BEGIN
                    ALTER TABLE application_update_suggestions
                        ADD COLUMN yahoo_message_id VARCHAR(255) UNIQUE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
        )
    yield


app = FastAPI(title="JobTrackr API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^chrome-extension://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router)
app.include_router(gmail.router)
app.include_router(yahoo.router)
app.include_router(email_sync.router)


@app.get("/")
async def health():
    return {"status": "ok"}
