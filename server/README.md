# server — ワーク演習の AI 採点 中継サーバ

記述式（午後問題型）の解答を **Claude に採点させる**ための小さな中継サーバ。依存ライブラリなし（Node.js 18 以上に同梱の機能だけ）。

## なぜ必要か
Anthropic の API キーをブラウザ（＝公開される静的サイト）に置くと漏れます。キーはこのサーバだけが持ち、ブラウザはこのサーバの `/grade` を呼びます。キーは外に出ません。

## 準備
1. [Anthropic Console](https://console.anthropic.com/) で API キーを発行する（従量課金。採点1回あたり概ね数円以下）。
2. `server/.env.example` を `server/.env` にコピーし、`ANTHROPIC_API_KEY` を自分のキーに書き換える。
   - `.env` は `.gitignore` 済みなので Git には上がりません。

## 起動
```
node server/relay.js
```
起動したらブラウザで **http://localhost:8787/apps/work.html** を開く。

| URL | 内容 |
|-----|------|
| http://localhost:8787/apps/work.html | ワーク演習（AI採点） |
| http://localhost:8787/apps/index.html | 学習サイト全体（単語カード等も同じサーバで開ける） |
| http://localhost:8787/health | 状態確認（モデル名・キーの有無） |

## 設定（環境変数、すべて任意）
| 変数 | 既定 | 説明 |
|------|------|------|
| `ANTHROPIC_API_KEY` | （必須） | Anthropic の API キー |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | 採点に使うモデル |
| `PORT` | `8787` | 待ち受けポート |

## 仕組み
`POST /grade` に `{ context, questionNo, questionText, charLimit, officialAnswer, commentary, studentAnswer }` を送ると、サーバが採点用プロンプトを組み立てて Claude に渡し、次の JSON を返す。

```json
{ "verdict": "部分正解", "score": 6, "scoreMax": 10,
  "good": ["…"], "missing": ["…"], "diff": "…", "advice": "…", "modelAnswer": "…" }
```

採点基準は IPA 公開の**公式「解答例」**。別解・言い換えも趣旨が合えば加点するよう指示している。

> 注意：このサーバはローカル利用（localhost）前提。そのまま外部公開しないこと。
