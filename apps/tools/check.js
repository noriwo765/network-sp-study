// アプリのデータ整合性チェック（node apps/tools/check.js）
//
// - アニメーションの全シナリオ：存在しないノード・リンクの参照、表の列数、図からのはみ出し、章番号
// - 単語集（flashcards/terms.js）・理解度チェック（quizzes/check.js）のデータ
// - sw.js の FILES：実在しないファイル、キャッシュ漏れ
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..');
let errors = 0;
const bad = msg => { errors++; console.log('NG', msg); };

// ---- シナリオ ---------------------------------------------------------

const html = fs.readFileSync(path.join(APP, 'packet-flow.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]).filter(s => !s.endsWith('pwa.js') && !s.endsWith('gate.js'));
const code = scripts.map(s => fs.readFileSync(path.join(APP, s), 'utf8')).join('\n')
  + '\n;globalThis.__out = { SCENARIOS, BOOK, HEADER_LAYOUTS };';
const ctx = {};
vm.runInNewContext(code, ctx);
const { SCENARIOS, BOOK, HEADER_LAYOUTS } = ctx.__out;

const onDisk = fs.readdirSync(path.join(APP, 'js/scenarios')).map(f => `js/scenarios/${f}`);
for (const f of onDisk) if (!scripts.includes(f)) bad(`packet-flow.html に読み込まれていない: ${f}`);

const ids = new Set();
for (const s of SCENARIOS) {
  if (ids.has(s.id)) bad(`id の重複: ${s.id}`);
  ids.add(s.id);
  if (!BOOK.chapters.some(c => c.no === s.chapter)) bad(`${s.id}: 章番号が不正 ${s.chapter}`);
  const width = s.viewBox ? Number(s.viewBox.split(' ')[2]) : 810;
  const has = (a, b) => s.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  for (const l of s.links) if (!s.nodes[l.a] || !s.nodes[l.b]) bad(`${s.id}: リンクのノードがない ${l.a}-${l.b}`);
  for (const [id, n] of Object.entries(s.nodes)) if (n.x - 40 < 0 || n.x + 40 > width) bad(`${s.id}: ノード ${id} が図からはみ出す`);
  s.steps.forEach((st, i) => {
    const tag = `${s.id}#${i}`;
    if (!st.title || !st.desc) bad(`${tag}: title / desc がない`);
    for (const ph of st.phases || []) for (const [f, t] of ph) {
      if (!s.nodes[f] || !s.nodes[t]) bad(`${tag}: ノードがない ${f}->${t}`);
      else if (!has(f, t)) bad(`${tag}: リンクがない ${f}-${t}`);
    }
    for (const k of Object.keys(st.links || {})) {
      const [a, b] = k.split('-');
      if (!has(a, b)) bad(`${tag}: links のキーが不正 ${k}`);
    }
    for (const id of [].concat(st.focus || [], Object.keys(st.nodes || {}), Object.keys(st.badges || {}))) {
      if (!s.nodes[id]) bad(`${tag}: ノードがない ${id}`);
    }
    for (const t of [].concat(st.side || [])) for (const r of t.rows) {
      if (r.length !== t.head.length) bad(`${tag}: 表「${t.title}」の列数 ${r.length}/${t.head.length}`);
    }
    for (const d of st.diagram || []) {
      const layout = HEADER_LAYOUTS[d.kind];
      if (!layout) { bad(`${tag}: ヘッダ図の種類が不正 ${d.kind}`); continue; }
      const keys = layout.rows.flat().map(f => f.k);
      for (const k of Object.keys(d.values)) if (!keys.includes(k)) bad(`${tag}: ヘッダ図「${d.title}」に不明な項目 ${k}`);
      for (const f of layout.rows.flat()) if (d.values[f.k] === undefined && f.def === undefined) bad(`${tag}: ヘッダ図「${d.title}」の ${f.k} が未設定`);
    }
    for (const sec of st.frame || []) for (const f of sec[1]) {
      if (f.length < 2 || f[1] === undefined) bad(`${tag}: フレームの項目が不正 ${f}`);
    }
  });
}
const empty = BOOK.chapters.filter(c => !SCENARIOS.some(s => s.chapter === c.no));
console.log(`シナリオ ${SCENARIOS.length} 本 / シナリオのない章: ${empty.map(c => c.no).join(', ') || 'なし'}`);

// ---- 単語集・理解度チェック --------------------------------------------

const DATA_FILES = ['../flashcards/terms.js', '../quizzes/check.js', '../flashcards/compare.js', '../flashcards/ports.js'];
const loadData = (file, name) => {
  const box = {};
  vm.runInNewContext(`${fs.readFileSync(path.join(APP, file), 'utf8')}\n;globalThis.__out = ${name};`, box);
  return box.__out;
};
const TERMS = loadData(DATA_FILES[0], 'TERMS');
const CHECKS = loadData(DATA_FILES[1], 'CHECKS');
const validCh = ch => BOOK.chapters.some(c => c.no === ch);

const termIds = new Set();
for (const t of TERMS) {
  const id = `${t.ch}:${t.term}`;
  if (termIds.has(id)) bad(`単語の重複: ${id}`);
  termIds.add(id);
  if (!validCh(t.ch)) bad(`単語「${t.term}」の章番号が不正: ${t.ch}`);
  if (!t.term || !t.desc) bad(`単語の term / desc がない: ${JSON.stringify(t)}`);
}
const checkIds = new Set();
for (const q of CHECKS) {
  if (checkIds.has(q.id)) bad(`問題 id の重複: ${q.id}`);
  checkIds.add(q.id);
  if (!validCh(q.ch)) bad(`問題 ${q.id} の章番号が不正: ${q.ch}`);
  if (!q.q || !q.explain) bad(`問題 ${q.id} の問題文 / 解説がない`);
  if (!Array.isArray(q.choices) || q.choices.length !== 4) bad(`問題 ${q.id} の選択肢が4つでない`);
  else if (new Set(q.choices).size !== 4) bad(`問題 ${q.id} の選択肢が重複している`);
  if (!(q.answer >= 0 && q.answer < 4)) bad(`問題 ${q.id} の answer が範囲外: ${q.answer}`);
}
const COMPARES = loadData(DATA_FILES[2], 'COMPARES');
for (const c of COMPARES) {
  if (!validCh(c.ch)) bad(`比較「${c.title}」の章番号が不正: ${c.ch}`);
  if (!c.title || !c.point) bad(`比較の title / point がない: ${c.title}`);
  for (const r of c.rows) if (r.length !== c.head.length) bad(`比較「${c.title}」の行の列数 ${r.length}/${c.head.length}: ${r[0]}`);
}
const PORTS = loadData(DATA_FILES[3], 'PORTS');
const NUMBERS = loadData(DATA_FILES[3], 'NUMBERS');
const portSeen = new Set();
for (const p of PORTS) {
  if (portSeen.has(p.port)) bad(`ポート番号の重複: ${p.port}`);
  portSeen.add(p.port);
  if (!(Number.isInteger(p.port) && p.port >= 0 && p.port <= 65535)) bad(`ポート番号が不正: ${p.port}`);
  if (!['TCP', 'UDP', 'TCP/UDP'].includes(p.proto)) bad(`ポート ${p.port} の proto が不正: ${p.proto}`);
  if (!validCh(p.ch)) bad(`ポート ${p.port} の章番号が不正: ${p.ch}`);
  if (!p.name || !p.desc || !p.cat) bad(`ポート ${p.port} の name / desc / cat がない`);
}
if (new Set(PORTS.map(p => p.name)).size !== PORTS.length) bad('ポートのサービス名が重複している（暗記テストの正解が曖昧になる）');
for (const g of NUMBERS) for (const it of g.items) {
  if (it.length !== 4 || !validCh(it[3])) bad(`「${g.group}」の行が不正: ${it.join(' / ')}`);
}
if (!NUMBERS.some(g => g.group === 'IPプロトコル番号')) bad('NUMBERS に「IPプロトコル番号」がない（暗記テストで使う）');
console.log(`比較 ${COMPARES.length} 件 / ポート ${PORTS.length} 件 / その他の番号 ${NUMBERS.reduce((a, g) => a + g.items.length, 0)} 件`);

const noData = BOOK.chapters.filter(c => !TERMS.some(t => t.ch === c.no) || !CHECKS.some(q => q.ch === c.no));
console.log(`単語 ${TERMS.length} 語 / 問題 ${CHECKS.length} 問 / データのない章: ${noData.map(c => c.no).join(', ') || 'なし'}`);

// ---- Service Worker のキャッシュ対象 ------------------------------------

const sw = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');
const listed = [...sw.matchAll(/^\s*'(\.\.?\/[^']*)',$/gm)].map(m => m[1].replace(/^\.\//, '')).filter(Boolean);
const walk = dir => fs.readdirSync(path.join(APP, dir), { withFileTypes: true }).flatMap(e => {
  const rel = dir ? `${dir}/${e.name}` : e.name;
  return e.isDirectory() ? walk(rel) : [rel];
});
// キャッシュ対象外：tools/・各階層のREADME.md・sw.js・エディタ用ファイル、
// およびワーク演習（work.html / work/ / work.css / work-app.js / work-shape.js）と学習計画（plan.*）。ローカル専用で
// 中継サーバから配信するため、公開用オフラインキャッシュ（sw.js）には含めない。
// Mac が exFAT に作る付随ファイル（._*）も対象外。
const served = walk('').filter(f => !/(^tools\/|(^|\/)\._|(^|\/)README\.md$|^sw\.js$|\.code-workspace$|^work\.html$|^work\/|^css\/work\.css$|^js\/work-(app|shape)\.js$|^plan\.html$|^css\/plan\.css$|^js\/plan-app\.js$)/.test(f)).concat(DATA_FILES);
for (const f of listed) if (!fs.existsSync(path.join(APP, f))) bad(`sw.js にあるが実在しない: ${f}`);
for (const f of served) if (!listed.includes(f)) bad(`sw.js のキャッシュ対象に漏れ: ${f}`);
console.log(`キャッシュ対象 ${listed.length} ファイル`);

console.log(errors ? `NG ${errors} 件` : 'OK');
process.exit(errors ? 1 : 0);
