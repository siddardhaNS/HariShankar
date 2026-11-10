"""theatre maintenance mode

Revision ID: a3c1e7d2b9f4
Revises: f061c0b41507
Create Date: 2026-11-10 19:20:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = 'a3c1e7d2b9f4'
down_revision: str | None = 'f061c0b41507'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('theatres', sa.Column('maintenance_on', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('theatres', sa.Column('maintenance_message', sa.String(length=300), server_default='', nullable=False))
    op.add_column('theatres', sa.Column('maintenance_password_hash', sa.String(length=100), nullable=True))
    op.add_column('theatres', sa.Column('maintenance_failed_attempts', sa.Integer(), server_default='0', nullable=False))
    op.add_column('theatres', sa.Column('maintenance_locked_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('theatres', sa.Column('maintenance_changed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('theatres', sa.Column('maintenance_changed_by', sa.String(length=120), nullable=True))


def downgrade() -> None:
    for col in ('maintenance_changed_by', 'maintenance_changed_at', 'maintenance_locked_until',
                'maintenance_failed_attempts', 'maintenance_password_hash', 'maintenance_message', 'maintenance_on'):
        op.drop_column('theatres', col)
