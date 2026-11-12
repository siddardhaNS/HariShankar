"""seat class description

Revision ID: b7d4e2a9c1f3
Revises: a3c1e7d2b9f4
Create Date: 2026-11-12 10:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = 'b7d4e2a9c1f3'
down_revision: str | None = 'a3c1e7d2b9f4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('seat_classes', sa.Column('description', sa.String(length=200), server_default='', nullable=False))


def downgrade() -> None:
    op.drop_column('seat_classes', 'description')
