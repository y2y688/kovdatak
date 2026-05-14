from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .config import data_root, assets_root
from .steam_loginusers import parse_most_recent_user


# Kovaak API endpoints
SCENARIO_SEARCH_URL = "https://kovaaks.com/webapp-backend/scenario/popular?page=%d&max=%d&scenarioNameSearch=%s"


def get_scenario_info(scenario_name: str) -> Optional[Dict[str, Any]]:
    """
    Get scenario info including leaderboardId, total entries, and top score.
    Returns None if scenario not found.
    """
    page = 0
    per_page = 10
    url = SCENARIO_SEARCH_URL % (page, per_page, urllib.parse.quote(scenario_name))
    req = urllib.request.Request(url, headers={"User-Agent": "pykovdatak"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    for entry in data.get("data", []):
        if entry.get("scenarioName") == scenario_name:
            ts = entry.get("topScore") or {}
            return {
                "leaderboardId": int(entry.get("leaderboardId") or 0),
                "totalPlays": int(entry.get("counts", {}).get("plays") or 0),
                "totalEntries": int(entry.get("counts", {}).get("entries") or 0),
                "topScore": float(ts.get("score") or 0) if ts.get("score") is not None else None,
            }
    return None


KOVAAKS_PLAYER_PROGRESS_URL = (
    "https://kovaaks.com/webapp-backend/benchmarks/player-progress-rank-benchmark"
    "?benchmarkId={benchmark_id}&steamId={steam_id}"
)

def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _benchmarks_data_path() -> Path:
    return (assets_root() / "app" / "data" / "default_benchmarks.json").resolve()


def _initial_threshold_baseline_go(thresholds: List[float]) -> float:
    n = len(thresholds)
    if n <= 1:
        return 0.0
    diffs: List[float] = []
    for i in range(1, n):
        a = float(thresholds[i])
        b = float(thresholds[i - 1])
        d = a - b
        if d > 0 and not math.isnan(d) and not math.isinf(d):
            diffs.append(d)
    if not diffs:
        return 0.0
    diffs.sort()
    # median
    mid = len(diffs) // 2
    if len(diffs) % 2 == 1:
        med = diffs[mid]
    else:
        med = (diffs[mid - 1] + diffs[mid]) / 2.0
    base = float(thresholds[0]) - med
    if base < 0:
        base = 0.0
    if math.isnan(base) or math.isinf(base):
        base = 0.0
    return base


def _parse_progress_tokens(raw: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], int, float]:
    """
    Port of internal/benchmarks/service.go parseProgressTokens + parseCategories + parseScenarios

    Returns:
      scenarios: list of {name, score, scenarioRank, thresholds, progress}
      ranks: list of {name,color}
      overall_rank: int
      benchmark_progress: float
    """
    doc = json.loads(raw)
    ranks = []
    for r in doc.get("ranks", []) or []:
        name = str(r.get("name", "")).strip()
        if not name or name.lower() == "no rank":
            continue
        ranks.append({"name": name, "color": str(r.get("color", "")).strip()})

    overall_rank = int(doc.get("overall_rank") or 0)
    bench_prog = float(doc.get("benchmark_progress") or 0.0)

    scenarios: List[Dict[str, Any]] = []
    cats = doc.get("categories", {}) or {}
    # categories is an object whose values include "scenarios" object
    for _cat_name, cat_obj in cats.items():
        scen_map = (cat_obj or {}).get("scenarios", {}) or {}
        for scen_name, scen_obj in scen_map.items():
            s: Dict[str, Any] = {"name": str(scen_name)}
            score = float((scen_obj or {}).get("score") or 0.0)
            s["score"] = score / 100.0  # Go divides by 100
            s["scenarioRank"] = int((scen_obj or {}).get("scenario_rank") or 0)
            # Extract leaderboard rank (global ranking)
            lb_rank = (scen_obj or {}).get("leaderboard_rank")
            s["leaderboardRank"] = int(lb_rank) if lb_rank is not None else None
            thresholds = [float(x) for x in ((scen_obj or {}).get("rank_maxes") or [])]
            s["thresholds"] = thresholds
            if thresholds:
                base = _initial_threshold_baseline_go(thresholds)
                full = [base] + thresholds
                s["thresholds"] = full
                max_thr = full[-1]
                s["progress"] = (s["score"] / max_thr) * 100.0 if max_thr > 0 else 0.0
            else:
                s["progress"] = 0.0
            scenarios.append(s)

    return scenarios, ranks, overall_rank, bench_prog


def _merge_rank_defs(ranks: List[Dict[str, Any]], diff: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rank_colors = (diff or {}).get("rankColors") or {}
    out: List[Dict[str, Any]] = []
    for r in ranks:
        name = str(r.get("name", "")).strip()
        if not name or name.lower() == "no rank":
            continue
        col = str(r.get("color", "")).strip()
        # override using diff.rankColors (case-insensitive name match)
        for k, v in rank_colors.items():
            if str(k).strip().lower() == name.lower() and str(v).strip():
                col = str(v).strip()
                break
        if not col:
            col = "#60a5fa"
        out.append({"name": name, "color": col})
    return out


def _group_scenarios_by_meta(scenarios: List[Dict[str, Any]], diff: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Port of groupScenariosByMeta:
    diff.categories -> categoryName/subcategories -> scenarioCount slicing
    """
    cats_meta = (diff or {}).get("categories") or []
    if not cats_meta:
        return [{"name": "", "color": "", "groups": [{"scenarios": scenarios}]}]

    pos = 0
    out: List[Dict[str, Any]] = []
    for ci, c in enumerate(cats_meta):
        pc: Dict[str, Any] = {"name": c.get("categoryName", ""), "color": c.get("color", ""), "groups": []}
        subs = c.get("subcategories") or []
        for sub in subs:
            take = int(sub.get("scenarioCount") or 0)
            if take < 0:
                take = 0
            end = min(len(scenarios), pos + take)
            chunk = scenarios[pos:end]
            pos = end
            pc["groups"].append(
                {
                    "name": sub.get("subcategoryName", ""),
                    "color": sub.get("color", ""),
                    "scenarios": chunk,
                }
            )
        # last category takes remainder (matches Go)
        if ci == len(cats_meta) - 1 and pos < len(scenarios):
            pc["groups"].append({"name": "", "color": "", "scenarios": scenarios[pos:]})
            pos = len(scenarios)
        out.append(pc)
    return out


@dataclass
class BenchmarksService:
    steam_id: str
    steam_install_dir: str = ""
    steam_id_override: str = ""

    def get_benchmarks(self) -> List[Dict[str, Any]]:
        return _read_json(_benchmarks_data_path())

    def find_diff_by_benchmark_id(self, benchmark_id: int) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        for b in self.get_benchmarks():
            for d in b.get("difficulties") or []:
                if int(d.get("kovaaksBenchmarkId") or 0) == int(benchmark_id):
                    return b, d
        return None, None

    def fetch_player_progress_raw(self, benchmark_id: int) -> str:
        sid = self.resolve_steam_id()
        if not sid:
            raise ValueError("steam id not found; set steam_install_dir or steam_id_override (or steam_id)")
        url = KOVAAKS_PLAYER_PROGRESS_URL.format(
            benchmark_id=int(benchmark_id),
            steam_id=urllib.parse.quote(str(sid)),
        )
        req = urllib.request.Request(url, headers={"User-Agent": "pykovdatak"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read()
        return body.decode("utf-8", errors="replace")

    def resolve_steam_id(self) -> str:
        # Priority 1: explicit steam_id
        if str(self.steam_id or "").strip():
            return str(self.steam_id).strip()
        # Priority 2: override
        if str(self.steam_id_override or "").strip():
            return str(self.steam_id_override).strip()
        # Priority 3: env override (matches Go env var name)
        env = str(os.environ.get("REFLEKS_STEAM_ID") or "").strip()
        if env:
            return env
        # Priority 4: parse loginusers.vdf MostRecent
        steam_dir = str(self.steam_install_dir or "").strip()
        if not steam_dir:
            return ""
        loginusers = str((Path(steam_dir) / "config" / "loginusers.vdf").resolve())
        try:
            sid, _persona = parse_most_recent_user(loginusers)
            return str(sid or "").strip()
        except Exception:
            return ""

    def build_progress(self, benchmark_id: int) -> Dict[str, Any]:
        raw = self.fetch_player_progress_raw(benchmark_id)
        scenarios, ranks, overall_rank, bench_prog = _parse_progress_tokens(raw)
        _b, diff = self.find_diff_by_benchmark_id(benchmark_id)
        return {
            "overallRank": int(overall_rank),
            "benchmarkProgress": float(bench_prog),
            "ranks": _merge_rank_defs(ranks, diff),
            "categories": _group_scenarios_by_meta(scenarios, diff),
        }
