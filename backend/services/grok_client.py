import os
import json
import logging
import time
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# Known events list
KNOWN_EVENTS = {"order_created", "payment_failed", "shipment_delayed", "refund_requested", "customer_message_received", "delivered", "instruction_added"}

class GrokClient:
    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY") or os.getenv("GROK_API_KEY")
        self.model = os.getenv("GROQ_MODEL") or os.getenv("GROK_MODEL", "llama-3.3-70b-versatile")
        
        self.client = None
        if self.api_key:
            try:
                from groq import Groq
                self.client = Groq(api_key=self.api_key)
                logger.info("Groq/Grok client successfully initialized.")
            except ImportError:
                logger.warning("groq package not installed. Falling back to Mock Agent.")
        else:
            logger.warning("No GROQ_API_KEY or GROK_API_KEY environment variable found. Mock Agent will be used.")

    def run_agent(self, base_instruction: str, memory_summary: str, recent_events: List[Dict[str, Any]], instructions: List[str], actions_history: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        # Case 1: Deduplicate events by hashing eventType + payload
        unique_events = []
        seen_hashes = set()
        for e in recent_events:
            event_type = e.get("eventType")
            payload = e.get("payload")
            payload_str = json.dumps(payload, sort_keys=True) if payload is not None else ""
            event_hash = f"{event_type}:{payload_str}"
            if event_hash not in seen_hashes:
                seen_hashes.add(event_hash)
                unique_events.append(e)
            else:
                logger.info(f"Suppressed duplicate event: {event_hash}")

        if self.client:
            # Case 8: Retry loop with up to 3 attempts
            for attempt in range(3):
                try:
                    decision = self._call_groq_api(base_instruction, memory_summary, unique_events, instructions, actions_history)
                    return self._validate_and_sanitize_decision(decision, memory_summary)
                except Exception as e:
                    logger.error(f"Error calling Groq API (attempt {attempt + 1}/3): {e}")
                    if attempt == 2:
                        logger.error("All Groq API retries failed. Falling back to Mock Agent.")
                    else:
                        time.sleep(1) # wait before retry

        return self._run_mock_agent(unique_events, memory_summary, instructions, actions_history)

    def generate_final_summary(self, memory_summary: str, history: List[Dict[str, Any]]) -> Dict[str, str]:
        if self.client:
            for attempt in range(3):
                try:
                    summary = self._call_groq_summary_api(memory_summary, history)
                    # Validate summary has all keys
                    if all(k in summary for k in ["final_summary", "key_learnings", "recommendations"]):
                        return summary
                    raise ValueError("Summary response missing required keys")
                except Exception as e:
                    logger.error(f"Error calling Groq Summary API (attempt {attempt + 1}/3): {e}")
                    if attempt == 2:
                        logger.error("All Groq Summary API retries failed. Falling back to Mock Report.")
                    else:
                        time.sleep(1)
        return self._generate_mock_summary(history)

    def _call_groq_api(self, base_instruction: str, memory_summary: str, recent_events: List[Dict[str, Any]], instructions: List[str], actions_history: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        prompt = f"""
You are the Order Supervisor agent.
Base Instruction: {base_instruction}
Current Memory Summary: {memory_summary}
Recent Events: {json.dumps(recent_events, default=str)}
Manual Overrides / Special Instructions (Listed chronologically; later instructions override/supersede conflicting previous ones): {json.dumps(instructions)}
Previous Actions Taken: {json.dumps(actions_history or [], default=str)}

Available Actions:
- message_fulfillment_team
- message_payments_team
- message_logistics_team
- message_customer
- create_internal_note
- none (if no action is needed)

Analyze the context and choose the next action. You MUST respond with a valid raw JSON object matching this structure EXACTLY:
{{
  "action": "action_name_or_none",
  "reasoning": "Reason for your decision",
  "sleep_hours": 6,
  "memory_update": "Updated memory overview incorporating the new events and decisions"
}}
Do not write anything except the raw JSON object.
"""
        # Case 8: Configure request timeout (10 seconds) on the call
        chat_completion = self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a helpful, precise JSON-only backend assistant."},
                {"role": "user", "content": prompt}
            ],
            model=self.model,
            response_format={"type": "json_object"},
            timeout=10.0
        )
        content = chat_completion.choices[0].message.content
        return json.loads(content)

    def _call_groq_summary_api(self, memory_summary: str, history: List[Dict[str, Any]]) -> Dict[str, str]:
        prompt = f"""
You are an Operations Analyst finalizing an order supervisor workflow run.
Memory Summary: {memory_summary}
Workflow History: {json.dumps(history, default=str)}

Based on the run history, generate a completion report. You MUST respond with a valid raw JSON object matching this structure:
{{
  "final_summary": "Summary of the order lifecycle and major interventions.",
  "key_learnings": "What went wrong, delays encountered, bottlenecks identified.",
  "recommendations": "Suggested improvements for future orders."
}}
Do not write anything except the raw JSON object.
"""
        # Case 8: Configure request timeout (10 seconds) on the call
        chat_completion = self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a helpful operational analyst assistant returning raw JSON."},
                {"role": "user", "content": prompt}
            ],
            model=self.model,
            response_format={"type": "json_object"},
            timeout=10.0
        )
        content = chat_completion.choices[0].message.content
        return json.loads(content)

    def _validate_and_sanitize_decision(self, decision: Any, memory_summary: str) -> Dict[str, Any]:
        # Case 7 & 10: Strict validation of fields and fallback values
        if not isinstance(decision, dict):
            raise ValueError("LLM response is not a JSON object/dictionary")
        
        action = decision.get("action", "none")
        reasoning = decision.get("reasoning", "Retained previous state due to parsing fallback.")
        
        # Case 10: Handle empty memory summaries
        memory_update = decision.get("memory_update")
        if not memory_update or not str(memory_update).strip():
            memory_update = memory_summary or "Retained previous state."
            
        try:
            sleep_hours = int(decision.get("sleep_hours", 6))
        except (TypeError, ValueError):
            sleep_hours = 6

        return {
            "action": action,
            "reasoning": reasoning,
            "sleep_hours": sleep_hours,
            "memory_update": memory_update
        }

    def _run_mock_agent(self, recent_events: List[Dict[str, Any]], memory_summary: str, instructions: List[str], actions_history: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        event_types = [e.get("eventType") for e in recent_events]
        
        action = "none"
        reasoning = "All order metrics are normal. No manual intervention required."
        sleep_hours = 12
        new_memory = memory_summary or "Order pipeline monitoring initialized."
        
        # Case 17: Check for unclassified event types (e.g. warehouse_fire)
        unknown_events = [e for e in recent_events if e.get("eventType") not in KNOWN_EVENTS]
        
        if unknown_events:
            action = "create_internal_note"
            reasoning = f"Received unclassified event '{unknown_events[0].get('eventType')}'. Alerted supervisor for manual AI evaluation."
            sleep_hours = 1
            new_memory = f"Unclassified event '{unknown_events[0].get('eventType')}' logged. Awaiting manual resolution."
        elif "payment_failed" in event_types:
            action = "message_payments_team"
            reasoning = "Detected a payment failure event. Notified payments team to verify card details or prompt the customer."
            sleep_hours = 4
            new_memory = "Order payment failed. Notified payments team. Awaiting billing clearance."
        elif "shipment_delayed" in event_types:
            action = "message_logistics_team"
            reasoning = "Logistics logged a shipment delay. Alerted the logistics desk to track the transit status."
            sleep_hours = 6
            new_memory = "Transit delay reported. Message dispatched to logistics. Next audit in 6 hours."
        elif "customer_message_received" in event_types:
            action = "message_fulfillment_team"
            reasoning = "Customer sent an inquiry. Requested support team to review inquiry details."
            sleep_hours = 2
            new_memory = "Customer support inquiry pending. Alerted fulfillment desk."
        elif "delivered" in event_types:
            action = "create_internal_note"
            reasoning = "Order successfully delivered. Creating audit marker to close workflow."
            sleep_hours = 1
            new_memory = "Order delivered successfully. Closing monitoring run."
        elif "order_created" in event_types:
            action = "create_internal_note"
            reasoning = "Order registration parsed. Commencing supervisor cycle."
            sleep_hours = 8
            new_memory = "New order registered. Commenced monitoring. Checking status in 8 hours."

        # Case 16: Chronological overrides check
        if instructions:
            reasoning += f" (Note: Incorporating custom instruction: '{instructions[-1]}')"
            if "immediate" in instructions[-1].lower() or "escalate" in instructions[-1].lower():
                sleep_hours = 1
                action = "message_customer" if "customer" in instructions[-1].lower() else "message_logistics_team"

        # Case 20: Prevent duplicate escalations
        if actions_history and action != "none" and action != "create_internal_note":
            past_actions = {a.get("action") for a in actions_history}
            if action in past_actions:
                reasoning = f"Suppressed duplicate escalation '{action}' as this action was already performed. Reasoning: {reasoning}"
                action = "create_internal_note"

        return {
            "action": action,
            "reasoning": reasoning,
            "sleep_hours": sleep_hours,
            "memory_update": new_memory
        }

    def _generate_mock_summary(self, history: List[Dict[str, Any]]) -> Dict[str, str]:
        has_delay = any("shipment_delayed" in str(h) for h in history)
        has_failed_pay = any("payment_failed" in str(h) for h in history)
        
        summary = "Order completed successfully with regular checks."
        learnings = "No significant issues encountered during the run."
        recommendations = "Ensure shipping channels are maintained for consistent transit times."
        
        if has_delay:
            summary = "Order was finalized after resolving a shipment delay intervention."
            learnings = "Shipment routing experienced temporary bottlenecks in transit operations."
            recommendations = "Add carrier SLAs in dispatch schedules to counter transit delays."
        if has_failed_pay:
            summary = "Order was fulfilled after addressing initial payment validation problems."
            learnings = "Payment authorization system flagged retry errors."
            recommendations = "Integrate instant SMS reminders for card update prompts."
            
        return {
            "final_summary": summary,
            "key_learnings": learnings,
            "recommendations": recommendations
        }
