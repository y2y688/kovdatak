from __future__ import annotations

import json
import logging
import os
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class AppConfig:
    stats_dir: str = ""
    traces_dir: str = "data/traces"
    kovaaks_process_name: str = "FPSAimTrainer.exe"
    mouse_buffer_seconds: int = 10 * 60
    mouse_sample_interval: float = 0.0
    mouse_tracking_enabled: bool = True
    steam_install_dir: str = ""
    steam_id_override: str = ""
    steam_id: str = ""  # optional explicit SteamID64 (highest priority)
    theme: str = "dark"
    font: str = "montserrat"

    def validate(self) -> dict:
        """
        验证配置参数，返回错误和警告信息。

        Returns:
            dict: 包含 "errors" 和 "warnings" 列表的字典
        """
        errors = []
        warnings = []

        # 验证轨迹目录
        traces_path = Path(self.traces_dir)
        if not traces_path.exists():
            try:
                traces_path.mkdir(parents=True, exist_ok=True)
                logger.info(f"创建轨迹目录: {traces_path}")
            except Exception as e:
                errors.append(f"无法创建轨迹目录 {self.traces_dir}: {e}")

        # 验证统计目录
        stats_path = Path(self.stats_dir)
        if self.stats_dir and not stats_path.exists():
            errors.append(f"统计目录不存在: {self.stats_dir}")
        elif self.stats_dir:
            logger.info(f"统计目录存在: {stats_path}")

        # 验证鼠标缓冲区大小
        if self.mouse_buffer_seconds is not None and self.mouse_buffer_seconds <= 0:
            errors.append(f"mouse_buffer_seconds必须大于0，当前值：{self.mouse_buffer_seconds}")

        # 验证鼠标采样间隔
        if self.mouse_sample_interval is not None and self.mouse_sample_interval < 0:
            errors.append(f"mouse_sample_interval不能为负数，当前值：{self.mouse_sample_interval}")

        # 验证轨迹目录写入权限
        if traces_path.exists():
            test_file = traces_path / ".write_test"
            try:
                test_file.write_text("test")
                test_file.unlink()
                logger.info(f"轨迹目录可写: {traces_path}")
            except Exception as e:
                errors.append(f"轨迹目录无写入权限 {traces_path}: {e}")

        return {"errors": errors, "warnings": warnings}


def project_root() -> Path:
    # .../pykovdatak/app/config.py -> .../pykovdatak
    return Path(__file__).resolve().parents[1]

def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def assets_root() -> Path:
    """
    Root directory for packaged read-only assets.
    - dev: pykovdatak/ (same as project_root)
    - pyinstaller: sys._MEIPASS (temp extraction dir)
    """
    if is_frozen() and hasattr(sys, "_MEIPASS"):
        return Path(getattr(sys, "_MEIPASS")).resolve()
    return project_root()


def data_root() -> Path:
    """
    Root directory for persistent writable data.
    - dev: pykovdatak/ (same as project_root)
    - packaged: directory containing the exe (portable)
    """
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return project_root()


def config_path() -> Path:
    return data_root() / "data" / "config.json"


def _is_valid_writable_path(path_str: str) -> bool:
    """检查路径是否有效且可写入（最多向上查找 2 层父目录）。"""
    if not path_str:
        return True  # 空路径使用默认值，视为有效
    try:
        p = Path(path_str)
        if p.exists():
            return True
        # 检查父目录（最多 2 层），防止找到不相关的上级目录
        parent = p.parent
        for _ in range(2):
            if parent == parent.parent:  # 已到根目录
                break
            if parent.exists():
                return parent.is_dir() and os.access(parent, os.W_OK)
            parent = parent.parent
        return False
    except Exception:
        return False


def load_or_create_config() -> AppConfig:
    p = config_path()
    if not p.exists():
        cfg = AppConfig()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(asdict(cfg), ensure_ascii=False, indent=2), encoding="utf-8")
        validation = cfg.validate()
        if validation["errors"]:
            logger.warning(f"新配置验证发现问题: {validation['errors']}")
        return cfg

    data = json.loads(p.read_text(encoding="utf-8"))
    cfg = AppConfig()
    for k in asdict(cfg).keys():
        if k in data:
            setattr(cfg, k, data[k])

    # 检查绝对路径是否有效，无效则重置为默认相对路径
    if cfg.traces_dir and Path(cfg.traces_dir).is_absolute():
        if not _is_valid_writable_path(cfg.traces_dir):
            logger.warning(f"轨迹目录无效或不可访问: {cfg.traces_dir}，重置为默认值")
            cfg.traces_dir = "data/traces"

    # 将相对路径转换为绝对路径（相对于exe所在目录）
    if cfg.traces_dir and not Path(cfg.traces_dir).is_absolute():
        cfg.traces_dir = str((data_root() / cfg.traces_dir).resolve())

    validation = cfg.validate()
    if validation["errors"]:
        logger.warning(f"配置验证发现问题: {validation['errors']}")
    if validation["warnings"]:
        logger.info(f"配置验证警告: {validation['warnings']}")

    return cfg


def save_config(cfg: AppConfig) -> None:
    d = asdict(cfg)
    # 将绝对路径转回相对路径，确保 exe 可移植到其他电脑
    if d.get("traces_dir"):
        try:
            rel = Path(d["traces_dir"]).relative_to(data_root())
            d["traces_dir"] = str(rel.as_posix())
        except ValueError:
            pass  # 不在 data_root 下，保持原样（如用户自定义路径）
    p = config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")

