from __future__ import annotations

import ctypes
import threading
import time
from ctypes import wintypes
from dataclasses import dataclass
from typing import Optional

from .mouse_tracker import MousePoint, MouseRingBuffer


@dataclass
class rawEvent:
    dx: int
    dy: int
    flags: int
    ts: float


# Windows constants
WM_INPUT = 0x00FF
RID_INPUT = 0x10000003
RIM_TYPEMOUSE = 0

RIDEV_INPUTSINK = 0x00000100
RIDEV_REMOVE = 0x00000001

# RAWMOUSE usFlags
MOUSE_MOVE_RELATIVE = 0x0000
MOUSE_MOVE_ABSOLUTE = 0x0001

# RI_MOUSE_BUTTON flags (low word of ulButtons)
RI_MOUSE_LEFT_BUTTON_DOWN = 0x0001
RI_MOUSE_LEFT_BUTTON_UP = 0x0002
RI_MOUSE_RIGHT_BUTTON_DOWN = 0x0004
RI_MOUSE_RIGHT_BUTTON_UP = 0x0008
RI_MOUSE_MIDDLE_BUTTON_DOWN = 0x0010
RI_MOUSE_MIDDLE_BUTTON_UP = 0x0020
RI_MOUSE_BUTTON_4_DOWN = 0x0040
RI_MOUSE_BUTTON_4_UP = 0x0080
RI_MOUSE_BUTTON_5_DOWN = 0x0100
RI_MOUSE_BUTTON_5_UP = 0x0200


def _now() -> float:
    return time.time()


class RAWINPUTDEVICE(ctypes.Structure):
    _fields_ = [
        ("usUsagePage", wintypes.USHORT),
        ("usUsage", wintypes.USHORT),
        ("dwFlags", wintypes.DWORD),
        ("hwndTarget", wintypes.HWND),
    ]


class RAWINPUTHEADER(ctypes.Structure):
    _fields_ = [
        ("dwType", wintypes.DWORD),
        ("dwSize", wintypes.DWORD),
        ("hDevice", wintypes.HANDLE),
        ("wParam", wintypes.WPARAM),
    ]


class RAWMOUSE(ctypes.Structure):
    _fields_ = [
        ("usFlags", wintypes.USHORT),
        ("_pad", wintypes.USHORT),  # alignment
        ("ulButtons", wintypes.DWORD),
        ("ulRawButtons", wintypes.DWORD),
        ("lLastX", wintypes.LONG),
        ("lLastY", wintypes.LONG),
        ("ulExtraInformation", wintypes.DWORD),
    ]


class RAWINPUT(ctypes.Structure):
    _fields_ = [
        ("header", RAWINPUTHEADER),
        ("mouse", RAWMOUSE),
    ]


HCURSOR = ctypes.c_void_p
HICON = ctypes.c_void_p
HBRUSH = ctypes.c_void_p
HMENU = ctypes.c_void_p
HRGN = ctypes.c_void_p
HACCEL = ctypes.c_void_p
HMODULE = ctypes.c_void_p
HRAWINPUT = ctypes.c_void_p
HRSRC = ctypes.c_void_p
HGLOBAL = ctypes.c_void_p
HLOCAL = ctypes.c_void_p
GLOBALHOST = ctypes.c_void_p

WNDPROCTYPE = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, ctypes.c_void_p, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)


class WNDCLASSEXW(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.UINT),
        ("style", wintypes.UINT),
        ("lpfnWndProc", WNDPROCTYPE),
        ("cbClsExtra", ctypes.c_int),
        ("cbWndExtra", ctypes.c_int),
        ("hInstance", HMODULE),
        ("hIcon", HICON),
        ("hCursor", HCURSOR),
        ("hbrBackground", HBRUSH),
        ("lpszMenuName", wintypes.LPCWSTR),
        ("lpszClassName", wintypes.LPCWSTR),
        ("hIconSm", HICON),
    ]


class MSG(ctypes.Structure):
    _fields_ = [
        ("hwnd", wintypes.HWND),
        ("message", wintypes.UINT),
        ("wParam", wintypes.WPARAM),
        ("lParam", wintypes.LPARAM),
        ("time", wintypes.DWORD),
        ("pt", wintypes.POINT),
    ]


user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

RegisterClassExW = user32.RegisterClassExW
RegisterClassExW.argtypes = [ctypes.POINTER(WNDCLASSEXW)]
RegisterClassExW.restype = wintypes.ATOM

UnregisterClassW = user32.UnregisterClassW
UnregisterClassW.argtypes = [wintypes.LPCWSTR, HMODULE]
UnregisterClassW.restype = wintypes.BOOL

CreateWindowExW = user32.CreateWindowExW
CreateWindowExW.argtypes = [
    wintypes.DWORD,
    wintypes.LPCWSTR,
    wintypes.LPCWSTR,
    wintypes.DWORD,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    wintypes.HWND,
    HMENU,
    HMODULE,
    wintypes.LPVOID,
]
CreateWindowExW.restype = wintypes.HWND

