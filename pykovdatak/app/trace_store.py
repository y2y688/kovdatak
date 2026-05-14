from __future__ import annotations

import json
import logging
import struct
import time
from pathlib import Path
from typing import List, Optional, Dict, Any

from .mouse_tracker import MousePoint

logger = logging.getLogger(__name__)


class TraceStore:
    def __init__(self, base_dir: str):
        logger.info(f"初始化轨迹存储: base_dir={base_dir}")
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        # cache: (monotonic_time, stems_set)
        self._stems_cache_t: float = 0.0
        self._stems_cache: Optional[Set[str]] = None
        # Cache for resolved trace IDs: file_name -> trace_id
        self._resolved_cache: Dict[str, Optional[str]] = {}

    def _trace_bin_path(self, trace_id: str) -> Path:
        return self.base_dir / f"{trace_id}.trace"

    def _to_trace_base_name(self, original_file_name: str) -> str:
        """
        Mirrors the upstream project approach:
        - take the stats filename (basename)
        - strip extension (e.g. .csv)
        - strip trailing ' Stats' if present
        """
        safe = Path(original_file_name).name
        if "." in safe:
            safe = safe.rsplit(".", 1)[0]
        if safe.endswith(" Stats"):
            safe = safe[: -len(" Stats")]
        return safe

    def trace_path(self, trace_id: str) -> Path:
        return self._trace_bin_path(trace_id)

    def trace_id_for_stats_file(self, original_file_name: str) -> str:
        return self._to_trace_base_name(original_file_name)

    def _invalidate_stem_cache(self) -> None:
        self._stems_cache = None
        self._stems_cache_t = 0.0
        self._resolved_cache.clear()

    def _list_trace_stems(self) -> Set[str]:
        """All basenames (no extension) for *.trace / *.json in traces_dir."""
        now = time.monotonic()
        if self._stems_cache is not None and (now - self._stems_cache_t) < 1.5:
            return self._stems_cache
        stems: Set[str] = set()
        try:
            if self.base_dir.exists():
                for p in self.base_dir.iterdir():
                    if not p.is_file():
                        continue
                    suf = p.suffix.lower()
                    if suf in (".trace", ".json"):
                        stems.add(p.stem)
        except OSError:
            stems = set()
        self._stems_cache = stems
        self._stems_cache_t = now
        return stems

    def resolve_trace_id_for_stats(self, original_file_name: str) -> Optional[str]:
        if original_file_name in self._resolved_cache:
            return self._resolved_cache[original_file_name]

        primary = self._to_trace_base_name(original_file_name)
        if self._trace_bin_path(primary).exists():
            self._resolved_cache[original_file_name] = primary
            return primary

        self._resolved_cache[original_file_name] = None
        return None

    def exists(self, trace_id: str) -> bool:
        return self._trace_bin_path(trace_id).exists()

    def resolve_disk_trace_id(self, trace_id: str) -> str:
        return trace_id

    def save(
        self,
        trace_id: str,
        points: List[MousePoint],
        meta: Optional[Dict[str, Any]] = None,
        kill_events: Optional[List[float]] = None,
    ) -> None:
        """
        Write RefleK's v2 .trace format with hit markers.

        Args:
            trace_id: 轨迹ID
            points: 鼠标轨迹点列表
            meta: 元数据
            kill_events: 击杀事件的 Unix 时间戳列表（秒）
        """
        logger.info(f"保存轨迹 {trace_id}: {len(points)} 个点, {len(kill_events or [])} 个击杀事件")

        # 如果有击杀事件，标记点击为命中
        if kill_events:
            points = self._mark_hits(points, kill_events)

        meta_obj = {
            "fileName": (meta or {}).get("fileName", ""),
            "scenarioName": (meta or {}).get("scenarioName", ""),
            "datePlayed": (meta or {}).get("datePlayed", ""),
        }
        meta_bytes = json.dumps(meta_obj, ensure_ascii=False).encode("utf-8")

        # Header: Magic + Version + Flags + MetaLen + MetaJSON
        out = bytearray()
        out += b"RTRC"
        out += bytes([2])  # Version2 (支持 hit 字段)
        out += bytes([0])  # Flags
        out += struct.pack("<I", len(meta_bytes))
        out += meta_bytes

        # Points count
        out += struct.pack("<I", len(points))

        # Points: TS(uint64 nano), X(uint32), Y(uint32), Buttons(uint32), Hit(uint8)
        for pt in points:
            ts_millis = int(round(float(pt.t) * 1000.0))
            ts_nano = ts_millis * 1_000_000
            x_u = int(pt.x) & 0xFFFFFFFF
            y_u = int(pt.y) & 0xFFFFFFFF
            buttons_u = int(getattr(pt, "buttons", 0)) & 0xFFFFFFFF
            hit_u = 1 if getattr(pt, "hit", False) else 0
            out += struct.pack("<QIIIB", ts_nano, x_u, y_u, buttons_u, hit_u)

        p = self._trace_bin_path(trace_id)
        logger.info(f"写入轨迹文件: {p}")
        try:
            p.write_bytes(bytes(out))
            self._invalidate_stem_cache()
            logger.info(f"轨迹文件保存完成: {p}")
        except PermissionError as e:
            logger.error(f"轨迹文件保存权限错误: {e}")
            raise
        except IOError as e:
            logger.error(f"轨迹文件IO错误: {e}")
            raise
        except Exception as e:
            logger.error(f"轨迹文件保存未知错误: {e}", exc_info=True)
            raise

    def _mark_hits(self, points: List[MousePoint], kill_events: List[float]) -> List[MousePoint]:
        """
        标记击杀时间附近的点击为命中。
        改进：对于每个击杀时间，找到之前最近的点击作为命中（解决高速移动对齐问题）

        Args:
            points: 鼠标轨迹点列表
            kill_events: 击杀事件的 Unix 时间戳列表（秒）

        Returns:
            标记后的轨迹点列表
        """
        if not kill_events or not points:
            return points

        # 将击杀事件转换为有序列表
        kill_times = sorted(kill_events)

        # 找出所有有点击的点
        click_points = [(i, pt) for i, pt in enumerate(points) if pt.buttons != 0]

        # 对每个击杀时间，找到之前最近的点击作为命中
        for kill_t in kill_times:
            # 找到所有在击杀时间之前的点击
            earlier_clicks = [(i, pt) for i, pt in click_points if pt.t <= kill_t]
            if not earlier_clicks:
                continue
            # 找到时间最接近（最晚）的那一个
            closest_idx, closest_pt = max(earlier_clicks, key=lambda x: x[1].t)
            # 标记为命中
            points[closest_idx].hit = True

        return points

    def _load_trace_binary(self, trace_id: str) -> dict:
        """
        Read RefleK's .trace format (v1, v2 or v3).
        Layout:
        [Magic:4 'RTRC'][Version:1][Flags:1][MetaLen:4][MetaJSON...][Count:4][Points...]
        v1 Points: repeated [TS:8][X:4][Y:4][Buttons:4] (20 bytes each)
        v2 Points: repeated [TS:8][X:4][Y:4][Buttons:4][Hit:1] (21 bytes each)
        v3 Points: repeated [TS:8][X:4][Y:4][Buttons:4][Hit:1][Speed:4] (25 bytes each)
        TS is stored as UnixMilli * 1_000_000 (nanoseconds), then divided by 1_000_000 on read.
        """
        p = self._trace_bin_path(trace_id)
        data = p.read_bytes()
        off = 0

        def take(n: int) -> bytes:
            nonlocal off
            if off + n > len(data):
                raise ValueError("unexpected EOF")
            b = data[off : off + n]
            off += n
            return b

        magic = take(4)
        if magic != b"RTRC":
            raise ValueError("invalid magic header")
        ver = take(1)[0]
        if ver not in (1, 2, 3):
            raise ValueError(f"unsupported version: {ver}")
        _flags = take(1)[0]

        (meta_len,) = struct.unpack_from("<I", data, off)
        off += 4
        meta_bytes = take(int(meta_len))
        meta = json.loads(meta_bytes.decode("utf-8", errors="replace"))

        (count,) = struct.unpack_from("<I", data, off)
        off += 4

        points = []
        # v1: 20 bytes per point, v2: 21 bytes per point, v3: 25 bytes per point
        point_size = 25 if ver == 3 else (21 if ver == 2 else 20)
        for _ in range(int(count)):
            chunk = take(point_size)
            ts_nano, x_u, y_u, buttons_u = struct.unpack("<QIII", chunk[:20])
            # Convert stored nanoseconds back to UnixMillis, then to seconds float for the frontend
            ts_millis = int(ts_nano // 1_000_000)
            x = struct.unpack("<i", struct.pack("<I", x_u))[0]
            y = struct.unpack("<i", struct.pack("<I", y_u))[0]
            buttons = struct.unpack("<i", struct.pack("<I", buttons_u))[0]
            point = {"ts": ts_millis / 1000.0, "x": x, "y": y, "buttons": buttons}
            # v2 格式支持 hit 字段
            if ver >= 2 and len(chunk) >= 21:
                point["hit"] = chunk[20] == 1
            points.append(point)

        return {"version": ver, "trace_id": trace_id, "meta": meta, "points": points}

    def load(self, trace_id: str) -> dict:
        logger.info(f"加载轨迹: {trace_id}")
        tid = self.resolve_disk_trace_id(trace_id)
        logger.info(f"加载二进制轨迹文件: {tid}")
        return self._load_trace_binary(tid)

