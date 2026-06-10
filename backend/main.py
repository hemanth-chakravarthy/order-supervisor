import os
from dotenv import load_dotenv

# Load env variables from .env file
load_dotenv()

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from backend.db.database import get_db, engine, Base
from backend.db.models import Supervisor, Run, Activity, MemorySnapshot, Instruction, FinalReport
from backend.schemas import (
    SupervisorCreate, SupervisorResponse, RunCreate, RunResponse,
    RunDetailResponse, EventInject, InstructionCreate, ActivityResponse, MemorySnapshotResponse, FinalReportResponse
)

# Temporal
from temporalio.client import Client
from temporalio.worker import Worker
from backend.workflows.workflows import OrderSupervisorWorkflow
from backend.workflows.activities import (
    run_agent_activity,
    execute_action_activity,
    update_memory_activity,
    generate_summary_activity,
    update_run_state
)

# ── Temporal connection helpers ───────────────────────────────────────────────

def _build_connect_kwargs(namespace: str) -> dict:
    api_key = os.getenv("TEMPORAL_API_KEY", "").strip()
    if api_key:
        return {"namespace": namespace, "tls": True, "api_key": api_key}
    return {"namespace": namespace, "tls": False}


async def _start_temporal_worker(client: Client):
    """Run the Temporal worker in the background (called from lifespan)."""
    worker = Worker(
        client,
        task_queue="order-supervisor",
        workflows=[OrderSupervisorWorkflow],
        activities=[
            run_agent_activity,
            execute_action_activity,
            update_memory_activity,
            generate_summary_activity,
            update_run_state,
        ],
    )
    print("Temporal Worker started inside API process.")
    await worker.run()


# ── App lifespan (startup / shutdown) ────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables
    Base.metadata.create_all(bind=engine)

    # Connect to Temporal and start worker in background
    worker_task = None
    temporal_host      = os.getenv("TEMPORAL_HOST", "localhost:7233")
    temporal_namespace = os.getenv("TEMPORAL_NAMESPACE", "default")
    try:
        client = await Client.connect(temporal_host, **_build_connect_kwargs(temporal_namespace))
        global temporal_client_cache
        temporal_client_cache = client
        worker_task = asyncio.create_task(_start_temporal_worker(client))
        print(f"Connected to Temporal at {temporal_host}")
    except Exception as e:
        print(f"Warning: Temporal unavailable ({e}). Running in fallback mode.")

    yield  # app is running

    # Shutdown: cancel the worker task gracefully
    if worker_task and not worker_task.done():
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
    print("Temporal worker shut down.")


app = FastAPI(title="Order Supervisor API", version="1.0", lifespan=lifespan)

# Temporal Client Cache
temporal_client_cache = None

async def get_temporal_client():
    global temporal_client_cache
    if temporal_client_cache is None:
        temporal_host      = os.getenv("TEMPORAL_HOST", "localhost:7233")
        temporal_namespace = os.getenv("TEMPORAL_NAMESPACE", "default")
        kwargs             = _build_connect_kwargs(temporal_namespace)
        try:
            temporal_client_cache = await Client.connect(temporal_host, **kwargs)
        except Exception as e:
            print(f"Warning: Could not connect to Temporal on {temporal_host}: {e}")
    return temporal_client_cache

@app.post("/api/v1/supervisors", response_model=SupervisorResponse, status_code=status.HTTP_201_CREATED)
def create_supervisor(payload: SupervisorCreate, db: Session = Depends(get_db)):
    supervisor = Supervisor(
        name=payload.name,
        base_instruction=payload.baseInstruction,
        available_actions=payload.availableActions,
        wake_strategy=payload.wakeStrategy,
        model_name=payload.modelName
    )
    db.add(supervisor)
    db.commit()
    db.refresh(supervisor)
    return supervisor

@app.get("/api/v1/supervisors", response_model=List[SupervisorResponse])
def get_supervisors(db: Session = Depends(get_db)):
    return db.query(Supervisor).order_by(Supervisor.created_at.desc()).all()

@app.get("/api/v1/supervisors/{supervisor_id}", response_model=SupervisorResponse)
def get_supervisor(supervisor_id: str, db: Session = Depends(get_db)):
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor template not found")
    return supervisor

