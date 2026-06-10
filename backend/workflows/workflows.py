from datetime import timedelta
from temporalio import workflow

# Import activities safely using string names inside workflow to avoid serialization checks
with workflow.unsafe.imports_passed_through():
    from backend.db.database import SessionLocal
    from backend.db.models import Run

@workflow.defn
class OrderSupervisorWorkflow:
    def __init__(self) -> None:
        self._events_received = []
        self._new_instructions = []
        self._paused = False
        self._terminated = False
        self._wake_needed = False
        self._sleep_hours = 6

    @workflow.run
    async def run(self, run_id: str) -> str:
        # Initial run
        self._wake_needed = True

        while not self._terminated:
            # Wait until workflow is not paused and either wake is needed or events/instructions arrive
            await workflow.wait_condition(
                lambda: not self._paused and (self._wake_needed or len(self._events_received) > 0 or len(self._new_instructions) > 0 or self._terminated)
            )

            if self._terminated:
                break

            # Slice/copy the current batch of events and instructions (Case 3 & 13)
            events_to_process = list(self._events_received)
            instructions_to_process = list(self._new_instructions)

            # Mark run as active reasoning in Database
            await workflow.execute_activity(
                "update_run_state",
                {"run_id": run_id, "state": "evaluating", "status": "running"},
                start_to_close_timeout=timedelta(seconds=10)
            )

            # Run agent decision Activity
            decision = await workflow.execute_activity(
                "run_agent_activity",
                {
                    "run_id": run_id,
                    "events": events_to_process,
                    "instructions": instructions_to_process
                },
                start_to_close_timeout=timedelta(seconds=30)
            )

            action = decision.get("action", "none")
            reasoning = decision.get("reasoning", "")
            self._sleep_hours = decision.get("sleep_hours", 6)
            new_memory = decision.get("memory_update", "")

            # Execute action if selected
            if action != "none":
                await workflow.execute_activity(
                    "execute_action_activity",
                    {"run_id": run_id, "action": action, "reasoning": reasoning},
                    start_to_close_timeout=timedelta(seconds=10)
                )

            # Update memory
            if new_memory:
                await workflow.execute_activity(
                    "update_memory_activity",
                    {"run_id": run_id, "memory": new_memory},
                    start_to_close_timeout=timedelta(seconds=10)
                )

            # Slice out the processed events and instructions (preserving any that arrived during execution)
            self._events_received = self._events_received[len(events_to_process):]
            self._new_instructions = self._new_instructions[len(instructions_to_process):]
            
            if len(self._events_received) == 0 and len(self._new_instructions) == 0:
                self._wake_needed = False

            # Sleep
            await workflow.execute_activity(
                "update_run_state",
                {
                    "run_id": run_id, 
                    "state": "resting", 
                    "status": "sleeping", 
                    "next_wakeup_at_delta_hours": self._sleep_hours
                },
                start_to_close_timeout=timedelta(seconds=10)
            )

            # Wait for next wake: either hours sleep timer, signal event, or instruction (Case 2, 14, 15)
            sleep_duration = timedelta(hours=self._sleep_hours)
            start_time = workflow.now()
            while (workflow.now() - start_time) < sleep_duration and not self._terminated:
                if self._paused:
                    pause_start = workflow.now()
                    await workflow.wait_condition(lambda: not self._paused or self._terminated)
                    start_time += (workflow.now() - pause_start)
                    if self._terminated:
                        break

                remaining = sleep_duration - (workflow.now() - start_time)
                if remaining <= timedelta(0):
                    self._wake_needed = True
                    break

                try:
                    await workflow.wait_condition(
                        lambda: self._paused or len(self._events_received) > 0 or len(self._new_instructions) > 0 or self._terminated,
                        timeout=remaining
                    )
                    if len(self._events_received) > 0 or len(self._new_instructions) > 0 or self._terminated:
                        self._wake_needed = True
                        break
                except TimeoutError:
                    self._wake_needed = True
                    break

        # Generate summary on terminal transition
        await workflow.execute_activity(
            "generate_summary_activity",
            run_id,
            start_to_close_timeout=timedelta(seconds=30)
        )

        return "completed"

    @workflow.signal
    def receive_event(self, event_type: str, payload: dict) -> None:
        # Case 18: Ignore duplicate delivered events if already terminated
        if event_type == "delivered" and self._terminated:
            return

        self._events_received.append({"eventType": event_type, "payload": payload})
        
        # Immediate wake up for high priority event classifiers
        IMPORTANT_EVENTS = ["payment_failed", "shipment_delayed", "refund_requested", "customer_message_received", "delivered"]
        # Case 17: Unclassified event types trigger immediate wake-up
        KNOWN_EVENTS = {"order_created", "payment_failed", "shipment_delayed", "refund_requested", "customer_message_received", "delivered"}
        
        if event_type in IMPORTANT_EVENTS or event_type not in KNOWN_EVENTS:
            self._wake_needed = True
            
        if event_type == "delivered":
            self._terminated = True

    @workflow.signal
    def add_instruction(self, instruction: str) -> None:
        self._new_instructions.append(instruction)
        self._wake_needed = True

    @workflow.signal
    def pause_workflow(self) -> None:
        self._paused = True

    @workflow.signal
    def resume_workflow(self) -> None:
        self._paused = False

    @workflow.signal
    def terminate_workflow(self) -> None:
        self._terminated = True
