@echo off
setlocal
chcp 65001 > nul
cd /d "%~dp0"

echo.
echo 地図アプリを起動します...

rem --- Node.js の確認 ---
where node >nul 2>nul
if errorlevel 1 (
    echo [エラー] Node.js がインストールされていません。
    echo https://nodejs.org から Node.js (LTS) をインストールしてから再実行してください。
    pause
    exit /b 1
)

rem --- 依存パッケージのインストール（初回のみ） ---
if not exist "node_modules" (
    echo 依存パッケージをインストールしています...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :error
)

rem --- ビルド（初回のみ） ---
if not exist "dist\index.html" (
    echo 初回起動のためビルドを実行します...
    call npm run build
    if errorlevel 1 goto :error
)

echo.
echo ブラウザが開いたら Web アプリが表示されます。終了するときはこのウィンドウを閉じてください。
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
goto :eof

:error
echo.
echo [エラー] 起動に失敗しました。上のメッセージを確認してください。
pause
exit /b 1