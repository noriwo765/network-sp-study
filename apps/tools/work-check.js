// ワーク演習のデータ整合性チェック（node apps/tools/work-check.js）
//
// - 問題データ（apps/work/r*_pm*_q*.js）：id の重複、解答例の有無
// - 解答欄の分割（apps/js/work-shape.js をそのまま使う）：穴埋めが分割されない、
//   ①や・や「ラベル：」を含むのに1欄になる、など要確認の設問
// - 配点（server/haiten.json）：存在しない問題・設問・欄ラベルへの配点、欄別なのに合計だけ、など
// - 履歴（server/history.json）：存在しない問題・設問への記録、attempts の形
//
// オプション
//   --fields [問題id]   設問ごとの解答欄（配点を入れる単位）を一覧表示する。配点画像の取り込み前に使う。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const WORK = path.join(ROOT, 'apps', 'work');
let errors = 0, warns = 0;
const ng = msg => { errors++; console.log('NG  ', msg); };
const warn = msg => { warns++; console.log('要確認', msg); };

// 1欄で正しいと確認済みの設問（解答例に ①・： を含むが、別解の列挙や選択解答のため1欄が正解）
const KNOWN_SINGLE = new Set([
  'r4_pm1_q3:設問2(2)', // 「①，②，⑤，⑥」：①〜⑧から全て選び記号で答える（1欄にまとめて書く）
  'r7_pm1_q3:設問3(5)', // 「・負荷軽減　・RTTの短縮　・可用性の向上」：別解の列挙（10字以内で1つ答える）
]);

// ---- 読み込み -----------------------------------------------------------
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps', 'js', 'work-shape.js'), 'utf8'), ctx);
const { answerShape } = ctx.window.WorkShape;

const files = fs.existsSync(WORK) ? fs.readdirSync(WORK).filter(f => /^r\d+_pm\d_q\d+\.js$/.test(f)) : [];
if (!files.length) {
  console.log('問題データ（apps/work/r*_pm*_q*.js）が無いのでチェックできません（IPA由来のため Git 管理外・SSD上にのみある）。');
  process.exit(0);
}
ctx.window.WORK_PROBLEMS = [];
for (const f of files) vm.runInContext(fs.readFileSync(path.join(WORK, f), 'utf8'), ctx, { filename: f });
const PROBLEMS = ctx.window.WORK_PROBLEMS.slice().sort((a, b) => b.year.localeCompare(a.year) || a.section.localeCompare(b.section) || a.no - b.no);
const byId = new Map(PROBLEMS.map(p => [p.id, p]));
const shapeOf = new Map();
for (const p of PROBLEMS) for (const q of p.questions) shapeOf.set(`${p.id}:${q.id}`, answerShape(q));

// ---- --fields：配点を入れる単位の一覧 ----------------------------------
const fi = process.argv.indexOf('--fields');
if (fi !== -1) {
  const only = process.argv[fi + 1];
  for (const p of PROBLEMS) {
    if (only && p.id !== only) continue;
    console.log(`\n${p.id}  ${p.yearLabel} ${p.sectionLabel} 問${p.no} ${p.title}`);
    for (const q of p.questions) {
      const s = shapeOf.get(`${p.id}:${q.id}`);
      console.log(`  ${q.id.padEnd(8, '　')} ${s.mode === 'single' ? '（1欄）' : s.fields.join(' / ')}`);
    }
  }
  process.exit(0);
}

// ---- 問題データ ----------------------------------------------------------
const seen = new Set();
for (const p of PROBLEMS) {
  if (seen.has(p.id)) ng(`問題 id 重複: ${p.id}`);
  seen.add(p.id);
  const qs = new Set();
  for (const q of p.questions) {
    if (qs.has(q.id)) ng(`${p.id}: 設問 id 重複 ${q.id}`);
    qs.add(q.id);
    if (!q.answer) ng(`${p.id} ${q.id}: 解答例(answer)が空`);
  }
}

