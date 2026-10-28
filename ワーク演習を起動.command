#!/bin/bash
# ネスペ ワーク演習（AI採点）起動 — Mac 用。Finder でダブルクリックすると
# ローカルサーバを起動し、ブラウザでワーク演習を開く（Windows の .bat と同じ役割）。
#
# 初回だけ実行権限が要る場合がある：
#   ターミナルで  chmod +x "ワーク演習を起動.command"  を一度だけ実行。
#   （git から取得した場合は実行権限付きで入るので不要なことが多い）

# このスクリプトのあるフォルダへ移動
cd "$(dirname "$0")" || exit 1

# Homebrew / 標準のインストール先を PATH に足す（Finder 起動時に node が見つからない対策）
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

URL="http://localhost:8787/apps/work.html"

# Node.js チェック
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js が見つかりません。https://nodejs.org/ からインストールしてください。"
  echo "（nvm を使っている場合は、ターミナルから  node server/relay.js  で起動してください）"
  echo
  read -n 1 -s -r -p "何かキーを押すと閉じます..."
  echo
  exit 1
fi

# すでに 8787 で起動中なら、ブラウザを開くだけ
if lsof -nP -iTCP:8787 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "サーバは起動済みです。ブラウザを開きます..."
  open "$URL"
  exit 0
fi

# APIキー未設定の注意
if [ ! -f "server/.env" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "[注意] ANTHROPIC_API_KEY が未設定です。"
  echo "       AI採点を使うには server/.env に設定してください（server/.env.example を参照）。"
  echo "       未設定でも問題の閲覧はできます。"
  echo
fi

# 2秒後にブラウザを開く（サーバはこのウィンドウで動く）
( sleep 2; open "$URL" ) &

echo "サーバを起動します。停止するには Ctrl+C かこのウィンドウを閉じてください。"
echo "URL: $URL"
echo
node server/relay.js

echo
echo "サーバを停止しました。上にエラーがあれば確認してください。"
read -n 1 -s -r -p "何かキーを押すと閉じます..."
echo
