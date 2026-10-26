// 簡易パスワードゲート（通りすがりを防ぐ程度の「鍵」）
//
// ■これは何か
//   GitHub Pages は公開サイトなので、JavaScript だけで「本物の認証」はできません
//   （view-source で頑張れば破れます）。これは身内以外がうっかり開かないための簡易な鍵です。
//
// ■合言葉の決め方・変え方
//   合言葉そのものは埋め込まず、SHA-256 ハッシュだけを下の HASH に入れます。
//   ハッシュは apps/tools/パスワード設定.html を開いて合言葉を入力すると出ます。
//   そこに出た1行をこのファイルの HASH 行と差し替えてください。
//
// ■解除のしかた（忘れたとき）
//   ブラウザのコンソールで localStorage.removeItem('nsp-gate-v1') を実行、
//   または端末のサイトデータを消すと再入力になります。

(function () {
  'use strict';

  // GitHub Pages（*.github.io）で開いたときだけ鍵をかける。
  // ローカル実行はすべて素通り：localhost / 127.0.0.1 の中継サーバ、file:// の直開き、
  // MacBook に SSD をつないで開く場合など（ホスト名が github.io でなければ何もしない）。
  if (!location.hostname.endsWith('github.io')) return;

  // ▼▼ ここを自分の合言葉のハッシュに差し替える（apps/tools/パスワード設定.html で生成）▼▼
  const HASH = 'efd9ef1fca647b4cdbde2fbdebeacec54d73726ccd39032d7f81ddb23b0d517f';
  // ▲▲ ここまで ▲▲

  const KEY = 'nsp-gate-v1';
  const TTL = 1000 * 60 * 60 * 24 * 30; // 解錠を覚えておく期間（30日）

  // まだハッシュを設定していない / 鍵を使わないなら何もしない
  if (!HASH || HASH === 'PUT_YOUR_SHA256_HASH_HERE') return;

  // crypto.subtle は https か localhost でないと使えない。使えない環境では鍵をかけない
  if (!(window.crypto && crypto.subtle)) return;

  function alreadyUnlocked() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      return saved.h === HASH && (Date.now() - saved.t) < TTL;
    } catch (e) {
      return false;
    }
  }

  if (alreadyUnlocked()) return; // 解錠済みなら素通り（ちらつきなし）

  // 本文を隠す（ページ本体が見えないように、まず全体を非表示にする）
  const hideStyle = document.createElement('style');
  hideStyle.textContent = 'html{visibility:hidden!important}';
  (document.head || document.documentElement).appendChild(hideStyle);

  async function sha256hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function unlock() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ h: HASH, t: Date.now() }));
    } catch (e) { /* プライベートモード等では保存できないが、このページ内は開ける */ }
    overlay.remove();
    hideStyle.remove();
  }

  // 鍵の入力画面（CSS に依存しないようインラインで組む）
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText = [
    'visibility:visible', 'position:fixed', 'inset:0', 'z-index:2147483647',
    'display:flex', 'align-items:center', 'justify-content:center',
    'background:#14171c', 'color:#e6e9ee', 'padding:16px',
    'font-family:system-ui,-apple-system,sans-serif', '-webkit-tap-highlight-color:transparent',
  ].join(';');

  overlay.innerHTML =
    '<form style="width:100%;max-width:340px;text-align:center">' +
      '<div style="font-size:40px;line-height:1;margin-bottom:12px">🔒</div>' +
      '<h1 style="font-size:18px;margin:0 0 6px">ネスペ学習</h1>' +
      '<p style="font-size:13px;opacity:.7;margin:0 0 18px">合言葉を入力してください</p>' +
      '<input type="password" autocomplete="current-password" autocapitalize="off" ' +
        'autocorrect="off" spellcheck="false" ' +
        'style="width:100%;box-sizing:border-box;padding:12px 14px;font-size:16px;border:1px solid #3a4150;' +
        'border-radius:10px;background:#1f242c;color:#e6e9ee;outline:none">' +
      '<p class="nsp-gate-err" style="min-height:18px;margin:8px 0 0;font-size:13px;color:#f3736b"></p>' +
      '<button type="submit" ' +
        'style="width:100%;margin-top:6px;padding:12px;font-size:16px;font-weight:600;border:0;' +
        'border-radius:10px;background:#5b8def;color:#fff;cursor:pointer">開く</button>' +
    '</form>';

  const form = overlay.querySelector('form');
  const input = overlay.querySelector('input');
  const err = overlay.querySelector('.nsp-gate-err');
  const button = overlay.querySelector('button');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    button.disabled = true;
    err.textContent = '';
    const ok = (await sha256hex(input.value)) === HASH;
    if (ok) {
      unlock();
    } else {
      err.textContent = '合言葉が違います';
      input.value = '';
      input.focus();
      button.disabled = false;
    }
  });

  function mount() {
    (document.body || document.documentElement).appendChild(overlay);
    input.focus();
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
