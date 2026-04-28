from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import psutil
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from .models import ScenarioRecord
from .parser import parse_filename, parse_stats_file, parse_tod_on_date
from .mouse_tracker import MouseTracker
from .trace_store import TraceStore

logger = logging.getLogger(__name__)


def _to_float(v: Any) -> float:
    try:
        return float(v)
    except Exception:
        return 0.0


def _derive_window(end_dt: datetime, stats: Dict[str, Any], events: List[List[str]]) -> tuple[datetime, datetime]:
    start = None
    if "Challenge Start" in stats:
        t = parse_tod_on_date(str(stats["Challenge Start"]), end_dt)
        if t is not None:
            start = t
    if start is None and events and len(events[0]) > 1:
        t = parse_tod_on_date(events[0][1], end_dt)
        if t is not None:
            start = t
    if start is None:
        start = end_dt - timedelta(seconds=60)
    if start > end_dt:
        start = start - timedelta(days=1)
    return start, end_dt


class _StatsEventHandler(FileSystemEventHandler):
    def __init__(self, on_file: Callable[[str], None]):
        self._on_file = on_file

    def on_created(self, event):
        if getattr(event, "is_directory", False):
            return
        self._on_file(event.src_path)

    def on_moved(self, event):
        if getattr(event, "is_directory", False):
            return
        self._on_file(event.dest_path)


