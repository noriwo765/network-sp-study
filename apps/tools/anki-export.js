// 苦手ジャンルの一問一答（flashcards/qa_weak.js）を Anki 用の .apkg に書き出す
//   node --experimental-sqlite apps/tools/anki-export.js [出力先.apkg]
//   node --experimental-sqlite apps/tools/anki-export.js --final [出力先.apkg]
//     … 本番前の定番の答え（flashcards/qa_final.js）を別のデッキ「ネスペ::本番前 定番の答え」に書き出す
//
// - 出力先の既定は flashcards/苦手ジャンル_一問一答.apkg。ダブルクリックで Anki に取り込める。
// - ノートの guid はカードの id から作るので、qa_weak.js を更新して書き出し直しても
//   同じカードは上書きされ、Anki 側の学習記録は残る（qa_weak.js から消したカードは Anki には残る）。
// - ジャンル（theme）はタグ「ジャンル::〜」にする。選択肢は表面に出すと答えが見えるので入れない。
// - 外部パッケージは使わない（node:sqlite は Node 22.5 以降。zlib.crc32 は 22.2 以降）。
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
// 書き出す一式（カードのファイル・デッキ・既定の出力先）。デッキの id は書き出し直しても変えない
const SETS = {
  weak: { src: 'qa_weak.js', deckId: 1762000000002, deckName: 'ネスペ::苦手ジャンル 一問一答', out: '苦手ジャンル_一問一答.apkg' },
  final: { src: 'qa_final.js', deckId: 1762000000102, deckName: 'ネスペ::本番前 定番の答え', out: '本番前_定番の答え.apkg' },
};
const args = process.argv.slice(2);
const set = args.includes('--final') ? SETS.final : SETS.weak;
const out = args.find(a => !a.startsWith('--')) || path.join(ROOT, 'flashcards', set.out);

global.window = {};
require(path.join(ROOT, 'flashcards', set.src));
const cards = window.QA_CARDS;

// id は書き出し直しても変わらないよう固定する
const MODEL_ID = 1762000000001;
const DECK_ID = set.deckId;
const DECK_NAME = set.deckName;
const FIELDS = ['問題', '答え', 'つまずき', '解説', '覚え方', '出典', 'ジャンル'];
const FIELD_SEP = '\x1f';

const QFMT = `<div class="genre">{{ジャンル}}</div>
<div class="q">{{問題}}</div>`;
const AFMT = `{{FrontSide}}
<hr id="answer">
<div class="a">{{答え}}</div>
{{#つまずき}}<div class="note miss"><b>前回のつまずき</b><br>{{つまずき}}</div>{{/つまずき}}
{{#解説}}<div class="note"><b>解説</b><br>{{解説}}</div>{{/解説}}
{{#覚え方}}<div class="note oboe"><b>覚え方</b><br>{{覚え方}}</div>{{/覚え方}}
<div class="src">{{出典}}</div>`;
const CSS = `.card { font-family: "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif; font-size: 18px; line-height: 1.6; text-align: left; max-width: 680px; margin: 0 auto; padding: 12px; }
.genre { font-size: 13px; opacity: .6; margin-bottom: 8px; }
.q { font-weight: bold; }
.a { margin-bottom: 14px; }
.note { font-size: 16px; border-left: 4px solid #888; padding: 4px 0 4px 10px; margin: 10px 0; }
.miss { border-left-color: #d9534f; }
.oboe { border-left-color: #2e9e6b; }
.src { font-size: 12px; opacity: .6; margin-top: 14px; }`;

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sha1 = s => crypto.createHash('sha1').update(s).digest('hex');
// カードの id から決まる数値 id（JS の整数で扱える 48 ビット）
const numId = (kind, id) => parseInt(sha1(`${kind}:${id}`).slice(0, 12), 16);

