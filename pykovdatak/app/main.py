from __future__ import annotations

import asyncio
import os
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Set

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import assets_root, data_root, load_or_create_config, save_config
from .stats_watcher import StatsPipeline
from .benchmarks_service import BenchmarksService
from .favorites_store import FavoritesStore
from .trace_store import TraceStore


class WSHub:
    def __init__(self):
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast(self, msg: Dict[str, Any]):
        async with self._lock:
            clients = list(self._clients)
        dead: List[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)


cfg = load_or_create_config()
hub = WSHub()

app = FastAPI(title="Kovdatak")

react_dir = (assets_root() / "web-react-dist").resolve()
if react_dir.exists():
    # React build uses relative "./assets/*" URLs which resolve to "/assets/*" when served at "/".
    # Mount assets explicitly to avoid 404 -> blank screen.
    assets_dir = (react_dir / "assets").resolve()
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir), html=False), name="assets")

pipeline = StatsPipeline(
    stats_dir=cfg.stats_dir,
    traces_dir=cfg.traces_dir,
    kovaaks_process_name=cfg.kovaaks_process_name,
    mouse_buffer_seconds=cfg.mouse_buffer_seconds,
    mouse_tracking_enabled=getattr(cfg, "mouse_tracking_enabled", True),
    min_sample_interval=getattr(cfg, "mouse_sample_interval", 0.0),
)
benchmarks = BenchmarksService(
    steam_id=cfg.steam_id,
    steam_install_dir=getattr(cfg, "steam_install_dir", ""),
    steam_id_override=getattr(cfg, "steam_id_override", ""),
)
favorites = FavoritesStore(str(data_root() / "data" / "favorite_benchmarks.json"))


@app.on_event("startup")
async def _startup():
    loop = asyncio.get_running_loop()

    def on_record(rec):
        loop.call_soon_threadsafe(asyncio.create_task, hub.broadcast({"type": "scenario_added", "record": rec.to_jsonable()}))

    pipeline.add_listener(on_record)
    pipeline.start(scan_async=True)


@app.on_event("shutdown")
async def _shutdown():
    pipeline.stop()


@app.get("/")
async def index():
    # Serve React app only.
    if react_dir.exists() and (react_dir / "index.html").exists():
        return FileResponse(str(react_dir / "index.html"))
    raise HTTPException(status_code=404, detail="web-react-dist not found")


@app.get("/api/config")
async def get_config():
    return {
        "stats_dir": cfg.stats_dir,
        "traces_dir": cfg.traces_dir,
        "kovaaks_process_name": cfg.kovaaks_process_name,
        "mouse_buffer_seconds": cfg.mouse_buffer_seconds,
        "mouse_sample_interval": getattr(cfg, "mouse_sample_interval", 0.0),
        "mouse_tracking_enabled": getattr(cfg, "mouse_tracking_enabled", True),
        "steam_install_dir": getattr(cfg, "steam_install_dir", ""),
        "steam_id_override": getattr(cfg, "steam_id_override", ""),
        "steam_id": cfg.steam_id,
    }


@app.put("/api/config")
async def update_config(payload: Dict[str, Any]):
    # minimal config update for web/react frontend
    if "stats_dir" in payload and isinstance(payload["stats_dir"], str):
        cfg.stats_dir = payload["stats_dir"]
        pipeline.set_stats_dir(cfg.stats_dir)
        # Notify frontend that watcher was restarted (triggers full refresh)
        try:
            loop = asyncio.get_running_loop()
            loop.call_soon_threadsafe(asyncio.create_task, hub.broadcast({"type": "watcher_restarted", "path": cfg.stats_dir}))
        except Exception:
            pass
    if "traces_dir" in payload and isinstance(payload["traces_dir"], str):
        new_traces_dir = payload["traces_dir"]
        if new_traces_dir and not Path(new_traces_dir).is_absolute():
            new_traces_dir = str((data_root() / new_traces_dir).resolve())
        cfg.traces_dir = new_traces_dir
        # Hot-apply: both new recordings and reads use the updated trace directory immediately.
        pipeline.traces = TraceStore(cfg.traces_dir)
        # Notify frontend to refresh scenario data (trace IDs may have changed)
        try:
            loop = asyncio.get_running_loop()
            loop.call_soon_threadsafe(asyncio.create_task, hub.broadcast({"type": "traces_dir_updated"}))
        except Exception:
            pass
    if "kovaaks_process_name" in payload and isinstance(payload["kovaaks_process_name"], str):
        cfg.kovaaks_process_name = payload["kovaaks_process_name"]
    if "mouse_buffer_seconds" in payload:
        try:
            cfg.mouse_buffer_seconds = int(payload["mouse_buffer_seconds"])
        except Exception:
            pass
    if "mouse_sample_interval" in payload:
        try:
            cfg.mouse_sample_interval = float(payload["mouse_sample_interval"])
        except Exception:
            pass
    if "mouse_tracking_enabled" in payload:
        cfg.mouse_tracking_enabled = bool(payload["mouse_tracking_enabled"])
        pipeline.set_mouse_tracking_enabled(cfg.mouse_tracking_enabled)
    if "steam_id" in payload and isinstance(payload["steam_id"], str):
        cfg.steam_id = payload["steam_id"]
        benchmarks.steam_id = cfg.steam_id
    if "steam_install_dir" in payload and isinstance(payload["steam_install_dir"], str):
        cfg.steam_install_dir = payload["steam_install_dir"]
        benchmarks.steam_install_dir = cfg.steam_install_dir
    if "steam_id_override" in payload and isinstance(payload["steam_id_override"], str):
        cfg.steam_id_override = payload["steam_id_override"]
        benchmarks.steam_id_override = cfg.steam_id_override
    save_config(cfg)
    return {"ok": True}


