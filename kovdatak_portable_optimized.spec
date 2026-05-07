# -*- mode: python ; coding: utf-8 -*-

import os
import sys
from pathlib import Path

block_cipher = None

ROOT = Path(globals().get("SPECPATH", os.getcwd())).resolve()
PYREFLEKS = ROOT / "pykovdatak"
WEB_DIST = PYREFLEKS / "web-react-dist"

datas = []
if WEB_DIST.exists():
    # Put web assets at top-level inside _MEIPASS so assets_root() can find them.
    datas.append((str(WEB_DIST), "web-react-dist"))

# 打包默认基准测试数据
default_benchmark_data = PYREFLEKS / "app" / "data" / "default_benchmarks.json"
if default_benchmark_data.exists():
    datas.append((str(default_benchmark_data), "app/data"))

# 打包默认基准测试数据
default_benchmark_data = PYREFLEKS / "app" / "data" / "default_benchmarks.json"
if default_benchmark_data.exists():
    datas.append((str(default_benchmark_data), "app/data"))

# 添加必要的隐藏导入
# pynput 在 Windows 上动态导入 _win32 模块
hiddenimports = [
    'pynput.keyboard._win32',
    'pynput.mouse._win32',
    'pynput._util.win32',
    'watchdog.observers.inotify_buffer',
    'watchdog.observers.inotify_c',
    'watchdog.observers.read_directory_changes',
    'watchdog.observers.kqueue',
    'watchdog.observers.fsevents',
    'watchdog.observers.polling',
    'watchdog.utils.dirsnapshot',
    'psutil._pswindows',  # Windows 特定模块
    'psutil._psutil_windows',
]

# 添加 Python DLL
import sys
python_home = sys.prefix
binaries = [
    (os.path.join(python_home, 'python313.dll'), '.'),
    (os.path.join(python_home, 'DLLs'), 'DLLs'),
]

# 排除不需要的模块以减少体积
excludes = [
    'tkinter',
    'tcl',
    'tk',
    '_tkinter',
    'PyQt5',
    'PyQt6',
    'wx',
    'matplotlib',
    'numpy',
    'pandas',
    'scipy',
    'IPython',
    'jupyter',
    'notebook',
    'test',
    'tests',
    'setuptools',
    'pip',
    'pkg_resources',
]

a = Analysis(
    ["pykovdatak/app/portable_entry.py"],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Kovdatak",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,  # 使用 UPX 压缩（需安装 UPX）
    console=False,  # 隐藏控制台窗口，更像原生应用
    disable_windowed_traceback=False,
    icon=None,  # 可在此指定图标路径，例如: icon='kovdatak.ico'
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="Kovdatak",
)