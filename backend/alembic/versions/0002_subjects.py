"""Vakken: sites krijgen een subject en een path.

Een site woont voortaan op https://<vak-domein>/<path>/. init_db vult de
waarden daarna vanuit sites.json.
"""

import sqlalchemy as sa

from alembic import op

revision = "0002_subjects"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("sites")}


def upgrade() -> None:
    # 0001 maakt het schema via create_all uit de huidige modellen; op een verse
    # database bestaan de kolommen dan al.
    existing = _columns()
    if "subject" not in existing:
        op.add_column("sites", sa.Column("subject", sa.String(50), nullable=True))
    if "path" not in existing:
        op.add_column(
            "sites", sa.Column("path", sa.String(100), nullable=False, server_default="")
        )


def downgrade() -> None:
    op.drop_column("sites", "path")
    op.drop_column("sites", "subject")
