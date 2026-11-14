"""test logins managed from the admin

Revision ID: c4e8a1f6d2b7
Revises: b7d4e2a9c1f3
Create Date: 2026-11-14 10:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = 'c4e8a1f6d2b7'
down_revision: str | None = 'b7d4e2a9c1f3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'test_logins',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('mobile', sa.String(length=10), nullable=False),
        sa.Column('code', sa.String(length=6), nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_test_logins')),
        sa.UniqueConstraint('mobile', name=op.f('uq_test_logins_mobile')),
    )


def downgrade() -> None:
    op.drop_table('test_logins')
