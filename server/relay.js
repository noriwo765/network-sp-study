// ネスペ ワーク演習 — Claude 採点 中継サーバ
//
// 役割
//   1) 学習サイト（リポジトリ直下）を静的配信する
//   2) POST /grade を受け、Anthropic API（Claude）に記述解答の採点を委譲して結果を返す
//
// なぜ中継サーバが要るか
//   APIキーをブラウザ（公開される静的サイト）に置くと漏れる。キーはこのサーバだけが持ち、
//   ブラウザはこのサーバの /grade を叩く。キーは外に出ない。
//
// 使い方
//   1) 環境変数 ANTHROPIC_API_KEY を設定する（または server/.env に書く）
//   2) node server/relay.js
//   3) ブラウザで http://localhost:8787/apps/work.html を開く
//
// 依存ライブラリなし（Node 18+ の組み込み fetch と http を使う）。

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---- 設定 ---------------------------------------------------------------
loadDotEnv(path.join(__dirname, '.env')); // server/.env があれば読む（任意）

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(__dirname, '..'); // リポジトリ直下を配信
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// ---- サーバ -------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/grade') return void (await handleGrade(req, res));
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, model: MODEL, hasKey: !!API_KEY });
    // 学習履歴ファイル（端末間の持ち運び用）。この端末のローカルにだけ置く。
    if (req.method === 'GET' && req.url === '/history') return void readHistory(res);
    if ((req.method === 'PUT' || req.method === 'POST') && req.url === '/history') return void (await writeHistory(req, res));
    // 配点予想（履歴とは別ファイル haiten.json）
    if (req.method === 'GET' && req.url === '/haiten') return void readHaiten(res);
    if ((req.method === 'PUT' || req.method === 'POST') && req.url === '/haiten') return void (await writeHaiten(req, res));
    // 想定合格率（AI 判定。結果は estimate.json に保存）
    if (req.method === 'GET' && req.url === '/estimate') return void readEstimate(res);
    if (req.method === 'POST' && req.url === '/estimate') return void (await handleEstimate(req, res));
    // 学習計画（予定・チェック・メモ。plan.json）
    if (req.method === 'GET' && req.url === '/plan') return void readPlan(res);
    if ((req.method === 'PUT' || req.method === 'POST') && req.url === '/plan') return void (await writePlan(req, res));
    // 解答記録（Markdown）を解答記録/ フォルダへ書き出す
    if ((req.method === 'POST' || req.method === 'PUT') && req.url === '/record') return void (await writeRecord(req, res));
    if (req.method === 'GET') return serveStatic(req, res);
    res.writeHead(405).end('Method Not Allowed');
  } catch (e) {
    send(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`\nネスペ ワーク演習サーバ起動`);
  console.log(`  学習サイト : http://localhost:${PORT}/apps/index.html`);
  console.log(`  ワーク演習 : http://localhost:${PORT}/apps/work.html`);
  console.log(`  学習計画   : http://localhost:${PORT}/apps/plan.html`);
  console.log(`  採点モデル : ${MODEL}`);
  console.log(`  APIキー    : ${API_KEY ? '設定済み' : '未設定（ANTHROPIC_API_KEY を設定してください）'}\n`);
});

