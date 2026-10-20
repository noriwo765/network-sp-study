// アプリのデータ整合性チェック（node apps/tools/check.js）
//
// - アニメーションの全シナリオ：存在しないノード・リンクの参照、表の列数、図からのはみ出し、章番号
// - sw.js の FILES：実在しないファイル、キャッシュ漏れ
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..');
let errors = 0;
const bad = msg => { errors++; console.log('NG', msg); };

// ---- シナリオ ---------------------------------------------------------

const html = fs.readFileSync(path.join(APP, 'packet-flow.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]).filter(s => !s.endsWith('pwa.js'));
const code = scripts.map(s => fs.readFileSync(path.join(APP, s), 'utf8')).join('\n')
  + '\n;globalThis.__out = { SCENARIOS, BOOK };';
const ctx = {};
vm.runInNewContext(code, ctx);
const { SCENARIOS, BOOK } = ctx.__out;

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
    for (const sec of st.frame || []) for (const f of sec[1]) {
      if (f.length < 2 || f[1] === undefined) bad(`${tag}: フレームの項目が不正 ${f}`);
    }
  });
}
const empty = BOOK.chapters.filter(c => !SCENARIOS.some(s => s.chapter === c.no));
console.log(`シナリオ ${SCENARIOS.length} 本 / シナリオのない章: ${empty.map(c => c.no).join(', ') || 'なし'}`);

// ---- Service Worker のキャッシュ対象 ------------------------------------

const sw = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');
const listed = [...sw.matchAll(/^\s*'\.\/([^']*)',$/gm)].map(m => m[1]).filter(Boolean);
const walk = dir => fs.readdirSync(path.join(APP, dir), { withFileTypes: true }).flatMap(e => {
  const rel = dir ? `${dir}/${e.name}` : e.name;
  return e.isDirectory() ? walk(rel) : [rel];
});
const served = walk('').filter(f => !/^(tools\/|README\.md$|sw\.js$)/.test(f));
for (const f of listed) if (!fs.existsSync(path.join(APP, f))) bad(`sw.js にあるが実在しない: ${f}`);
for (const f of served) if (!listed.includes(f)) bad(`sw.js のキャッシュ対象に漏れ: ${f}`);
console.log(`キャッシュ対象 ${listed.length} ファイル`);

console.log(errors ? `NG ${errors} 件` : 'OK');
process.exit(errors ? 1 : 0);
