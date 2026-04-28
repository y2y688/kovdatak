from __future__ import annotations

import json
from pathlib import Path
from typing import List


class FavoritesStore:
    def __init__(self, path: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def load(self) -> List[str]:
        try:
            if not self.path.exists():
                return []
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return [str(x) for x in data if str(x).strip()]
            return []
        except Exception:
            return []

    def save(self, ids: List[str]) -> None:
        ids2 = [str(x) for x in ids if str(x).strip()]
        self.path.write_text(json.dumps(ids2, ensure_ascii=False, indent=2), encoding="utf-8")