// ---- /grade -------------------------------------------------------------
async function handleGrade(req, res) {
  if (!API_KEY) return send(res, 503, { error: 'ANTHROPIC_API_KEY が未設定です。server/.env か環境変数に設定してください。' });
  const body = await readJson(req);
  const { context, questionNo, questionText, charLimit, officialAnswer, commentary, studentAnswer, scoreMax, scoreBreakdown } = body || {};
  if (!questionText || studentAnswer == null) return send(res, 400, { error: 'questionText と studentAnswer が必要です。' });
  const hasMax = typeof scoreMax === 'number' && scoreMax > 0;
  const hasBreakdown = hasMax && typeof scoreBreakdown === 'string' && scoreBreakdown.trim();

  const system = [
    'あなたはネットワークスペシャリスト試験（IPA）午後問題の採点官です。',
    '受験者の記述解答を、公式の「解答例」を基準に厳正かつ丁寧に採点します。',
    '解答例は一例であり、言い換えや別解でも趣旨が合致していれば加点します。逆に、キーワードが合っていても論理や因果が誤っていれば減点します。',
    '字数制限がある場合は、超過は原則減点対象とし、指摘します。',
    '出力は必ず次の JSON だけ（前後に文章を付けない）。日本語で書く。',
    '{',
    '  "verdict": "正解" | "部分正解" | "不正解",',
    '  "score": 数値,            // 0〜scoreMax の目安',
    hasMax ? `  "scoreMax": ${scoreMax},         // この設問の満点は ${scoreMax} 点。score は 0〜${scoreMax} で付ける`
           : '  "scoreMax": 数値,         // 配点が不明なら 10',
    '  "good": [string],         // 加点できる要素（箇条書き）',
    '  "missing": [string],      // 不足・誤り（箇条書き）',
    '  "diff": string,           // 解答例との差分の要約',
    '  "advice": string,         // 次に活かす学習アドバイス',
    '  "modelAnswer": string     // 模範解答（公式解答例を簡潔に）',
    '}',
  ].join('\n');

  const user = [
    context ? `【問題の文脈】\n${context}\n` : '',
    questionNo ? `【設問】${questionNo}` : '【設問】',
    questionText,
    charLimit ? `（字数制限: ${charLimit}）` : '',
    hasMax ? `（この設問の満点: ${scoreMax}点。score は 0〜${scoreMax} の範囲で付けること）` : '',
    hasBreakdown ? `（配点内訳: ${scoreBreakdown}。各空欄・項目をこの配点で部分採点し、合計を score とすること）` : '',
    '',
    `【公式解答例】\n${officialAnswer || '(なし)'}`,
    commentary ? `\n【採点講評（抜粋）】\n${commentary}` : '',
    '',
    `【受験者の解答】\n${studentAnswer}`,
    '',
    '上記を採点し、指定の JSON だけを出力してください。',
  ].filter(Boolean).join('\n');

  const apiRes = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      // Sonnet 5.5 等は思考(adaptive)が既定ON。思考＋JSON出力が収まるよう余裕を持たせる
      max_tokens: 2500,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!apiRes.ok) {
    const text = await apiRes.text();
    return send(res, 502, { error: `Anthropic API エラー (${apiRes.status})`, detail: text.slice(0, 500) });
  }
  const data = await apiRes.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const parsed = extractJson(text);
  if (!parsed) return send(res, 200, { verdict: '判定不能', raw: text });
  send(res, 200, parsed);
}

// ---- /estimate（想定合格率の AI 判定） ----------------------------------
// ブラウザが集計した「各設問の最終の採点結果（未回答は0点）」を渡し、厳しめに合格可能性を判定させる。
// 結果は server/estimate.json に保存（履歴・配点とは別ファイル。もう一方のマシンでも見られる）。
const ESTIMATE_FILE = path.join(__dirname, 'estimate.json');
function readEstimate(res) {
  fs.readFile(ESTIMATE_FILE, 'utf8', (err, txt) => {
    if (err) return send(res, 200, {});
    try { return send(res, 200, JSON.parse(txt)); } catch (_) { return send(res, 200, {}); }
  });
}
async function handleEstimate(req, res) {
  if (!API_KEY) return send(res, 503, { error: 'ANTHROPIC_API_KEY が未設定です。server/.env か環境変数に設定してください。' });
  const body = await readJson(req);
  if (!body || !body.stats) return send(res, 400, { error: 'stats が必要です。' });

  const system = [
    'あなたはネットワークスペシャリスト試験（IPA）の指導経験が豊富な講師です。',
    '受験者の午後問題（過去問演習）の採点結果から、本番の想定合格率を「厳しめ」に見積もります。',
    '前提：',
    '- 合格には午後Ⅰ・午後Ⅱとも100点満点で60点以上が必要（午前は考慮しない）。午後Ⅰは3問から2問、午後Ⅱは2問から1問を選んで解く。',
    '- 判定は各設問の「最終の採点結果」をもとにする。まだ解いていない問題・設問は0点として扱う（解けるかどうか未確認のため）。',
    '- 過去問の点は、同じ問題を繰り返し解くほど本番より高く出やすい。周回で上がった点は割り引いて考える。',
    '- AI 採点は本番の採点より甘くなりがちなので、その分も割り引く。',
    '- 本番までの残り日数と、伸びの傾向（同じ問題の点の推移）は考慮してよいが、楽観的にしない。',
    '出力は必ず次の JSON だけ（前後に文章を付けない）。日本語で書く。',
    '{',
    '  "rate": 数値,              // 想定合格率（%、0〜100 の整数。厳しめ）',
    '  "pm1": 数値, "pm2": 数値,  // 現時点の本番想定点（100点満点、厳しめ）',
    '  "summary": string,         // 一言での判定（60字程度）',
    '  "reasons": [string],       // 判定の根拠（3〜5個、数字を引用して具体的に）',
    '  "actions": [string]        // 合格率を上げるために次にやること（3個、具体的に）',
    '}',
  ].join('\n');
  const user = `【受験者の演習データ】\n${JSON.stringify(body.stats, null, 1)}\n\n上記から想定合格率を厳しめに判定し、指定の JSON だけを出力してください。`;

  const apiRes = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!apiRes.ok) {
    const text = await apiRes.text();
    return send(res, 502, { error: `Anthropic API エラー (${apiRes.status})`, detail: text.slice(0, 500) });
  }
  const data = await apiRes.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const parsed = extractJson(text);
  if (!parsed || typeof parsed.rate !== 'number') return send(res, 502, { error: '判定結果を解釈できませんでした。', detail: text.slice(0, 500) });
  const out = { at: Date.now(), model: MODEL, ...parsed, basis: body.basis || null };
  fs.writeFile(ESTIMATE_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8', () => send(res, 200, out));
}