DestroyWindow = user32.DestroyWindow
DestroyWindow.argtypes = [wintypes.HWND]
DestroyWindow.restype = wintypes.BOOL

DefWindowProcW = user32.DefWindowProcW
DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
DefWindowProcW.restype = ctypes.c_ssize_t

GetMessageW = user32.GetMessageW
GetMessageW.argtypes = [ctypes.POINTER(MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
GetMessageW.restype = wintypes.BOOL

TranslateMessage = user32.TranslateMessage
TranslateMessage.argtypes = [ctypes.POINTER(MSG)]
TranslateMessage.restype = wintypes.BOOL

DispatchMessageW = user32.DispatchMessageW
DispatchMessageW.argtypes = [ctypes.POINTER(MSG)]
DispatchMessageW.restype = ctypes.c_ssize_t

PostThreadMessageW = user32.PostThreadMessageW
PostThreadMessageW.argtypes = [wintypes.DWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
PostThreadMessageW.restype = wintypes.BOOL

GetCurrentThreadId = kernel32.GetCurrentThreadId
GetCurrentThreadId.argtypes = []
GetCurrentThreadId.restype = wintypes.DWORD

GetModuleHandleW = kernel32.GetModuleHandleW
GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
GetModuleHandleW.restype = wintypes.HMODULE

RegisterRawInputDevices = user32.RegisterRawInputDevices
RegisterRawInputDevices.argtypes = [ctypes.POINTER(RAWINPUTDEVICE), wintypes.UINT, wintypes.UINT]
RegisterRawInputDevices.restype = wintypes.BOOL

GetRawInputData = user32.GetRawInputData
GetRawInputData.argtypes = [HRAWINPUT, wintypes.UINT, wintypes.LPVOID, ctypes.POINTER(wintypes.UINT), wintypes.UINT]
GetRawInputData.restype = wintypes.UINT

GetSystemMetrics = user32.GetSystemMetrics
GetSystemMetrics.argtypes = [ctypes.c_int]
GetSystemMetrics.restype = ctypes.c_int


class RawInputMouseTracker:
    """
    Windows Raw Input tracker using a ring buffer and worker thread,
    matching the upstream Go implementation.
    """

    def __init__(self, buffer_seconds: int, min_sample_interval: float = 0.0):
        self._buffer = MouseRingBuffer(buffer_seconds)
        self._enabled = False
        self._lock = threading.RLock()
        self._thread: Optional[threading.Thread] = None
        self._tid: int = 0
        self._hwnd: int = 0
        self._class_name = "PyRefleksRawInputWindow"

        self._vx = 0
        self._vy = 0
        self._buttons = 0
        self._min_sample_interval = min_sample_interval
        self._last_append_time = 0.0
        self._max_rel_delta = 500_000
        self._last_sample: tuple[int, int, int] | None = None

        rb_size = 1 << 14
        self._rb = [rawEvent(0, 0, 0, 0.0)] * rb_size
        self._rb_mask = rb_size - 1
        self._rb_write = 0
        self._rb_read = 0
        self._wake_ch = threading.Event()
        self._raw_buf: bytearray | None = None

    def enabled(self) -> bool:
        with self._lock:
            return self._enabled

    def start(self) -> None:
        with self._lock:
            if self._enabled:
                return
            self._enabled = True

        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        with self._lock:
            if not self._enabled:
                return
            self._enabled = False
            tid = self._tid

        if tid:
            # WM_QUIT
            PostThreadMessageW(tid, 0x0012, 0, 0)
        if self._thread:
            self._thread.join(timeout=1.0)
        with self._lock:
            self._tid = 0
            self._hwnd = 0

    def get_range(self, start_t: float, end_t: float):
        return self._buffer.get_range(start_t, end_t)

    def _append_point(self, ts: float) -> None:
        x = int(self._vx)
        y = int(self._vy)
        b = int(self._buttons)
        sample = (x, y, b)
        if self._last_sample == sample:
            return
        self._last_sample = sample
        self._buffer.add(MousePoint(t=ts, x=x, y=y, buttons=b))

    def _handle_raw_input(self, lparam: int) -> None:
        size = wintypes.UINT(0)
        GetRawInputData(lparam, RID_INPUT, None, ctypes.byref(size), ctypes.sizeof(RAWINPUTHEADER))
        if not size.value or size.value > 4096:
            return

        if not self._raw_buf or len(self._raw_buf) < size.value:
            self._raw_buf = bytearray(size.value)
        buf = (ctypes.c_byte * size.value).from_buffer(self._raw_buf)
        read = GetRawInputData(lparam, RID_INPUT, ctypes.byref(buf), ctypes.byref(size), ctypes.sizeof(RAWINPUTHEADER))
        if read == 0:
            return

        ri = ctypes.cast(ctypes.byref(buf), ctypes.POINTER(RAWINPUT)).contents
        if ri.header.dwType != RIM_TYPEMOUSE:
            return

        m = ri.mouse
        button_flags = int(m.ulButtons & 0xFFFF)

        dx = int(m.lLastX)
        dy = int(m.lLastY)

        write_idx = self._rb_write
        read_idx = self._rb_read
        if len(self._rb) - (write_idx - read_idx) == 0:
            return

        self._rb[write_idx & self._rb_mask] = rawEvent(dx=dx, dy=dy, flags=button_flags, ts=time.time())
        self._rb_write = write_idx + 1
        self._wake_ch.set()

    def _event_loop(self) -> None:
        while True:
            self._wake_ch.wait()
            if not self._enabled:
                break
            self._wake_ch.clear()

            while True:
                read_idx = self._rb_read
                write_idx = self._rb_write
                if read_idx == write_idx:
                    break

                ev = self._rb[read_idx & self._rb_mask]

                with self._lock:
                    changed = False
                    if ev.dx != 0 or ev.dy != 0:
                        self._vx += ev.dx
                        self._vy += ev.dy
                        changed = True
                    if ev.flags & RI_MOUSE_LEFT_BUTTON_DOWN:
                        if not (self._buttons & 1):
                            self._buttons |= 1
                            changed = True
                    if ev.flags & RI_MOUSE_LEFT_BUTTON_UP:
                        if self._buttons & 1:
                            self._buttons &= ~1
                            changed = True

                    if changed:
                        now = time.time()
                        interval = self._min_sample_interval if self._min_sample_interval is not None else 0.0
                        if now - self._last_append_time >= interval:
                            self._append_point(now)
                            self._last_append_time = now

                self._rb_read = read_idx + 1

    def _run(self) -> None:
        # Set up hidden window for receiving WM_INPUT
        hinst = GetModuleHandleW(None)

        @WNDPROCTYPE
        def wndproc(hwnd, msg, wparam, lparam):
            if msg == WM_INPUT:
                with self._lock:
                    if self._enabled:
                        self._handle_raw_input(int(lparam))
                return 0
            return DefWindowProcW(hwnd, msg, wparam, lparam)

        wc = WNDCLASSEXW()
        wc.cbSize = ctypes.sizeof(WNDCLASSEXW)
        wc.style = 0
        wc.lpfnWndProc = wndproc
        wc.cbClsExtra = 0
        wc.cbWndExtra = 0
        wc.hInstance = hinst
        wc.hIcon = None
        wc.hCursor = None
        wc.hbrBackground = None
        wc.lpszMenuName = None
        wc.lpszClassName = self._class_name
        wc.hIconSm = None

        atom = RegisterClassExW(ctypes.byref(wc))
        if not atom:
            with self._lock:
                self._enabled = False
            return

        hwnd = CreateWindowExW(
            0,
            self._class_name,
            "kovdatak_raw_input",
            0,
            0,
            0,
            0,
            0,
            None,
            None,
            hinst,
            None,
        )
        if not hwnd:
            UnregisterClassW(self._class_name, hinst)
            with self._lock:
                self._enabled = False
            return

        rid = RAWINPUTDEVICE()
        rid.usUsagePage = 0x01
        rid.usUsage = 0x02
        rid.dwFlags = RIDEV_INPUTSINK
        rid.hwndTarget = hwnd
        if not RegisterRawInputDevices(ctypes.byref(rid), 1, ctypes.sizeof(RAWINPUTDEVICE)):
            DestroyWindow(hwnd)
            UnregisterClassW(self._class_name, hinst)
            with self._lock:
                self._enabled = False
            return

        tid = int(GetCurrentThreadId())
        with self._lock:
            self._tid = tid
            self._hwnd = int(hwnd)

        worker_thread = threading.Thread(target=self._event_loop, daemon=True)
        worker_thread.start()

        msg = MSG()
        while True:
            r = GetMessageW(ctypes.byref(msg), None, 0, 0)
            if r == 0 or r == -1:
                break
            TranslateMessage(ctypes.byref(msg))
            DispatchMessageW(ctypes.byref(msg))

        with self._lock:
            self._enabled = False

        self._wake_ch.set()
        worker_thread.join(timeout=0.5)

        # Unregister raw input
        rid_remove = RAWINPUTDEVICE()
        rid_remove.usUsagePage = 0x01
        rid_remove.usUsage = 0x02
        rid_remove.dwFlags = RIDEV_REMOVE
        rid_remove.hwndTarget = None
        RegisterRawInputDevices(ctypes.byref(rid_remove), 1, ctypes.sizeof(RAWINPUTDEVICE))

        DestroyWindow(hwnd)
        UnregisterClassW(self._class_name, hinst)

