// 修复已生成演示记录的口述文本：按 scripts/demo-speech.js 的统一映射重写 answer.speech
// 仅作用于演示记录（record_id >= 30），不动真实施测数据
const path = require("path");
const Database = require("better-sqlite3");
const { SCALES, PARADIGMS } = require(path.join(__dirname, "..", "server", "seed-data.js"));
const { speechOf } = require("./demo-speech");

const MIN_RECORD = 30;
const db = new Database(path.join(__dirname, "..", "data", "hscrt01.db"));

const itemOf = (code, itemId) => {
  const b = [...SCALES, ...PARADIGMS].find((x) => x.code === code);
  return b ? (b.items || []).find((x) => x.id === itemId) : null;
};

const rows = db.prepare(
  "SELECT id, record_id, code, item_id, value FROM assess_answer WHERE record_id >= ? ORDER BY record_id, code, item_id"
).all(MIN_RECORD);

const upd = db.prepare("UPDATE assess_answer SET value = ? WHERE id = ?");
let changed = 0, skipped = 0, missing = 0;
const samples = [];

const tx = db.transaction(() => {
  for (const r of rows) {
    let v;
    try { v = JSON.parse(r.value); } catch (e) { skipped++; continue; }
    if (!v || !v.spoken) { skipped++; continue; }        // 非口述作答，跳过
    const it = itemOf(r.code, r.item_id);
    if (!it) { missing++; continue; }
    const next = speechOf(r.code, r.item_id, it);
    if (v.speech === next) continue;
    if (samples.length < 8) samples.push({ rec: r.record_id, key: r.code + ":" + r.item_id, from: v.speech || "", to: next });
    v.speech = next;
    upd.run(JSON.stringify(v), r.id);
    changed++;
  }
});
tx();

console.log(JSON.stringify({ scanned: rows.length, changed, skipped, missing, samples }, null, 1));
db.close();