// ---- /history（学習履歴の保存ファイル） --------------------------------
// ブラウザの localStorage だけだと端末ごとに別管理になるため、ここで server/history.json に
// 保存しておき、起動時にブラウザへ読み込ませる（完全上書き）。中身は受験者の解答・採点履歴。
const HISTORY_FILE = path.join(__dirname, 'history.json');
function readHistory(res) {
  fs.readFile(HISTORY_FILE, 'utf8', (err, txt) => {
    if (err) return send(res, 200, {}); // まだ無ければ空を返す
    try { return send(res, 200, JSON.parse(txt)); } catch (_) { return send(res, 200, {}); }
  });
}
async function writeHistory(req, res) {
  const body = await readJson(req);
  fs.writeFile(HISTORY_FILE, JSON.stringify(body), 'utf8', err => {
    if (err) return send(res, 500, { error: String(err.message || err) });
    send(res, 200, { ok: true });
  });
}

// ---- /haiten（配点予想の保存ファイル。履歴とは別管理） ------------------
const HAITEN_FILE = path.join(__dirname, 'haiten.json');
function readHaiten(res) {
  fs.readFile(HAITEN_FILE, 'utf8', (err, txt) => {
    if (err) return send(res, 200, {}); // まだ無ければ空
    try { return send(res, 200, JSON.parse(txt)); } catch (_) { return send(res, 200, {}); }
  });
}
async function writeHaiten(req, res) {
  const body = await readJson(req);
  // 古い rev（最終編集時刻）での上書きは拒否する。開きっぱなしのブラウザが、もう一方のマシンや
  // Claude Code が更新した新しいファイルを潰さないため。
  let curRev = 0;
  try { curRev = Number(JSON.parse(fs.readFileSync(HAITEN_FILE, 'utf8')).rev) || 0; } catch (_) { /* 無い・壊れている → 0 */ }
  if ((Number(body && body.rev) || 0) < curRev) return send(res, 409, { error: 'ファイル側の配点の方が新しいため上書きしませんでした。ページを再読み込みしてください。' });
  fs.writeFile(HAITEN_FILE, JSON.stringify(body, null, 2) + '\n', 'utf8', err => {
    if (err) return send(res, 500, { error: String(err.message || err) });
    send(res, 200, { ok: true });
  });
}