@app.get("/api/benchmarks")
async def api_benchmarks():
    return {"benchmarks": benchmarks.get_benchmarks()}


@app.get("/api/benchmarks/favorites")
async def api_benchmark_favorites():
    return {"favorites": favorites.load()}


@app.put("/api/benchmarks/favorites")
async def api_benchmark_favorites_put(payload: Dict[str, Any]):
    ids = payload.get("favorites") if isinstance(payload, dict) else None
    if not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="favorites must be a list")
    favorites.save([str(x) for x in ids])
    return {"ok": True}


@app.get("/api/benchmarks/progress/{benchmark_id}")
async def api_benchmark_progress(benchmark_id: int):
    try:
        prog = benchmarks.build_progress(int(benchmark_id))
        return {"id": int(benchmark_id), "progress": prog}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/benchmarks/progresses")
async def api_benchmark_progresses():
    # Fetch for all benchmark difficulty IDs present in the embedded list.
    out: Dict[int, Any] = {}
    for b in benchmarks.get_benchmarks():
        for d in b.get("difficulties") or []:
            bid = int(d.get("kovaaksBenchmarkId") or 0)
            if bid <= 0:
                continue
            try:
                out[bid] = benchmarks.build_progress(bid)
            except Exception:
                # keep partial results
                continue
    return out


@app.post("/api/benchmarks/progresses/refresh")
async def api_benchmark_progresses_refresh():
    data = await api_benchmark_progresses()
    # Broadcast updates so React UI can live-update when "推荐" is open
    try:
        await hub.broadcast({"type": "benchmark_progresses_refreshed", "data": data})
    except Exception:
        pass
    return data


@app.get("/api/records")
async def get_records(limit: int = 200):
    # 直接扫描stats目录获取所有CSV文件
    records = []
    stats_dir = Path(cfg.stats_dir)
    if stats_dir.exists():
        for csv_file in sorted(stats_dir.glob("* Stats.csv")):
            try:
                rec = pipeline.parse_one(str(csv_file))
                records.append(rec)
            except Exception:
                continue
    # 按时间从新到旧排序，返回最近的limit条
    records.sort(key=lambda r: r.date_played, reverse=True)
    return {"records": [r.to_jsonable() for r in records[:limit]]}


@app.get("/api/traces/{trace_id}")
async def get_trace(trace_id: str):
    try:
        return pipeline.traces.load(trace_id)
    except Exception:
        raise HTTPException(status_code=404, detail="trace not found")


@app.post("/api/launch/scenario")
async def api_launch_scenario(payload: Dict[str, Any]):
    name = str((payload or {}).get("name") or "").strip()
    mode = str((payload or {}).get("mode") or "challenge").strip() or "challenge"
    if not name:
        raise HTTPException(status_code=400, detail="missing scenario name")
    n = urllib.parse.quote(name, safe="")
    m = urllib.parse.quote(mode, safe="")
    deeplink = f"steam://run/824270/?action=jump-to-scenario;name={n};mode={m}"
    try:
        os.startfile(deeplink)  # type: ignore[attr-defined]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}


@app.post("/api/launch/playlist")
async def api_launch_playlist(payload: Dict[str, Any]):
    sharecode = str((payload or {}).get("sharecode") or "").strip()
    if not sharecode:
        raise HTTPException(status_code=400, detail="missing sharecode")
    sc = urllib.parse.quote(sharecode, safe="")
    deeplink = f"steam://run/824270/?action=jump-to-playlist;sharecode={sc}"
    try:
        os.startfile(deeplink)  # type: ignore[attr-defined]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await hub.connect(ws)
    try:
        while True:
            # keepalive / ignore incoming
            await ws.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(ws)
    except Exception:
        await hub.disconnect(ws)


def main():
    # Allow `python -m pykovdatak.app.main` to work from repo root
    # (the module path is `pykovdatak.app.main`, not `app.main`).
    uvicorn.run("pykovdatak.app.main:app", host="127.0.0.1", port=8787, reload=False)


if __name__ == "__main__":
    main()