class StatsPipeline:
    """
    Watches a stats directory, parses new files into ScenarioRecord, emits callbacks,
    and attaches mouse traces when available.
    """

    def __init__(
        self,
        stats_dir: str,
        traces_dir: str,
        kovaaks_process_name: str,
        mouse_buffer_seconds: int,
        mouse_tracking_enabled: bool = True,
        min_sample_interval: float = 0.0,
    ):
        self.stats_dir = Path(stats_dir) if stats_dir else Path()
        self.traces = TraceStore(traces_dir)
        self.process_name = kovaaks_process_name
        self.mouse = MouseTracker(
            buffer_seconds=mouse_buffer_seconds,
            min_sample_interval=min_sample_interval,
        )
        self.mouse_tracking_enabled = bool(mouse_tracking_enabled)

        self._seen: set[str] = set()
        self._recent: List[ScenarioRecord] = []
        self._lock = threading.RLock()
        self._on_record: List[Callable[[ScenarioRecord], None]] = []

        self._observer: Optional[Observer] = None
        self._stop = threading.Event()
        self._proc_thread: Optional[threading.Thread] = None

    def add_listener(self, fn: Callable[[ScenarioRecord], None]) -> None:
        self._on_record.append(fn)

    def recent(self, limit: int = 200) -> List[ScenarioRecord]:
        with self._lock:
            # Return cached data directly - trace IDs were already resolved during file parsing
            slice_ = self._recent[-limit:]
            return list(reversed(slice_))

    def _emit(self, rec: ScenarioRecord) -> None:
        for fn in list(self._on_record):
            try:
                fn(rec)
            except Exception:
                pass

    def _is_stats_file(self, path: str) -> bool:
        return path.lower().endswith(" stats.csv")

    def _wait_until_stable(self, path: str, timeout_s: float = 0.5) -> bool:
        # Skip waiting for existing files during initial scan - they're already stable
        # Only wait for files that might still be written (very recent files)
        try:
            file_age = time.time() - Path(path).stat().st_mtime
            # If file is older than 5 seconds, assume it's stable
            if file_age > 5.0:
                return True
        except Exception:
            pass

        # Quick check for potentially still-writing files
        start = time.time()
        last = None
        while time.time() - start < timeout_s:
            try:
                sz = Path(path).stat().st_size
            except Exception:
                time.sleep(0.1)
                continue
            if last is not None and sz == last:
                return True
            last = sz
            time.sleep(0.1)
        return True

    def _handle_file(self, path: str) -> None:
        if not self._is_stats_file(path):
            return
        p = str(Path(path))
        with self._lock:
            if p in self._seen:
                return
            self._seen.add(p)
        self._wait_until_stable(p)
        try:
            rec = self.parse_one(p)
        except Exception as e:
            logger.error(f"解析文件失败 {path}: {e}", exc_info=True)
            return
        with self._lock:
            self._recent.append(rec)
            if len(self._recent) > 2000:
                self._recent = self._recent[-2000:]
        self._emit(rec)

    def parse_one(self, path: str) -> ScenarioRecord:
        info = parse_filename(Path(path).name)
        events, stats = parse_stats_file(path)

        # derived metrics
        stats["Date Played"] = info.date_played.isoformat()
        hit = _to_float(stats.get("Hit Count", 0))
        miss = _to_float(stats.get("Miss Count", 0))
        denom = hit + miss
        stats["Accuracy"] = (hit / denom) if denom > 0 else 0.0

        # Real Avg TTK from consecutive kill event times (best-effort)
        times: List[datetime] = []
        for row in events:
            if len(row) < 2:
                continue
            t = parse_tod_on_date(row[1], info.date_played)
            if t is not None:
                times.append(t)
        if len(times) >= 2:
            dts = [(times[i] - times[i - 1]).total_seconds() for i in range(1, len(times))]
            dts = [d for d in dts if d > 0]
            stats["Real Avg TTK"] = (sum(dts) / len(dts)) if dts else None

        start_dt, end_dt = _derive_window(info.date_played, stats, events)
        stats["Duration"] = max(0.0, (end_dt - start_dt).total_seconds())

        canonical = self.traces.trace_id_for_stats_file(Path(path).name)
        resolved = self.traces.resolve_trace_id_for_stats(Path(path).name)
        has_trace = False

        # 提取击杀事件的时间戳（用于标记命中）
        kill_timestamps: List[float] = []
        for row in events:
            if len(row) >= 2:
                t = parse_tod_on_date(row[1], info.date_played)
                if t is not None:
                    kill_timestamps.append(t.timestamp())

        if self.mouse.enabled():
            pts = self.mouse.get_range(start_dt.timestamp(), end_dt.timestamp())
            if pts:
                # Only write if not already present to avoid churn
                if not self.traces.exists(canonical):
                    self.traces.save(
                        canonical,
                        pts,
                        meta={
                            "fileName": Path(path).name,
                            "scenarioName": info.scenario_name,
                            "datePlayed": info.date_played.isoformat(),
                        },
                        kill_events=kill_timestamps,
                    )
                has_trace = True
        # No live capture available (e.g. after restart). Check if persisted data exists.
        if not has_trace and resolved:
            has_trace = True
        elif not has_trace and self.traces.exists(canonical):
            has_trace = True

        trace_id_out = None
        if has_trace:
            # Prefer on-disk stem if it differs slightly from canonical (copied traces / unicode).
            trace_id_out = resolved if resolved else canonical

        rec = ScenarioRecord(
            id=str(uuid.uuid4()),
            file_path=str(Path(path).resolve()),
            file_name=Path(path).name,
            scenario_name=info.scenario_name,
            date_played=info.date_played,
            stats=stats,
            events=events,
            has_trace=has_trace,
            trace_id=trace_id_out,
        )
        return rec

    def _process_loop(self) -> None:
        running = False
        while not self._stop.is_set():
            alive = False
            try:
                target = self.process_name.lower()
                if not target.endswith(".exe"):
                    target = target + ".exe"
                logger.debug(f"检查游戏进程: {target}")
                for p in psutil.process_iter(attrs=["name"]):
                    pname = (p.info.get("name") or "").lower()
                    if pname == target or pname == target.removesuffix(".exe"):
                        alive = True
                        logger.debug(f"找到游戏进程: {pname} (PID: {p.pid})")
                        break
            except Exception as e:
                logger.error(f"进程检测失败: {e}", exc_info=True)
                alive = False

            if (not self.mouse_tracking_enabled) and running:
                logger.info("鼠标跟踪被禁用，停止跟踪")
                self.mouse.stop()
                running = False
            elif alive and not running and self.mouse_tracking_enabled:
                logger.info(f"检测到游戏进程 {self.process_name}，启动鼠标跟踪")
                self.mouse.start()
                running = self.mouse.enabled()
                logger.info(f"鼠标跟踪启动结果: enabled={running}")
                if not running:
                    logger.warning("鼠标跟踪启动失败，请检查日志")
            elif (not alive) and running:
                logger.info(f"游戏进程 {self.process_name} 已退出，停止鼠标跟踪")
                self.mouse.stop()
                running = False
            time.sleep(1.0)

    def set_mouse_tracking_enabled(self, enabled: bool) -> None:
        logger.info(f"设置鼠标跟踪启用状态: {enabled} (当前: {self.mouse_tracking_enabled})")
        self.mouse_tracking_enabled = bool(enabled)
        if not self.mouse_tracking_enabled and self.mouse.enabled():
            self.mouse.stop()

    def start(self, scan_existing: bool = True, scan_async: bool = True) -> None:
        logger.info(f"启动统计管道: stats_dir={self.stats_dir}, mouse_tracking_enabled={self.mouse_tracking_enabled}")
        if not self.stats_dir or not self.stats_dir.exists():
            # allow start even without a configured directory
            return

        handler = _StatsEventHandler(self._handle_file)
        self._observer = Observer()
        self._observer.schedule(handler, str(self.stats_dir), recursive=False)
        self._observer.start()

        # initial scan (can be expensive if the folder contains many files)
        if scan_existing:
            # Create a callback to emit records as they're parsed
            def on_scanned_record(rec: ScenarioRecord) -> None:
                # Add to recent list
                with self._lock:
                    self._recent.append(rec)
                    if len(self._recent) > 2000:
                        self._recent = self._recent[-2000:]
                    # Write to file
                    with self.records_path.open("a", encoding="utf-8") as f:
                        f.write(json.dumps(rec.to_jsonable(), ensure_ascii=False) + "\n")
                # Emit immediately for real-time UI updates
                self._emit(rec)

            def _scan():
                # Add listener for real-time updates (don't remove existing listeners!)
                self.add_listener(on_scanned_record)
                try:
                    for child in sorted(self.stats_dir.glob("* Stats.csv")):
                        if self._stop.is_set():
                            break
                        self._handle_file(str(child))
                except Exception:
                    pass

            if scan_async:
                threading.Thread(target=_scan, daemon=True).start()
            else:
                _scan()

        self._proc_thread = threading.Thread(target=self._process_loop, daemon=True)
        self._proc_thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._observer is not None:
            self._observer.stop()
            self._observer.join(timeout=3)
            self._observer = None
        self.mouse.stop()

    def set_stats_dir(self, stats_dir: str) -> None:
        """
        Hot-update the watched stats directory.
        This restarts the filesystem observer and re-scans existing files.
        """
        # Stop current threads/observer.
        self.stop()

        # Reset stop flag so start() can run again.
        self._stop = threading.Event()
        self._proc_thread = None

        # Update directory.
        self.stats_dir = Path(stats_dir) if stats_dir else Path()

        with self._lock:
            self._seen.clear()
            self._recent.clear()

        # Restart watching quickly; scan happens in background to avoid blocking API requests/UI.
        self.start(scan_existing=True, scan_async=True)