// ---- /plan（学習計画の保存ファイル。履歴・配点とは別管理） ------------------
// 中身は予定（Claude Code が作る）と、利用者のチェック・メモ。ファイルの更新時刻を版として返し、
// 書き込み時に読んだ時点の版（baseVersion）と食い違えば拒否する。開きっぱなしのタブが、
// Claude Code やもう一方のマシンが書き換えた新しい計画を潰さないため。
const PLAN_FILE = path.join(__dirname, 'plan.json');
const planVersion = () => { try { return fs.statSync(PLAN_FILE).mtimeMs; } catch (_) { return 0; } };
function readPlan(res) {
  fs.readFile(PLAN_FILE, 'utf8', (err, txt) => {
    if (err) return send(res, 200, { version: 0, plan: null }); // まだ無い
    try { return send(res, 200, { version: planVersion(), plan: JSON.parse(txt) }); }
    catch (e) { return send(res, 500, { error: `plan.json を読めません：${e.message}` }); }
  });
}
async function writePlan(req, res) {
  const body = await readJson(req);
  if (!body || !body.plan || typeof body.plan !== 'object') return send(res, 400, { error: 'plan が必要です。' });
  if (Number(body.baseVersion) !== planVersion()) return send(res, 409, { error: '計画ファイルが別の場所で更新されています。ページを再読み込みしてください。' });
  fs.writeFile(PLAN_FILE, JSON.stringify(body.plan, null, 2) + '\n', 'utf8', err => {
    if (err) return send(res, 500, { error: String(err.message || err) });
    send(res, 200, { ok: true, version: planVersion() });
  });
}

// ---- /record（解答記録 Markdown の書き出し） ---------------------------
// 採点のたびにブラウザが組み立てた Markdown を、リポジトリ直下の 解答記録/ に保存する。
// 中身は個人の解答・採点なので .gitignore 済み（README だけ追跡）。
const RECORDS_DIR = path.join(ROOT, '解答記録');
async function writeRecord(req, res) {
  const body = await readJson(req);
  const { name, markdown } = body || {};
  if (!name || typeof markdown !== 'string') return send(res, 400, { error: 'name と markdown が必要です。' });
  // パスを区切りごとに分解し、各セグメントをサニタイズ。「..」「.」やドライブ指定は除去する
  // （解答記録/ の外へは絶対に書けないようにする）。サブフォルダ1階層（問題フォルダ）を許容。
  const parts = String(name).split(/[\/\\]+/)
    .map(s => s.replace(/[:*?"<>|]/g, '_').replace(/^\.+$/, '_').trim().slice(0, 80))
    .filter(s => s && s !== '.' && s !== '..');
  if (!parts.length) return send(res, 400, { error: 'name が不正です。' });
  if (!parts[parts.length - 1].toLowerCase().endsWith('.md')) return send(res, 400, { error: 'name は .md で終わる必要があります。' });
  const file = path.join(RECORDS_DIR, ...parts);
  if (file !== RECORDS_DIR && !file.startsWith(RECORDS_DIR + path.sep)) return send(res, 403, { error: '不正なパスです。' });
  fs.mkdir(path.dirname(file), { recursive: true }, errDir => {
    if (errDir) return send(res, 500, { error: String(errDir.message || errDir) });
    fs.writeFile(file, markdown, 'utf8', err => {
      if (err) return send(res, 500, { error: String(err.message || err) });
      send(res, 200, { ok: true, path: `解答記録/${parts.join('/')}` });
    });
  });
}

// ---- 補助 ---------------------------------------------------------------
function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let rel = urlPath === '/' ? '/apps/index.html' : urlPath;
  const filePath = path.join(ROOT, path.normalize(rel));
  if (!filePath.startsWith(ROOT)) return res.writeHead(403).end('Forbidden'); // ディレクトリ外アクセス防止
  fs.readFile(filePath, (err, buf) => {
    if (err) return res.writeHead(404).end('Not Found');
    // no-cache：ブラウザに毎回確認させる（画面の JS を直したのに古いファイルが使われる、を防ぐ）
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 2e7) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// Claude の出力から JSON 部分を取り出す（```json フェンスや前後の文章に強くする）
function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const s = candidate.indexOf('{'), e = candidate.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(candidate.slice(s, e + 1)); } catch (_) { return null; }
}

// server/.env の KEY=VALUE を process.env に読み込む（ライブラリなし）
function loadDotEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch (_) { /* .env が無ければ環境変数のみ使う */ }
}
