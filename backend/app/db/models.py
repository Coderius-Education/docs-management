"""SQLAlchemy-modellen. Schema volgt het ontwerp in het plan (zie README)."""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON, Uuid


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map = {
        dict: JSON().with_variant(JSONB(), "postgresql"),
    }


class BuildStatus(enum.StrEnum):
    pending = "pending"
    downloading = "downloading"
    ready = "ready"
    failed = "failed"
    pruned = "pruned"


class ExperimentStatus(enum.StrEnum):
    draft = "draft"
    running = "running"
    paused = "paused"
    concluded = "concluded"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    github_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    login: Mapped[str] = mapped_column(String(100))
    name: Mapped[str | None] = mapped_column(String(200))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    oauth_token_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    token_invalid: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True)
    domain: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str] = mapped_column(String(100))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Build(Base):
    __tablename__ = "builds"
    __table_args__ = (
        UniqueConstraint("site_id", "run_id", name="uq_builds_site_run"),
        Index("ix_builds_site_branch_created", "site_id", "branch_slug", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    branch: Mapped[str] = mapped_column(String(255))
    branch_slug: Mapped[str] = mapped_column(String(100))
    head_sha: Mapped[str] = mapped_column(String(40))
    run_id: Mapped[int] = mapped_column(BigInteger)
    artifact_id: Mapped[int | None] = mapped_column(BigInteger)
    commit_message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[BuildStatus] = mapped_column(
        Enum(BuildStatus, native_enum=False, length=20), default=BuildStatus.pending
    )
    path: Mapped[str | None] = mapped_column(String(500))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PrCache(Base):
    __tablename__ = "pr_cache"

    number: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    title: Mapped[str] = mapped_column(String(500))
    branch: Mapped[str] = mapped_column(String(255))
    author_login: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(20))
    head_sha: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    name: Mapped[str] = mapped_column(String(200))
    hypothesis: Mapped[str | None] = mapped_column(Text)
    page_path: Mapped[str] = mapped_column(String(500))
    variant_branch: Mapped[str] = mapped_column(String(255))
    variant_build_id: Mapped[int] = mapped_column(ForeignKey("builds.id"))
    split_pct: Mapped[int] = mapped_column(Integer, default=50)
    status: Mapped[ExperimentStatus] = mapped_column(
        Enum(ExperimentStatus, native_enum=False, length=20), default=ExperimentStatus.draft
    )
    winner: Mapped[str | None] = mapped_column(CHAR(1))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_experiment_type_ts", "experiment_id", "event_type", "ts"),
        Index("ix_events_site_ts", "site_id", "ts"),
    )

    # BigInteger-PK autoincrement werkt niet op SQLite (tests); vandaar de variant.
    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True
    )
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    experiment_id: Mapped[int | None] = mapped_column(ForeignKey("experiments.id"))
    variant: Mapped[str | None] = mapped_column(CHAR(1))
    anon_id: Mapped[str] = mapped_column(String(64))
    path: Mapped[str] = mapped_column(String(500))
    event_type: Mapped[str] = mapped_column(String(50))
    value: Mapped[float | None] = mapped_column(Numeric)
    meta: Mapped[dict | None] = mapped_column()
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    delivery_guid: Mapped[str] = mapped_column(String(100), primary_key=True)
    event: Mapped[str] = mapped_column(String(50))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