// ---- 解答欄の分割 --------------------------------------------------------
const count = { labeled: 0, bullets: 0, single: 0 };
for (const p of PROBLEMS) for (const q of p.questions) {
  const key = `${p.id}:${q.id}`, s = shapeOf.get(key), a = q.answer || '';
  count[s.mode]++;
  if (q.type === 'fill' && s.mode !== 'labeled') ng(`${key}: 穴埋めなのに空欄ごとに分かれない → ${a}`);
  if (s.mode === 'single' && !KNOWN_SINGLE.has(key) && (/：/.test(a) || /・/.test(a) || /[①-⑳]/.test(a)))
    warn(`${key}: 解答例に複数要素の印（： ・ ①）があるのに1欄 → ${a.slice(0, 60)}`);
}
console.log(`解答欄: ${PROBLEMS.length}問 / ${count.labeled + count.bullets + count.single}設問（ラベル付き ${count.labeled}・箇条書き ${count.bullets}・1欄 ${count.single}）`);

// ---- 配点 ----------------------------------------------------------------
const haitenPath = path.join(ROOT, 'server', 'haiten.json');
if (fs.existsSync(haitenPath)) {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(haitenPath, 'utf8')); } catch (e) { ng(`server/haiten.json が JSON として読めない: ${e.message}`); }
  const h = (j && j.haiten) || {};
  let n = 0;
  for (const [key, v] of Object.entries(h)) {
    n++;
    const s = shapeOf.get(key);
    if (!s) { ng(`配点: 存在しない設問 ${key}`); continue; }
    if (typeof v === 'number') {
      if (s.mode !== 'single') warn(`配点: ${key} は欄別（${s.fields.join('/')}）なのに合計だけ入っている（配点設定画面では空欄に見える）`);
    } else if (v && typeof v === 'object') {
      if (s.mode === 'single') warn(`配点: ${key} は1欄なのに欄別で入っている`);
      for (const label of Object.keys(v)) if (!s.fields.includes(label)) ng(`配点: ${key} に存在しない欄「${label}」（欄: ${s.fields.join('/')}）`);
    } else ng(`配点: ${key} の値が不正 ${JSON.stringify(v)}`);
  }
  console.log(`配点: ${n}設問ぶん（rev ${j && j.rev ? new Date(j.rev).toLocaleString() : 'なし'}）`);
}

// ---- 履歴 ----------------------------------------------------------------
const histPath = path.join(ROOT, 'server', 'history.json');
if (fs.existsSync(histPath)) {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(histPath, 'utf8')); } catch (e) { ng(`server/history.json が JSON として読めない: ${e.message}`); }
  const d = (j && j.data) || {};
  let attempts = 0;
  for (const [key, v] of Object.entries(d)) {
    if (key === '__haiten') { warn('履歴に旧仕様の配点(__haiten)が残っている（アプリ起動時に配点ファイルへ移行される）'); continue; }
    const m = /^(.+):__(timer|round)$/.exec(key);
    if (m) { if (!byId.has(m[1])) ng(`履歴: 存在しない問題の${m[2] === 'timer' ? 'タイマー' : '周回'} ${key}`); continue; }
    if (!shapeOf.has(key)) { ng(`履歴: 存在しない設問への記録 ${key}`); continue; }
    if (!Array.isArray(v.attempts)) { ng(`履歴: ${key} の attempts が配列でない`); continue; }
    for (const a of v.attempts) { attempts++; if (!a.at || !a.result) ng(`履歴: ${key} に at/result の無い採点がある`); }
  }
  console.log(`履歴: 採点 ${attempts}回ぶん（最終保存 ${j && j.savedAt ? new Date(j.savedAt).toLocaleString() : 'なし'}）`);
}

console.log(errors ? `\nNG ${errors}件・要確認 ${warns}件` : `\nOK（要確認 ${warns}件）`);
process.exit(errors ? 1 : 0);
