from __future__ import annotations

import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, asdict
from typing import Deque, List, Tuple

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
        self._buffer = MouseRingBuffer(buffer_seconds)
        self._enabled = False
        self._lock = threading.RLock()
        self._listener = None
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

        # Prefer Windows Raw Input (matches upstream Go behavior: relative deltas, unclipped virtual coords)
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
                return
        except Exception as e:
            logger.warning(f"Windows Raw Input失败，回退到pynput: {e}", exc_info=True)
            # Fall back to pynput
            pass

        logger.info("尝试pynput实现")
        try:
            from pynput import mouse  # type: ignore
        except Exception as e:
            logger.error(f"pynput导入失败: {e}", exc_info=True)
            with self._lock:
                self._enabled = False
            return

        def on_move(x, y):
            self._buffer.add(MousePoint(t=time.time(), x=int(x), y=int(y), buttons=self._get_buttons()))

        def on_click(x, y, button, pressed):
            # Match upstream bitmask:
            # 1=Left, 2=Right, 4=Middle, 8=Button4, 16=Button5
            bit = 0
            try:
                if button == mouse.Button.left:
                    bit = 1
                elif button == mouse.Button.right:
                    bit = 2
                elif button == mouse.Button.middle:
                    bit = 4
                elif button == mouse.Button.x1:
                    bit = 8
                elif button == mouse.Button.x2:
                    bit = 16
            except Exception:
                bit = 0
            if bit:
                self._set_button(bit, bool(pressed))
            # Also record a point at click time for clearer markers
            self._buffer.add(MousePoint(t=time.time(), x=int(x), y=int(y), buttons=self._get_buttons()))

        try:
            self._listener = mouse.Listener(on_move=on_move, on_click=on_click)
            self._listener.daemon = True
            self._listener.start()
            # Check if listener is actually running
            if not self._listener.is_alive():
                raise RuntimeError("pynput listener failed to start")
            logger.info("pynput监听器启动成功")
            with self._lock:
                self._impl = None
        except Exception as e:
            logger.error(f"pynput监听器启动失败: {e}", exc_info=True)
            with self._lock:
                self._enabled = False
                self._listener = None
            return

    def stop(self) -> None:
        logger.info("停止鼠标跟踪器")
        with self._lock:
            if not self._enabled:
                logger.info("鼠标跟踪器未启用，跳过停止")
                return
            impl = self._impl
            if self._listener is not None:
                try:
                    self._listener.stop()
                except Exception:
                    pass
            self._listener = None
            self._enabled = False
            self._buttons = 0
            self._impl = None

        try:
            if impl is not None:
                impl.stop()
        except Exception as e:
            logger.warning(f"停止跟踪器实现时出错: {e}")
            pass
        logger.info("鼠标跟踪器已停止")

    def get_range(self, start_t: float, end_t: float) -> List[MousePoint]:
        logger.debug(f"获取鼠标轨迹范围: {start_t} 到 {end_t} (时长: {end_t - start_t:.1f}秒)")
        with self._lock:
            impl = self._impl
        if impl is not None:
            points = impl.get_range(start_t, end_t)
            logger.debug(f"从实现获取 {len(points)} 个点")
            return points
        points = self._buffer.get_range(start_t, end_t)
        logger.debug(f"从缓冲区获取 {len(points)} 个点")
        return points

