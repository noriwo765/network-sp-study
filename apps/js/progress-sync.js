// 暗記系の学習記録（単語カード・理解度チェック・一問一答・診断）を消えないようにする
//
// - localStorage はサイトデータの削除や、iPhone の Safari が7日間開かなかったサイトのデータを消す仕組みで
//   消えることがある。
// - 中継サーバ（http://localhost:8787）で開いているときは server/progress.json に控えを置く。
//   最終更新時刻（at）を比べて新しい方を採用する（ワーク演習の履歴と同じ考え方）。
// - スマホ（GitHub Pages）にはサーバがないので、トップページの「書き出し／読み込み」で手動バックアップする。
// 記録を保存した側は ProgressSync.changed() を呼ぶ。
window.ProgressSync = (() => {
  const KEYS = ['nespe-progress-v1', 'nespe-qa-v1', 'nespe-diagnostic-v1'];
  const AT_KEY = 'nespe-progress-at', BACKUP_KEY = 'nespe-backup-at';
  const hasServer = location.protocol === 'http:'; // 中継サーバ経由のときだけ（https = GitHub Pages、file:// は対象外）

  const num = k => { try { return Number(localStorage.getItem(k)) || 0; } catch (_) { return 0; } };
  const localAt = () => num(AT_KEY);
  const snapshot = () => {
    const data = {};
    for (const k of KEYS) { try { const v = localStorage.getItem(k); if (v != null) data[k] = JSON.parse(v); } catch (_) {} }
    return data;
  };
  const restore = data => {
    for (const k of KEYS) {
      try { if (data[k] != null) localStorage.setItem(k, JSON.stringify(data[k])); else localStorage.removeItem(k); } catch (_) {}
    }
  };
  const hasData = data => Object.values(data).some(v => v && Object.keys(v).length);
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  // 2つの記録を合わせる。両方にある項目は b を採用（中のオブジェクトは再帰的に合わせる）
  const merge = (a, b) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
    return out;
  };

  const push = () => hasServer && fetch('/progress', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ at: localAt(), data: snapshot() }),
  }).catch(() => {});

  let timer = null;
  function changed() {
    try { localStorage.setItem(AT_KEY, String(Date.now())); } catch (_) {}
    clearTimeout(timer);
    timer = setTimeout(push, 800);
  }

  // 開いたときに一度だけ：ファイルの方が新しければ取り込んで再読み込み、ブラウザの方が新しければ送る
  async function pull() {
    if (!hasServer) return;
    let file;
    try { const r = await fetch('/progress', { cache: 'no-store' }); if (!r.ok) return; file = await r.json(); } catch (_) { return; }
    const fileAt = Number(file && file.at) || 0;
    if (!localAt() && fileAt && hasData(snapshot())) {
      // この仕組みを入れる前の記録がブラウザにもファイルにもある（もう一方のマシンが先に同期した）。
      // どちらかで潰さず、両方を合わせる（同じ項目はファイル側を採用）
      restore(merge(snapshot(), file.data));
      try { localStorage.setItem(AT_KEY, String(Date.now())); } catch (_) {}
      await push();
      location.reload();
    } else if (fileAt > localAt() && file.data) {
      restore(file.data);
      try { localStorage.setItem(AT_KEY, String(fileAt)); } catch (_) {}
      location.reload();
    } else if (localAt() > fileAt || (!fileAt && hasData(snapshot()))) {
      if (!localAt()) { try { localStorage.setItem(AT_KEY, String(Date.now())); } catch (_) {} }
      push();
    }
  }
  pull();

  // ---- 手動バックアップ（ファイルに書き出す／読み込む） ----
  function exportFile() {
    const at = Date.now();
    const body = JSON.stringify({ app: 'nespe-progress', at, data: snapshot() }, null, 1);
    const d = new Date(at), p = n => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    a.download = `ネスペ学習記録_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    try { localStorage.setItem(BACKUP_KEY, String(at)); } catch (_) {}
  }
  async function importFile(file) {
    const json = JSON.parse(await file.text());
    if (!json || json.app !== 'nespe-progress' || !json.data) throw new Error('ネスペ学習の記録ファイルではありません。');
    restore(json.data);
    try { localStorage.setItem(AT_KEY, String(Date.now())); } catch (_) {}
    await push(); // 読み込んだ内容を最新としてサーバにも送る
    return json;
  }

  return { changed, exportFile, importFile, lastBackup: () => num(BACKUP_KEY), hasServer };
})();
