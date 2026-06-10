from pydantic import BaseModel, Field, AliasChoices, field_serializer
from typing import List, Optional, Dict, Any
from datetime import datetime


def utc_iso(dt: datetime) -> str:
    """Serialize a naive UTC datetime to an ISO 8601 string with 'Z' suffix,
    so JavaScript's Date() parses it as UTC and can convert to IST correctly."""
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z"

# Supervisor schemas
class SupervisorCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=100)
    baseInstruction: str = Field(..., max_length=5000)
    availableActions: List[str] = Field(..., min_items=1)
    wakeStrategy: Optional[str] = "default"
    modelName: Optional[str] = "grok-beta"

class SupervisorResponse(BaseModel):
    id: str
    name: str
    baseInstruction: str = Field(..., validation_alias=AliasChoices("base_instruction", "baseInstruction"))
    availableActions: List[str] = Field(..., validation_alias=AliasChoices("available_actions", "availableActions"))
    wakeStrategy: Optional[str] = Field(None, validation_alias=AliasChoices("wake_strategy", "wakeStrategy"))
    modelName: Optional[str] = Field(None, validation_alias=AliasChoices("model_name", "modelName"))
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def serialize_dt(self, dt: datetime) -> str:
        return utc_iso(dt)

    class Config:
        from_attributes = True

# Run schemas
class RunCreate(BaseModel):
    orderId: str = Field(..., min_length=1, max_length=100)
    supervisorId: str

class RunResponse(BaseModel):
    runId: str = Field(..., validation_alias=AliasChoices("id", "runId"))
    workflowId: Optional[str] = Field(None, validation_alias=AliasChoices("workflow_id", "workflowId"))
    orderId: str = Field(..., validation_alias=AliasChoices("order_id", "orderId"))
    status: str
    currentState: str = Field(..., validation_alias=AliasChoices("current_state", "currentState"))
    created_at: datetime

    @field_serializer("created_at")
    def serialize_dt(self, dt: datetime) -> str:
        return utc_iso(dt)

    class Config:
        from_attributes = True

class ActivityResponse(BaseModel):
    id: str
    activityType: str = Field(..., validation_alias=AliasChoices("activity_type", "activityType"))
    activitySubtype: Optional[str] = Field(None, validation_alias=AliasChoices("activity_subtype", "activitySubtype"))
    content: Dict[str, Any]
    reasoning: Optional[str] = None
    created_at: datetime

    @field_serializer("created_at")
    def serialize_dt(self, dt: datetime) -> str:
        return utc_iso(dt)

    class Config:
        from_attributes = True

class MemorySnapshotResponse(BaseModel):
    id: str
    summary: str
    event_count: int
    created_at: datetime

    @field_serializer("created_at")
    def serialize_dt(self, dt: datetime) -> str:
        return utc_iso(dt)

    class Config:
        from_attributes = True

class FinalReportResponse(BaseModel):
    id: str
    final_summary: str
    key_learnings: str
    recommendations: str
    completed_at: datetime

    @field_serializer("completed_at")
    def serialize_dt(self, dt: datetime) -> str:
        return utc_iso(dt)

    class Config:
        from_attributes = True

class RunDetailResponse(BaseModel):
    run: RunResponse
    memory: Optional[MemorySnapshotResponse] = None
    activities: List[ActivityResponse] = []
    finalReport: Optional[FinalReportResponse] = None

    class Config:
        from_attributes = True

# Input schemas for actions
class EventInject(BaseModel):
    eventType: str
    payload: Dict[str, Any] = {}

class InstructionCreate(BaseModel):
    instruction: str = Field(..., min_length=1, max_length=2000)
