@echo off
REM ============================================================
REM  BSide · 林离的信箱  ——  Windows 本地一键打包脚本
REM
REM  作用：在 Windows 机器上生成 dist\OliviaLetterBox\OliviaLetterBox.exe
REM  双击运行即可（也可手动在 cmd / PowerShell 里跑）。
REM
REM  说明：PyInstaller 无法在 Linux 上交叉编译 Windows 可执行文件，
REM        因此 Release 资产通过 GitHub Actions 的 windows-latest
REM        跑这份同款 spec 生成；如果想在本地重建，跑这个脚本。
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0\.."

echo === 1/4 准备虚拟环境 .venv-exe ===
if not exist ".venv-exe\Scripts\python.exe" (
    python -m venv .venv-exe
    if errorlevel 1 (
        echo [ERROR] 创建虚拟环境失败，请确认本机已安装 Python 3.9+
        exit /b 1
    )
)
call ".venv-exe\Scripts\activate.bat"

echo === 2/4 升级 pip 并安装 PyInstaller + 依赖 ===
python -m pip install -U pip
python -m pip install -U pyinstaller
python -m pip install -U google-generativeai || echo (继续：google-generativeai 装不上时仍可打包，本地引擎能跑)

echo === 3/4 用 PyInstaller 打 spec ===
pyinstaller build\olivia.spec --noconfirm --clean
if errorlevel 1 (
    echo [ERROR] PyInstaller 打包失败
    exit /b 1
)

echo === 4/4 压缩发布包 ===
if exist "OliviaLetterBox-win-x64.zip" del /Q "OliviaLetterBox-win-x64.zip"
powershell -NoProfile -Command "Compress-Archive -Path 'dist\OliviaLetterBox' -DestinationPath 'OliviaLetterBox-win-x64.zip' -CompressionLevel Optimal"

echo.
echo ============================================================
echo  打包完成：
echo    可执行文件：dist\OliviaLetterBox\OliviaLetterBox.exe
echo    发布压缩包：OliviaLetterBox-win-x64.zip
echo ============================================================
echo.
pause
endlocal
