@echo off
rem ネスペ ワーク演習（AI採点）サーバをダブルクリックで起動する
chcp 65001 >nul
cd /d "%~dp0"

rem Node.js があるか確認
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js が見つかりません。https://nodejs.org/ からインストールしてください。
  echo.
  pause
  exit /b 1
)

rem APIキー未設定の注意（server\.env も環境変数も無い場合）
if not exist "server\.env" if "%ANTHROPIC_API_KEY%"=="" (
  echo.
  echo [注意] APIキーが未設定です。採点を使うには server\.env に
  echo        ANTHROPIC_API_KEY を設定してください（server\.env.example を参照）。
  echo        問題を読むだけなら設定なしでも動きます。
  echo.
)

rem サーバを専用ウィンドウで起動（このウィンドウを閉じると停止）
rem start で開く新ウィンドウは、このバッチの作業ディレクトリ（上で cd 済み）を引き継ぐ
start "ネスペ ワーク演習サーバ（閉じると停止）" cmd /k "chcp 65001 >nul & node server\relay.js"

rem サーバの起動を待ってからブラウザを開く
timeout /t 2 >nul
start "" http://localhost:8787/apps/work.html

exit /b 0