function buildCollection(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null,
      ver integer not null, dty integer not null, usn integer not null, ls integer not null,
      conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
    CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null,
      usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null,
      flags integer not null, data text not null);
    CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null,
      mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null,
      ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null,
      odue integer not null, odid integer not null, flags integer not null, data text not null);
    CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null,
      ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
    CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
    CREATE INDEX ix_notes_usn on notes (usn);
    CREATE INDEX ix_cards_usn on cards (usn);
    CREATE INDEX ix_revlog_usn on revlog (usn);
    CREATE INDEX ix_cards_nid on cards (nid);
    CREATE INDEX ix_cards_sched on cards (did, queue, due);
    CREATE INDEX ix_revlog_cid on revlog (cid);
    CREATE INDEX ix_notes_csum on notes (csum);
  `);

  const now = Math.floor(Date.now() / 1000);
  const deck = (id, name) => ({
    id, name, desc: '', mod: now, usn: -1, collapsed: false, browserCollapsed: false, dyn: 0, conf: 1,
    extendNew: 0, extendRev: 0, newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0],
  });
  const model = {
    id: MODEL_ID, name: 'ネスペ一問一答', type: 0, mod: now, usn: -1, sortf: 0, did: DECK_ID,
    tmpls: [{ name: 'カード', ord: 0, qfmt: QFMT, afmt: AFMT, did: null, bqfmt: '', bafmt: '' }],
    flds: FIELDS.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })),
    css: CSS, latexPre: '', latexPost: '', latexsvg: false, req: [[0, 'any', [0]]], tags: [], vers: [],
  };
  const dconf = {
    id: 1, name: 'Default', mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, dyn: false,
    new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 },
    rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
    lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
  };
  const conf = { nextPos: cards.length + 1, estTimes: true, activeDecks: [1], sortType: 'noteFld', timeLim: 0,
    sortBackwards: false, addToCur: true, curDeck: 1, newSpread: 0, dueCounts: true, curModel: MODEL_ID, collapseTime: 1200 };

  db.prepare('INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)').run(
    now, now * 1000, now * 1000, JSON.stringify(conf), JSON.stringify({ [MODEL_ID]: model }),
    JSON.stringify({ 1: deck(1, 'Default'), [DECK_ID]: deck(DECK_ID, DECK_NAME) }), JSON.stringify({ 1: dconf }), '{}');

  const insNote = db.prepare('INSERT INTO notes VALUES (?,?,?,?,-1,?,?,?,?,0,\'\')');
  const insCard = db.prepare('INSERT INTO cards VALUES (?,?,?,0,?,-1,0,0,?,0,0,0,0,0,0,0,0,\'\')');
  cards.forEach((c, i) => {
    const nid = numId('note', c.id);
    const q = esc(c.q);
    const flds = [q, esc(c.a), esc(c.miss), esc(c.kaisetsu), esc(c.oboe), esc(c.src), esc(c.theme)].join(FIELD_SEP);
    const tags = ` ジャンル::${c.theme.replace(/\s+/g, '_')} `;
    insNote.run(nid, `nespe:${c.id}`, MODEL_ID, now, tags, flds, q, parseInt(sha1(q).slice(0, 8), 16));
    insCard.run(numId('card', c.id), nid, DECK_ID, now, i + 1);
  });
  db.close();
}

// .apkg の中身は ZIP。外部パッケージを使わないよう最小限を自前で組み立てる
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const body = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const nameBuf = Buffer.from(name);
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0);            // 展開に必要なバージョン
    common.writeUInt16LE(8, 4);             // deflate
    common.writeUInt16LE(0x21, 8);          // DOS 日付（1980-01-01）
    common.writeUInt32LE(crc, 10);
    common.writeUInt32LE(body.length, 14);
    common.writeUInt32LE(data.length, 18);
    common.writeUInt16LE(nameBuf.length, 22);
    const sig = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
    const local = Buffer.concat([sig(0x04034b50), common, nameBuf, body]);
    const tail = Buffer.alloc(14);          // コメント長・ディスク番号・属性は 0
    tail.writeUInt32LE(offset, 10);
    const version = Buffer.alloc(2);
    version.writeUInt16LE(20);
    centrals.push(Buffer.concat([sig(0x02014b50), version, common, tail, nameBuf]));
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

// exFAT の SSD 上だと SQLite のロックが不安定なので、作業は OS の一時フォルダで行う
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anki-export-'));
try {
  const dbFile = path.join(dir, 'collection.anki2');
  buildCollection(dbFile);
  fs.writeFileSync(out, zip([['collection.anki2', fs.readFileSync(dbFile)], ['media', Buffer.from('{}')]]));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
const themes = new Set(cards.map(c => c.theme));
console.log(`${cards.length} 枚（${themes.size} ジャンル）を書き出しました: ${path.relative(ROOT, out)}`);
