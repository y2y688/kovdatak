from __future__ import annotations

import socket
import threading
import time
import webbrowser
from contextlib import closing
from typing import Optional

import uvicorn

from pykovdatak.app.main import app


def _is_port_free(host: str, port: int) -> bool:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
        except OSError:
            return False
        return True


def _pick_port(host: str, preferred: int, max_tries: int = 50) -> int:
    if _is_port_free(host, preferred):
        return preferred
    for i in range(1, max_tries + 1):
        p = preferred + i
        if _is_port_free(host, p):
            return p
    raise RuntimeError(f"No free port found near {preferred}")


def _open_browser_later(url: str, delay_s: float = 2.5) -> None:
    def _runner():
        time.sleep(delay_s)
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=_runner, daemon=True).start()


def _wait_for_server(host: str, port: int, timeout: float = 10.0) -> bool:
    """等待服务器启动，直到端口可连接"""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
                sock.settimeout(1.0)
                result = sock.connect_ex((host, port))
                if result == 0:
                    return True
        except:
            pass
        time.sleep(0.1)
    return False


def _run_server(server: uvicorn.Server):
    """在后台运行服务器"""
    server.run()

def main(host: str = "127.0.0.1", port: int = 8787, open_browser: bool = True) -> None:
    """
    Portable entrypoint for PyInstaller builds:
    - picks a free port (default 8787, else 8788..)
    - starts uvicorn with the in-process FastAPI app object (no import-string needed)
    - optionally opens the browser to the UI
    """
    chosen = _pick_port(host, port)
    url = f"http://{host}:{chosen}"

    print(f"Kovdatak UI: {url}")
    if chosen != port:
        print(f"Note: preferred port {port} was busy; using {chosen} instead.")

    config = uvicorn.Config(app, host=host, port=chosen, log_level="info", log_config=None)
    server = uvicorn.Server(config)

    # 在后台启动服务器
    server_thread = threading.Thread(target=_run_server, args=(server,), daemon=True)
    server_thread.start()

    # 等待服务器启动
    print("正在启动服务器...")
    if _wait_for_server(host, chosen, timeout=15.0):
        print(f"服务器已启动，端口: {chosen}")
        if open_browser:
            try:
                webbrowser.open(url)
            except Exception as e:
                print(f"无法打开浏览器: {e}")
        # 等待服务器线程结束（主线程保持运行）
        server_thread.join()
    else:
        print(f"错误: 服务器在15秒内未能启动")
        # 服务器可能启动失败，但线程仍在运行，程序会退出


if __name__ == "__main__":
    main()

