# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for BSide · 林离的信箱
打包为 onedir（dist/OliviaLetterBox/），再压缩成 zip 作为 Release 资产。
"""
from pathlib import Path

PROJECT = Path(SPECPATH).resolve().parent
APP = PROJECT / "app" / "server.py"

a = Analysis(
    [str(APP)],
    pathex=[str(PROJECT)],
    binaries=[],
    datas=[
        (str(PROJECT / "app" / "static"), "app/static"),
        (str(PROJECT / "skill"), "skill"),
        (str(PROJECT / "persona"), "persona"),
        (str(PROJECT / "samples"), "samples"),
        (str(PROJECT / "config.json"), "."),
    ],
    hiddenimports=[
        "skill",
        "skill.config",
        "skill.loader",
        "skill.local_engine",
        "skill.model_client",
        "skill.memory_bank",
        "google.generativeai",
        "google.generativeai.types",
        "google.ai.generativelanguage_v1beta",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
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
    upx=True,
    console=True,
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
