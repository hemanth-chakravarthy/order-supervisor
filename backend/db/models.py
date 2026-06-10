import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, JSON, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from backend.db.database import Base

# Helper to generate string/UUID compatibility
def generate_uuid():
    return str(uuid.uuid4())

class Supervisor(Base):
    __tablename__ = "supervisors"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    base_instruction = Column(Text, nullable=False)
    available_actions = Column(JSON, nullable=False)  # JSON list of actions
    wake_strategy = Column(String(50), nullable=True)
    model_name = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    runs = relationship("Run", back_populates="supervisor", cascade="all, delete-orphan")

class Run(Base):
    __tablename__ = "runs"

    __table_args__ = (
        Index(
            "idx_unique_active_order",
            "order_id",
            unique=True,
            postgresql_where="status IN ('running', 'sleeping', 'paused')",
            sqlite_where="status IN ('running', 'sleeping', 'paused')"
        ),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    supervisor_id = Column(String(36), ForeignKey("supervisors.id"), nullable=False)
    order_id = Column(String(100), nullable=False)
    workflow_id = Column(String(255), unique=True, nullable=True)
    status = Column(String(50), nullable=False, default="running")  # running, sleeping, paused, completed, terminated, failed
    current_state = Column(String(50), nullable=False, default="initializing")
    next_wakeup_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    supervisor = relationship("Supervisor", back_populates="runs")
    activities = relationship("Activity", back_populates="run", cascade="all, delete-orphan")
    memory_snapshots = relationship("MemorySnapshot", back_populates="run", cascade="all, delete-orphan")
    instructions = relationship("Instruction", back_populates="run", cascade="all, delete-orphan")
    final_report = relationship("FinalReport", back_populates="run", uselist=False, cascade="all, delete-orphan")

class Activity(Base):
    __tablename__ = "activities"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    run_id = Column(String(36), ForeignKey("runs.id"), nullable=False)
    activity_type = Column(String(50), nullable=False)  # event, action, wake_decision, sleep_decision, instruction, memory_update, workflow_completion
    activity_subtype = Column(String(100), nullable=True)
    content = Column(JSON, nullable=False)
    reasoning = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("Run", back_populates="activities")

class MemorySnapshot(Base):
    __tablename__ = "memory_snapshots"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    run_id = Column(String(36), ForeignKey("runs.id"), nullable=False)
    summary = Column(Text, nullable=False)
    event_count = Column(Integer, default=0)
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("Run", back_populates="memory_snapshots")

class Instruction(Base):
    __tablename__ = "instructions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    run_id = Column(String(36), ForeignKey("runs.id"), nullable=False)
    instruction = Column(Text, nullable=False)
    created_by = Column(String(100), default="system")
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("Run", back_populates="instructions")

class FinalReport(Base):
    __tablename__ = "final_reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    run_id = Column(String(36), ForeignKey("runs.id"), nullable=False, unique=True)
    final_summary = Column(Text, nullable=False)
    key_learnings = Column(Text, nullable=False)
    recommendations = Column(Text, nullable=False)
    completed_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("Run", back_populates="final_report")
