# flashcards — 単語集

本の章ごとの用語集。アプリの[単語カード](../apps/terms.html)で使う。

| ファイル | 内容 |
|---------|------|
| [terms.js](terms.js) | 用語データ（全19章） |

## データ形式
```js
{ ch: 本の章番号, term: '用語', desc: '意味', note: '補足・試験での狙われどころ（省略可）' }
```
追加・修正したら `node apps/tools/check.js` で確認し、`apps/sw.js` の `VERSION` を上げてから公開する。
