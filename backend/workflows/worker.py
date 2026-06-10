import os
import asyncio
from temporalio.client import Client
from temporalio.worker import Worker
from dotenv import load_dotenv

load_dotenv()

from backend.workflows.workflows import OrderSupervisorWorkflow
from backend.workflows.activities import (
    run_agent_activity,
    execute_action_activity,
    update_memory_activity,
    generate_summary_activity,
    update_run_state
)


async def main():
    temporal_host      = os.getenv("TEMPORAL_HOST", "localhost:7233")
    temporal_namespace = os.getenv("TEMPORAL_NAMESPACE", "default")
    temporal_api_key   = os.getenv("TEMPORAL_API_KEY", "").strip()

    print(f"Connecting worker to Temporal: {temporal_host}  namespace={temporal_namespace}")

    connect_kwargs = dict(
        namespace=temporal_namespace,
        tls=True,           # Temporal Cloud always requires TLS
    )
    if temporal_api_key:
        connect_kwargs["api_key"] = temporal_api_key
    else:
        # Local server — no TLS, no API key
        connect_kwargs["tls"] = False

    try:
        client = await Client.connect(temporal_host, **connect_kwargs)
        print("Connected to Temporal successfully.")
    except Exception as e:
        print(f"Error: Could not connect to Temporal: {e}")
        return

    worker = Worker(
        client,
        task_queue="order-supervisor",
        workflows=[OrderSupervisorWorkflow],
        activities=[
            run_agent_activity,
            execute_action_activity,
            update_memory_activity,
            generate_summary_activity,
            update_run_state
        ],
    )

    print("Temporal Worker started. Listening on task queue 'order-supervisor'...")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
