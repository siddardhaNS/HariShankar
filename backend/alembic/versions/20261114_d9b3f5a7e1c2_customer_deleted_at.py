"""customers can delete their account

Revision ID: d9b3f5a7e1c2
Revises: c4e8a1f6d2b7
Create Date: 2026-11-14 12:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = 'd9b3f5a7e1c2'
down_revision: str | None = 'c4e8a1f6d2b7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('customers', 'deleted_at')
