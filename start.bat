@echo off
title 打飞机联机版 - 服务器
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules\ws" (
    echo [1/2] 首次运行，正在安装依赖 ws ...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重试
        pause
        exit /b 1
    )
) else (
    echo [1/2] 依赖已就绪
)

echo.
echo [2/2] 正在启动服务器（异常退出会自动重启）...
echo   本机访问：  http://localhost:3000
echo   局域网访问：http://192.168.1.234:3000
echo   关闭本窗口即停止服务器（Ctrl+C 可中断）
echo.

:loop
node server.js
echo.
echo [提示] 服务器已退出，3 秒后自动重启 ...
timeout /t 3 /nobreak >nul
goto loop
