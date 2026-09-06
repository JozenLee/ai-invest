import sqlite3

from db import Database
from models.industry_models import ExplorationResult, IndustryStructure
from services.graph_writer import _canonical_snapshot
from services.task_manager import TaskManager
import services.task_manager as task_manager_module


TASK_TABLE = """
CREATE TABLE industry_graph_tasks (
    taskId TEXT PRIMARY KEY, industryId TEXT, industryName TEXT NOT NULL,
    status TEXT NOT NULL, progress INTEGER NOT NULL, currentStep TEXT,
    payload TEXT NOT NULL, error TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
)
"""


def test_graph_task_survives_manager_restart(tmp_path, monkeypatch):
    database = Database(str(tmp_path / "tasks.db"))
    connection = sqlite3.connect(database.db_path)
    connection.execute(TASK_TABLE)
    connection.commit()
    connection.close()
    monkeypatch.setattr(task_manager_module, "db", database)

    manager = TaskManager()
    task = manager.create_task("task-1", "AI算力硬件")
    task.metadata["industry_id"] = "industry-1"
    manager.update_task("task-1", status="reviewing", progress=70)

    restored = TaskManager().get_task("task-1")
    assert restored is not None
    assert restored.status == "reviewing"
    assert restored.metadata["industry_id"] == "industry-1"


def test_segment_relations_are_part_of_revision_hash():
    base = {
        "industry": {"name": "AI算力硬件", "code": "ai_hardware"},
        "structure": [
            {"stage": "上游", "stage_code": "upstream", "description": "供给", "segments": [{"name": "芯片", "code": "chip", "description": "芯片", "key_categories": []}]},
            {"stage": "中游", "stage_code": "midstream", "description": "制造", "segments": [{"name": "服务器", "code": "server", "description": "服务器", "key_categories": []}]},
        ],
        "relationships": [{"from": "chip", "to": "server", "type": "SUPPLIES", "weight": 0.8, "confidence": 0.9}],
    }
    result = ExplorationResult(structure=IndustryStructure(**base), details={})
    snapshot, first_hash = _canonical_snapshot(result)
    snapshot_again, second_hash = _canonical_snapshot(result)

    assert snapshot == snapshot_again
    assert first_hash == second_hash
    assert snapshot["structure"]["relationships"][0]["from"] == "chip"
