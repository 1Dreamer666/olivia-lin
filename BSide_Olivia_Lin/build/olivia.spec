# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for BSide · 林离的信箱
打包为 onedir（dist/OliviaLetterBox/），再压缩成 zip 作为 Release 资产。

onedir 比 onefile 启动更快、对杀毒软件更友好；体积略大但只多 1 个目录。
"""
import os
from pathlib import Path

PROJECT = Path(SPECPATH).resolve().parent  # build/ 的上级 = 项目根
APP = PROJECT / "app" / "server.py"

a = Analysis(
    [str(APP)],
    pathex=[str(PROJECT)],
    binaries=[],
    datas=[
        # 静态资源
        (str(PROJECT / "app" / "static"), "app/static"),
        # 语料（persona / samples）
        (str(PROJECT / "persona"), "persona"),
        (str(PROJECT / "samples"), "samples"),
        # 默认配置（frozen 时优先用 exe 同级的 config.json；这里打包一份兜底）
        (str(PROJECT / "config.json"), "."),
    ],
    hiddenimports=[
        "google.generativeai",
        "google.generativeai.types",
        "google.ai.generativelanguage_v1beta",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # 不需要的巨包：减少体积
        "matplotlib", "numpy", "pandas", "scipy", "PIL",
        "PyQt5", "PyQt6", "PySide2", "PySide6", "tkinter",
        "notebook", "IPython", "pytest", "sphinx",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="OliviaLetterBox",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,            # UPX 压缩（环境里没有就跳过）
    console=True,        # 保留控制台：便于看启动日志 / 错误
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="OliviaLetterBox",
)
