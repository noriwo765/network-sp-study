// ワーク演習：履歴（'<問題id>:<設問id>' などのキー → 値）の合わせ方。純粋関数。
// 画面（work-app.js）と中継サーバ（server/relay.js の /history）の両方から同じコードを使う。
//
// 以前は履歴を丸ごと上書きしていたため、古い内容を持ったまま開きっぱなしのタブが保存すると、
// その後の採点結果がまとめて消えた（2026-11-07）。そこで、どちらの側から保存しても
//   - 採点（attempts）は at で突き合わせて足すだけ。消さない
//   - 周回（__round）は開始時刻 at が新しい方
//   - 片方にしかないキーは残す
//   - 下書き（answer）・タイマー（__timer）など、それ以外は top（後から来た側）を優先。
//     ただし top がその問題の古い周のまま（リセット前の古いタブ）なら、その問題は base を残す
// という合わせ方にする。採点結果は、どの順で保存しても消えない。
(function (root) {
  const RETIRED = new Set(['__haiten']); // 旧仕様の相乗りデータ。片方で消したら復活させない

  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const pidOf = key => key.split(':')[0];
  const roundAt = (d, pid) => { const r = d[`${pid}:__round`]; return (isObj(r) && Number(r.at)) || 0; };

  // 文字化け（U+FFFD）の数。以前のサーバは受信時に日本語を化けさせることがあった
  const badChars = x => (JSON.stringify(x).match(/�/g) || []).length;

  function unionAttempts(a, b) {
    const byAt = new Map();
    for (const x of [...(a || []), ...(b || [])]) {
      if (!x) continue;
      const prev = byAt.get(x.at);
      // 同じ at（同じ採点）は b（top）の方。ただし b の方が文字化けが多ければ a を残す
      if (prev && prev !== x && badChars(x) > badChars(prev)) continue;
      byAt.set(x.at, x);
    }
    return [...byAt.values()].sort((x, y) => (x.at || 0) - (y.at || 0));
  }

  // base と top を合わせた新しいオブジェクトを返す（引数は書き換えない）。
  // added … top に無くて結果にある採点・キーの数（top の持ち主が読み直すべきかの目安）
  function mergeHistory(base, top) {
    base = isObj(base) ? base : {};
    top = isObj(top) ? top : {};
    const out = {};
    let added = 0;
    for (const key of new Set([...Object.keys(base), ...Object.keys(top)])) {
      const b = base[key], t = top[key];
      if (!(key in top)) {
        if (RETIRED.has(key)) continue;
        out[key] = b; added++;
        continue;
      }
      if (!(key in base)) { out[key] = t; continue; }
      if (key.endsWith(':__round')) {
        out[key] = (isObj(b) ? Number(b.at) || 0 : 0) > (isObj(t) ? Number(t.at) || 0 : 0) ? b : t;
        continue;
      }
      if (isObj(b) && isObj(t) && (Array.isArray(b.attempts) || Array.isArray(t.attempts))) {
        const attempts = unionAttempts(b.attempts, t.attempts);
        added += attempts.length - (t.attempts || []).length;
        out[key] = { ...b, ...t, attempts };
        continue;
      }
      out[key] = t;
    }
    // top がその問題について古い（周が古い・base にある採点を持っていない）なら、
    // 下書きとタイマーは base を残す（開きっぱなしの古いタブの内容で戻さない）
    const stale = new Set();
    for (const [key, b] of Object.entries(base)) {
      if (!key.includes(':')) continue;
      const pid = pidOf(key);
      if (roundAt(base, pid) > roundAt(top, pid)) { stale.add(pid); continue; }
      if (isObj(b) && Array.isArray(b.attempts) && b.attempts.length) {
        const have = new Set(((isObj(top[key]) && top[key].attempts) || []).map(x => x && x.at));
        if (b.attempts.some(x => x && !have.has(x.at))) stale.add(pid);
      }
    }
    for (const key of Object.keys(out)) {
      if (!key.includes(':') || !stale.has(pidOf(key))) continue;
      if (key.endsWith(':__timer')) { if (key in base) out[key] = base[key]; }
      else if (isObj(out[key]) && isObj(base[key]) && 'answer' in base[key]) out[key] = { ...out[key], answer: base[key].answer };
    }
    return { data: out, added };
  }

  const countAttempts = d => Object.values(isObj(d) ? d : {}).reduce((n, v) => n + ((isObj(v) && Array.isArray(v.attempts)) ? v.attempts.length : 0), 0);

  root.WorkMerge = { mergeHistory, unionAttempts, countAttempts };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.WorkMerge;
})(typeof window !== 'undefined' ? window : globalThis);
