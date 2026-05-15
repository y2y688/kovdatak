from __future__ import annotations

import csv
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .models import FilenameInfo


# Example: "Air Tracking 180 - Challenge - 2025.09.09-16.57.00 Stats.csv"
_FILENAME_RE = re.compile(r"^(?P<name>.+?)\s-\s.*?-\s(?P<dt>\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\sStats\.csv$")
_DT_LAYOUT = "%Y.%m.%d-%H.%M.%S"


def parse_filename(filename: str) -> FilenameInfo:
    base = Path(filename).name
    m = _FILENAME_RE.match(base)
    if not m:
        raise ValueError(f"filename did not match expected format: {base}")
    name = m.group("name")
    dt_str = m.group("dt")
    dt = datetime.strptime(dt_str, _DT_LAYOUT)
    return FilenameInfo(scenario_name=name, date_played=dt)


def _is_int(s: str) -> bool:
    try:
        int(s.strip())
        return True
    except Exception:
        return False


def _is_kill_event_row(rec: List[str]) -> bool:
    if len(rec) < 2:
        return False
    if not _is_int(rec[0]):
        return False
    s = rec[1].strip()
    if len(s) < 8:
        return False
    if not (s[2] == ":" and s[5] == ":"):
        return False
    for ch in (s[0], s[1], s[3], s[4], s[6], s[7]):
        if ch < "0" or ch > "9":
            return False
    return True


def _coerce_value(val: str) -> Any:
    v = val.strip()
    if v == "":
        return ""
    try:
        return float(v)
    except Exception:
        return v


def parse_stats_file(path: str) -> Tuple[List[List[str]], Dict[str, Any]]:
    """
    Kovaak's Stats.csv are two sections:
    - a CSV section containing many tables; we keep only per-kill event rows
    - a key-value section with ':,' delimiter (e.g. 'Hit Count:,123')
    """
    events: List[List[str]] = []
    stats: Dict[str, Any] = {}

    text = Path(path).read_text(encoding="utf-8", errors="replace").splitlines()
    is_kv = False
    kv_lines: List[str] = []

    for line in text:
        trimmed = line.strip("\r\n")
        if not trimmed:
            continue
        if not is_kv and ":," in trimmed:
            is_kv = True
        if is_kv:
            kv_lines.append(trimmed)
            continue

        # parse a single CSV row robustly
        rec = next(csv.reader([trimmed], skipinitialspace=True))
        if _is_kill_event_row(rec):
            events.append(rec)

    for l in kv_lines:
        if ":," not in l:
            continue
        key, val = l.split(":,", 1)
        stats[key.strip()] = _coerce_value(val)

    return events, stats


def parse_tod_on_date(tod: str, date: datetime) -> datetime | None:
    s = str(tod).strip()
    for fmt in ("%H:%M:%S.%f", "%H:%M:%S"):
        try:
            t = datetime.strptime(s, fmt)
            return date.replace(hour=t.hour, minute=t.minute, second=t.second, microsecond=t.microsecond)
        except Exception:
            continue
    return None

