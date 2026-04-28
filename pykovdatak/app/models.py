from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class FilenameInfo:
    scenario_name: str
    date_played: datetime


@dataclass
class ScenarioRecord:
    id: str
    file_path: str
    file_name: str
    scenario_name: str
    date_played: datetime
    stats: Dict[str, Any]
    events: List[List[str]]
    has_trace: bool = False
    trace_id: Optional[str] = None

    def to_jsonable(self) -> Dict[str, Any]:
        d = asdict(self)
        d["date_played"] = self.date_played.isoformat()
        return d

