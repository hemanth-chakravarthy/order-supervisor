from backend.db.database import engine, Base
from backend.db.models import Supervisor, Run, Activity, MemorySnapshot, Instruction, FinalReport

def init_db():
    print("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    print("Database initialization complete.")

if __name__ == "__main__":
    init_db()
