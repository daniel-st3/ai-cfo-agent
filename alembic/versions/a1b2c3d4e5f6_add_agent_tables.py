"""add agent tables

Revision ID: a1b2c3d4e5f6
Revises: 3b88199167aa
Create Date: 2026-03-01 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "3b88199167aa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # agent_observations
    op.create_table(
        "agent_observations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("runway_months", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("burn_rate", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("mrr", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("burn_change_pct", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("mrr_change_pct", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("active_anomalies_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fraud_alerts_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("raw_snapshot", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_observations_run_id", "agent_observations", ["run_id"])

    # agent_plans
    op.create_table(
        "agent_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("observation_id", sa.Uuid(), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("plan_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("decision_reasoning", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["observation_id"], ["agent_observations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_plans_run_id", "agent_plans", ["run_id"])

    # agent_actions
    op.create_table(
        "agent_actions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("params", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="executed"),
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("approval_message", sa.Text(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["plan_id"], ["agent_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_actions_plan_id", "agent_actions", ["plan_id"])
    op.create_index("ix_agent_actions_run_id", "agent_actions", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_actions_run_id", "agent_actions")
    op.drop_index("ix_agent_actions_plan_id", "agent_actions")
    op.drop_table("agent_actions")
    op.drop_index("ix_agent_plans_run_id", "agent_plans")
    op.drop_table("agent_plans")
    op.drop_index("ix_agent_observations_run_id", "agent_observations")
    op.drop_table("agent_observations")
