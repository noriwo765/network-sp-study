# flashcards — 単語集・比較表・番号一覧

暗記系のデータ。アプリから読み込んで使う。

| ファイル | 内容 |
|---------|------|
| [terms.js](terms.js) | 用語データ（全19章）→ [単語カード](../apps/terms.html) |
| [compare.js](compare.js) | 紛らわしい用語の比較表 → [紛らわしい用語の比較](../apps/compare.html) |
| [ports.js](ports.js) | ポート番号と、IPプロトコル番号・マルチキャストアドレス・ICMPタイプなど → [ポート番号](../apps/ports.html) |

## データ形式
```js
// terms.js
{ ch: 本の章番号, term: '用語', desc: '意味', note: '補足・試験での狙われどころ（省略可）' }
// compare.js
{ ch, title: '見出し', point: '見分けるポイント', head: ['', '用語1', '用語2'], rows: [['観点', '値1', '値2']] }
// ports.js
{ port: 587, proto: 'TCP', name: 'サブミッション', desc: '用途', cat: '分類', ch }
```
追加・修正したら `node apps/tools/check.js` で確認し、`apps/sw.js` の `VERSION` を上げてから公開する。
