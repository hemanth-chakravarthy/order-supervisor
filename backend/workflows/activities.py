from datetime import datetime, timedelta
from typing import Any
from temporalio import activity
from backend.db.database import SessionLocal
from backend.db.models import Run, Activity, MemorySnapshot, FinalReport
from backend.services.grok_client import GrokClient

@activity.defn
async def run_agent_activity(payload: Any) -> dict:
    if isinstance(payload, dict):
        run_id = payload["run_id"]
        events_batch = payload.get("events")
        instructions_batch = payload.get("instructions")
    else:
        run_id = payload
        events_batch = None
        instructions_batch = None

    db = SessionLocal()
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            raise ValueError(f"Run {run_id} not found")

        # If a specific batch of events was passed from workflow, use it (Case 3 & 13)
        if events_batch is not None:
            recent_events = events_batch
        else:
            events_query = db.query(Activity).filter(
                Activity.run_id == run_id, 
                Activity.activity_type == "event"
            ).order_by(Activity.created_at.asc()).all()
            
            recent_events = [
                {"eventType": e.activity_subtype, "payload": e.content}
                for e in events_query
            ]

        # Fetch instructions
        if instructions_batch is not None:
            instructions = instructions_batch
        else:
            instructions_query = run.instructions
            instructions = [i.instruction for i in instructions_query]

        # Fetch current memory
        latest_memory = db.query(MemorySnapshot).filter(
            MemorySnapshot.run_id == run_id
        ).order_by(MemorySnapshot.version.desc()).first()
        memory_summary = latest_memory.summary if latest_memory else ""

        # Fetch previous actions history (Case 20)
        actions_query = db.query(Activity).filter(
            Activity.run_id == run_id,
            Activity.activity_type == "action"
        ).order_by(Activity.created_at.asc()).all()
        actions_history = [
            {"action": a.activity_subtype, "reasoning": a.reasoning, "timestamp": str(a.created_at)}
            for a in actions_query
        ]

        # Run agent decision
        grok = GrokClient()
        agent_decision = grok.run_agent(
            base_instruction=run.supervisor.base_instruction,
            memory_summary=memory_summary,
            recent_events=recent_events,
            instructions=instructions,
            actions_history=actions_history
        )

        return agent_decision
    finally:
        db.close()

@activity.defn
async def execute_action_activity(payload: dict) -> dict:
    run_id = payload["run_id"]
    action = payload["action"]
    reasoning = payload["reasoning"]

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
        print(f"Warning: Unknown action '{action}' requested. Forcing to 'create_internal_note'.")
        action = "create_internal_note"
        reasoning = f"[Forced from unknown action: '{payload['action']}'] {reasoning}"

    db = SessionLocal()
    try:
        activity_log = Activity(
            run_id=run_id,
            activity_type="action",
            activity_subtype=action,
            content={"status": "executed", "timestamp": str(datetime.utcnow())},
            reasoning=reasoning
        )
        db.add(activity_log)
        db.commit()
        return {"status": "success"}
    finally:
        db.close()

@activity.defn
async def update_memory_activity(payload: dict) -> dict:
    run_id = payload["run_id"]
    new_memory = payload["memory"]

    db = SessionLocal()
    try:
        latest_memory = db.query(MemorySnapshot).filter(
            MemorySnapshot.run_id == run_id
        ).order_by(MemorySnapshot.version.desc()).first()
        
        next_ver = (latest_memory.version + 1) if latest_memory else 1
        
        snapshot = MemorySnapshot(
            run_id=run_id,
            summary=new_memory,
            event_count=next_ver,
            version=next_ver
        )
        db.add(snapshot)
        
        # Log snapshot activity in timeline
        db.add(Activity(
            run_id=run_id,
            activity_type="memory_update",
            content={"version": next_ver, "summary_preview": new_memory[:100]}
        ))
        
        db.commit()
        return {"status": "success"}
    finally:
        db.close()

@activity.defn
async def generate_summary_activity(run_id: str) -> dict:
    db = SessionLocal()
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            raise ValueError(f"Run {run_id} not found")

        # Fetch activities
        activities = db.query(Activity).filter(Activity.run_id == run_id).all()
        history = [
            {"type": a.activity_type, "subtype": a.activity_subtype, "created_at": str(a.created_at)}
            for a in activities
        ]

        latest_memory = db.query(MemorySnapshot).filter(
            MemorySnapshot.run_id == run_id
        ).order_by(MemorySnapshot.version.desc()).first()
        memory_summary = latest_memory.summary if latest_memory else ""

        grok = GrokClient()
        report_data = grok.generate_final_summary(memory_summary, history)

        # Write final report
        report = FinalReport(
            run_id=run_id,
            final_summary=report_data.get("final_summary", ""),
            key_learnings=report_data.get("key_learnings", ""),
            recommendations=report_data.get("recommendations", "")
        )
        db.add(report)
        
        # Log terminal activity
        db.add(Activity(
            run_id=run_id,
            activity_type="workflow_completion",
            content={"status": "completed"}
        ))
        
        run.status = "completed"
        run.current_state = "finished"
        db.commit()
        
        return {"status": "success"}
    finally:
        db.close()

@activity.defn
async def update_run_state(payload: dict) -> dict:
    run_id = payload["run_id"]
    state = payload.get("state")
    status = payload.get("status")
    delta_hours = payload.get("next_wakeup_at_delta_hours")

    db = SessionLocal()
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if run:
            if state:
                run.current_state = state
            if status:
                run.status = status
            if delta_hours is not None:
                run.next_wakeup_at = datetime.utcnow() + timedelta(hours=delta_hours)
            else:
                run.next_wakeup_at = None
            db.commit()
        return {"status": "success"}
    except Exception as e:
        print(f"Error in update_run_state: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        db.close()