@app.delete("/api/v1/supervisors/{supervisor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supervisor(supervisor_id: str, db: Session = Depends(get_db)):
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor template not found")
    db.delete(supervisor)
    db.commit()
    return None

@app.post("/api/v1/runs", response_model=RunResponse)
async def create_run(payload: RunCreate, db: Session = Depends(get_db), client: Client = Depends(get_temporal_client)):
    # Verify supervisor template
    supervisor = db.query(Supervisor).filter(Supervisor.id == payload.supervisorId).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor template not found")

    # Check for active run
    existing_run = db.query(Run).filter(
        Run.order_id == payload.orderId,
        Run.status.in_(["running", "sleeping", "paused"])
    ).first()
    if existing_run:
        return JSONResponse(
            status_code=409,
            content={
                "error": "ORDER_ALREADY_EXISTS",
                "message": "An active workflow already exists for this order.",
                "runId": existing_run.id
            }
        )

    # Initialize database record
    run = Run(
        supervisor_id=payload.supervisorId,
        order_id=payload.orderId,
        status="running",
        current_state="initializing"
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    workflow_id = f"workflow_{run.id}"
    run.workflow_id = workflow_id
    db.commit()

    # Trigger initial activity log
    activity = Activity(
        run_id=run.id,
        activity_type="event",
        activity_subtype="order_created",
        content={"orderId": payload.orderId, "timestamp": str(datetime.utcnow())}
    )
    db.add(activity)

    initial_snapshot = MemorySnapshot(
        run_id=run.id,
        summary="Order supervisor initialized. Commencing order monitoring.",
        event_count=1,
        version=1
    )
    db.add(initial_snapshot)
    db.commit()

    # Start Temporal Workflow
    if client:
        try:
            await client.start_workflow(
                "OrderSupervisorWorkflow",
                run.id,
                id=workflow_id,
                task_queue="order-supervisor",
            )
            print(f"Workflow {workflow_id} spawned successfully.")
        except Exception as e:
            print(f"Error starting Temporal workflow {workflow_id}: {e}")
            # Do not crash the API, mark state as active for local fallback demo
    else:
        print("Warning: Temporal client not available. Running in local fallback mode.")

    return RunResponse(
        runId=run.id,
        workflowId=workflow_id,
        orderId=run.order_id,
        status=run.status,
        currentState=run.current_state,
        created_at=run.created_at
    )

@app.get("/api/v1/runs", response_model=List[RunResponse])
def list_runs(
    status: Optional[str] = None,
    orderId: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Run)
    if status:
        query = query.filter(Run.status == status)
    if orderId:
        query = query.filter(Run.order_id == orderId)
    runs = query.order_by(Run.created_at.desc()).all()
    
    return [
        RunResponse(
            runId=r.id,
            workflowId=r.workflow_id,
            orderId=r.order_id,
            status=r.status,
            currentState=r.current_state,
            created_at=r.created_at
        )
        for r in runs
    ]

@app.get("/api/v1/runs/{run_id}", response_model=RunDetailResponse)
def get_run_detail(run_id: str, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return JSONResponse(
            status_code=404,
            content={"error": "RUN_NOT_FOUND", "message": "The requested workflow run was not found."}
        )

    run_resp = RunResponse(
        runId=run.id,
        workflowId=run.workflow_id,
        orderId=run.order_id,
        status=run.status,
        currentState=run.current_state,
        created_at=run.created_at
    )

    latest_memory = db.query(MemorySnapshot).filter(MemorySnapshot.run_id == run_id).order_by(MemorySnapshot.version.desc()).first()
    memory_resp = None
    if latest_memory:
        memory_resp = MemorySnapshotResponse(
            id=latest_memory.id,
            summary=latest_memory.summary,
            event_count=latest_memory.event_count,
            created_at=latest_memory.created_at
        )

    activities = db.query(Activity).filter(Activity.run_id == run_id).order_by(Activity.created_at.desc()).all()
    activities_resp = [
        ActivityResponse(
            id=act.id,
            activityType=act.activity_type,
            activitySubtype=act.activity_subtype,
            content=act.content,
            reasoning=act.reasoning,
            created_at=act.created_at
        )
        for act in activities
    ]

    final_report_resp = None
    if run.final_report:
        final_report_resp = FinalReportResponse(
            id=run.final_report.id,
            final_summary=run.final_report.final_summary,
            key_learnings=run.final_report.key_learnings,
            recommendations=run.final_report.recommendations,
            completed_at=run.final_report.completed_at
        )

    return RunDetailResponse(
        run=run_resp,
        memory=memory_resp,
        activities=activities_resp,
        finalReport=final_report_resp
    )

@app.post("/api/v1/runs/{run_id}/events")
async def inject_event(run_id: str, payload: EventInject, db: Session = Depends(get_db), client: Client = Depends(get_temporal_client)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return JSONResponse(
            status_code=404,
            content={"error": "RUN_NOT_FOUND", "message": "The requested workflow run was not found."}
        )

    if run.status in ["completed", "terminated", "failed"]:
        return JSONResponse(
            status_code=400,
            content={"error": "TERMINATED_WORKFLOW_SIGNAL", "message": "Cannot interact with a completed workflow."}
        )

    # Record event in db activities
    activity = Activity(
        run_id=run_id,
        activity_type="event",
        activity_subtype=payload.eventType,
        content=payload.payload
    )
    db.add(activity)
    db.commit()

    # Signal Temporal workflow
    if client and run.workflow_id:
        try:
            await client.get_workflow_handle(run.workflow_id).signal(
                "receive_event",
                [payload.eventType, payload.payload]
            )
        except Exception as e:
            print(f"Error signaling workflow {run.workflow_id}: {e}")
            # Mock processing for local fallback
            await run_mock_workflow_evaluation(run_id, payload.eventType, payload.payload, db)
    else:
        # Mock processing for local fallback
        await run_mock_workflow_evaluation(run_id, payload.eventType, payload.payload, db)

    return {"status": "success", "message": "Event injected successfully."}

@app.post("/api/v1/runs/{run_id}/instructions")
async def add_instruction(run_id: str, payload: InstructionCreate, db: Session = Depends(get_db), client: Client = Depends(get_temporal_client)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return JSONResponse(
            status_code=404,
            content={"error": "RUN_NOT_FOUND", "message": "The requested workflow run was not found."}
        )

    if run.status in ["completed", "terminated", "failed"]:
        return JSONResponse(
            status_code=400,
            content={"error": "TERMINATED_WORKFLOW_SIGNAL", "message": "Cannot interact with a completed workflow."}
        )

    # Persist instruction
    instruction = Instruction(
        run_id=run_id,
        instruction=payload.instruction,
        created_by="operator"
    )
    db.add(instruction)

    # Log in activity timeline
    activity = Activity(
        run_id=run_id,
        activity_type="instruction",
        content={"instruction": payload.instruction, "created_by": "operator"}
    )
    db.add(activity)
    db.commit()

    # Signal workflow
    if client and run.workflow_id:
        try:
            await client.get_workflow_handle(run.workflow_id).signal(
                "add_instruction",
                payload.instruction
            )
        except Exception as e:
            print(f"Error signaling instruction to workflow: {e}")
            await run_mock_workflow_evaluation(run_id, "instruction_added", {"instruction": payload.instruction}, db)
    else:
        await run_mock_workflow_evaluation(run_id, "instruction_added", {"instruction": payload.instruction}, db)
            
    return {"status": "success", "message": "Runtime instruction logged."}

@app.post("/api/v1/runs/{run_id}/pause")
async def pause_run(run_id: str, db: Session = Depends(get_db), client: Client = Depends(get_temporal_client)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return JSONResponse(
            status_code=404,
            content={"error": "RUN_NOT_FOUND", "message": "The requested workflow run was not found."}
        )

    run.status = "paused"
    db.commit()

    if client and run.workflow_id:
        try:
            await client.get_workflow_handle(run.workflow_id).signal("pause_workflow")
        except Exception as e:
            print(f"Error signaling pause: {e}")
            
    return {"status": "success", "message": "Run paused."}

@app.post("/api/v1/runs/{run_id}/resume")
async def resume_run(run_id: str, db: Session = Depends(get_db), client: Client = Depends(get_temporal_client)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return JSONResponse(
            status_code=404,
            content={"error": "RUN_NOT_FOUND", "message": "The requested workflow run was not found."}
        )

    run.status = "running"
    db.commit()

    if client and run.workflow_id:
        try:
            await client.get_workflow_handle(run.workflow_id).signal("resume_workflow")
        except Exception as e:
            print(f"Error signaling resume: {e}")

    return {"status": "success", "message": "Run resumed."}

@app.post("/api/v1/runs/{run_id}/terminate")
async def terminate_run(run_id: str, db: Session = Depends(get_db), client: Client = Depends(get_temporal_client)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return JSONResponse(
            status_code=404,
            content={"error": "RUN_NOT_FOUND", "message": "The requested workflow run was not found."}
        )

    run.status = "terminated"
    db.commit()

    if client and run.workflow_id:
        try:
            await client.get_workflow_handle(run.workflow_id).signal("terminate_workflow")
        except Exception as e:
            print(f"Error signaling termination: {e}")
            await run_mock_final_generation(run_id, db)
    else:
        await run_mock_final_generation(run_id, db)

    return {"status": "success", "message": "Run terminated."}

@app.delete("/api/v1/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run(run_id: str, db: Session = Depends(get_db), client: Client = Depends(get_temporal_client)):
    """Hard-delete a run and all its data regardless of status.
    Attempts to cancel the Temporal workflow first (best-effort).
    """
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return JSONResponse(
            status_code=404,
            content={"error": "RUN_NOT_FOUND", "message": "The requested workflow run was not found."}
        )

    # Best-effort: cancel Temporal workflow so it doesn't keep consuming resources
    if client and run.workflow_id and run.status in ["running", "sleeping", "paused"]:
        try:
            handle = client.get_workflow_handle(run.workflow_id)
            await handle.cancel()
            print(f"Temporal workflow {run.workflow_id} cancelled before deletion.")
        except Exception as e:
            print(f"Warning: Could not cancel Temporal workflow {run.workflow_id}: {e}")

    # Hard-delete — cascade removes activities, memory, instructions, final_report
    db.delete(run)
    db.commit()
    return None


# Mock evaluation helpers for when Temporal connection is absent (fallback/offline mode)
async def run_mock_workflow_evaluation(run_id: str, event_type: str, payload: dict, db: Session):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return

    from backend.services.grok_client import GrokClient
    grok = GrokClient()
    
    run.current_state = "evaluating"
    db.commit()
    
    recent_events = [{"eventType": event_type, "payload": payload}]
    instructions_list = [i.instruction for i in run.instructions]
    
    agent_decision = grok.run_agent(
        base_instruction=run.supervisor.base_instruction,
        memory_summary="",
        recent_events=recent_events,
        instructions=instructions_list
    )
    
    # Store decision logs
    action = agent_decision.get("action", "none")
    reasoning = agent_decision.get("reasoning", "")
    
    # Action whitelist check (Case 9)
    whitelist = {
        "message_fulfillment_team",
        "message_payments_team",
        "message_logistics_team",
        "message_customer",
        "create_internal_note",
        "none"
    }
    if action not in whitelist:
        print(f"Warning: Unknown action '{action}' in mock execution. Forcing to 'create_internal_note'.")
        action = "create_internal_note"
        reasoning = f"[Forced from unknown action: '{agent_decision.get('action')}'] {reasoning}"
    
    # Action execution mock
    if action != "none":
        activity = Activity(
            run_id=run_id,
            activity_type="action",
            activity_subtype=action,
            content={"status": "executed", "timestamp": str(datetime.utcnow())},
            reasoning=reasoning
        )
        db.add(activity)
    
    # Sleep Decision
    sleep_hours = agent_decision.get("sleep_hours", 6)
    sleep_activity = Activity(
        run_id=run_id,
        activity_type="sleep_decision",
        content={"sleep_hours": sleep_hours},
        reasoning=f"Scheduling next periodic check in {sleep_hours} hours."
    )
    db.add(sleep_activity)
    
    # Memory snapshot
    latest_memory = db.query(MemorySnapshot).filter(MemorySnapshot.run_id == run_id).order_by(MemorySnapshot.version.desc()).first()
    next_ver = (latest_memory.version + 1) if latest_memory else 1
    
    memory_snapshot = MemorySnapshot(
        run_id=run_id,
        summary=agent_decision.get("memory_update", ""),
        event_count=next_ver,
        version=next_ver
    )
    db.add(memory_snapshot)
    
    run.status = "sleeping"
    run.current_state = "resting"
    db.commit()
    
    # Complete if event is delivered
    if event_type == "delivered":
        await run_mock_final_generation(run_id, db)

async def run_mock_final_generation(run_id: str, db: Session):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run or run.final_report:
        return

    from backend.services.grok_client import GrokClient
    grok = GrokClient()
    
    activities = db.query(Activity).filter(Activity.run_id == run_id).all()
    history = [{"type": a.activity_type, "subtype": a.activity_subtype} for a in activities]
    
    report_data = grok.generate_final_summary("", history)
    
    report = FinalReport(
        run_id=run_id,
        final_summary=report_data.get("final_summary", ""),
        key_learnings=report_data.get("key_learnings", ""),
        recommendations=report_data.get("recommendations", "")
    )
    db.add(report)
    
    run.status = "completed"
    run.current_state = "finished"
    db.commit()
