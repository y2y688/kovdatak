from __future__ import annotations

import logging
import threading
from collections import deque
from dataclasses import dataclass, asdict
from typing import Deque, List

logger = logging.getLogger(__name__)


@dataclass
class MousePoint:
    t: float  # unix seconds
    x: int
    y: int
    buttons: int = 0
    hit: bool = False  # 是否击中目标（基于Stats CSV中的击杀事件时间戳关联）

    def to_jsonable(self):
        return asdict(self)


class MouseRingBuffer:
    def __init__(self, max_seconds: int):
        self.max_seconds = max_seconds
        self._buf: Deque[MousePoint] = deque()
        self._lock = threading.RLock()

    def add(self, pt: MousePoint) -> None:
        with self._lock:
            self._buf.append(pt)
            cutoff = pt.t - float(self.max_seconds)
            while self._buf and self._buf[0].t < cutoff:
                self._buf.popleft()

    def get_range(self, start_t: float, end_t: float) -> List[MousePoint]:
        with self._lock:
            return [p for p in self._buf if start_t <= p.t <= end_t]


class MouseTracker:
    """
    Mouse tracker.
    Enabled/disabled by the process watcher to only run during the game.
    """

    def __init__(self, buffer_seconds: int = 600, min_sample_interval: float = 0.0):
        logger.info(f"初始化鼠标跟踪器: buffer_seconds={buffer_seconds}, min_sample_interval={min_sample_interval}")
        self._enabled = False
        self._lock = threading.RLock()
        self._buttons = 0
        self._impl = None
        self._buffer_seconds = buffer_seconds
        self._min_sample_interval = min_sample_interval

    def _set_button(self, bit: int, pressed: bool) -> None:
        with self._lock:
            if pressed:
                self._buttons |= bit
            else:
                self._buttons &= ~bit

    def _get_buttons(self) -> int:
        with self._lock:
            return int(self._buttons)

    def enabled(self) -> bool:
        with self._lock:
            return self._enabled

    def start(self) -> None:
        logger.info("启动鼠标跟踪器")
        with self._lock:
            if self._enabled:
                logger.info("鼠标跟踪器已启用，跳过启动")
                return
            self._enabled = True

        logger.info("尝试Windows Raw Input实现")
        try:
            import sys
            if sys.platform.startswith("win"):
                from .raw_input_tracker_windows import RawInputMouseTracker

                impl = RawInputMouseTracker(
                    buffer_seconds=self._buffer_seconds,
                    min_sample_interval=self._min_sample_interval,
                )
                impl.start()
                with self._lock:
                    self._impl = impl
                logger.info("Windows Raw Input跟踪器启动成功")
        except Exception as e:
            logger.error(f"Windows Raw Input启动失败: {e}", exc_info=True)
            with self._lock:
                self._enabled = False

    def stop(self) -> None:
        logger.info("停止鼠标跟踪器")
        with self._lock:
            if not self._enabled:
                logger.info("鼠标跟踪器未启用，跳过停止")
                return
            impl = self._impl
            self._enabled = False
            self._buttons = 0
            self._impl = None

        try:
            if impl is not None:
                impl.stop()
        except Exception as e:
            logger.warning(f"停止跟踪器实现时出错: {e}")
        logger.info("鼠标跟踪器已停止")

    def get_range(self, start_t: float, end_t: float) -> List[MousePoint]:
        logger.debug(f"获取鼠标轨迹范围: {start_t} 到 {end_t} (时长: {end_t - start_t:.1f}秒)")
        with self._lock:
            impl = self._impl
        if impl is not None:
            points = impl.get_range(start_t, end_t)
            logger.debug(f"从实现获取 {len(points)} 个点")
            return points
        return []

