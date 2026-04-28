import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Float, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from grillmi.db import Base


class GrilladeItem(Base):
    __tablename__ = "grillade_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grillade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("grilladen.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)
    cut_id: Mapped[str] = mapped_column(Text, nullable=False)
    thickness_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    doneness: Mapped[str | None] = mapped_column(Text, nullable=True)
    prep_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    cook_seconds_min: Mapped[int] = mapped_column(Integer, nullable=False)
    cook_seconds_max: Mapped[int] = mapped_column(Integer, nullable=False)
    flip_fraction: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    rest_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    plated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    position: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
