"""Klassen: klasweergaven van docenten en hun mededocenten."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "0003_klassen"
down_revision = "0002_subjects"
branch_labels = None
depends_on = None


def _has(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table)


def upgrade() -> None:
    # 0001 en init_db maken het schema via create_all uit de huidige modellen;
    # op een verse database bestaan de tabellen dan al.
    if not _has("klassen"):
        op.create_table(
            "klassen",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("code", sa.String(16), nullable=False),
            sa.Column("vak", sa.String(50), nullable=False),
            sa.Column("naam", sa.String(100), nullable=False),
            sa.Column("inhoud", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=False),
            sa.Column("eigenaar_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
            sa.Column("gearchiveerd", sa.Boolean, nullable=False, server_default=sa.false()),
            sa.Column("versie", sa.Integer, nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        )
        op.create_index("ix_klassen_code", "klassen", ["code"], unique=True)
        op.create_index("ix_klassen_vak", "klassen", ["vak"])
    if not _has("klas_docenten"):
        op.create_table(
            "klas_docenten",
            sa.Column(
                "klas_id",
                sa.Integer,
                sa.ForeignKey("klassen.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("login", sa.String(100), primary_key=True),
            sa.Column("toegevoegd_door", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("klas_docenten")
    op.drop_index("ix_klassen_vak", table_name="klassen")
    op.drop_index("ix_klassen_code", table_name="klassen")
    op.drop_table("klassen")
