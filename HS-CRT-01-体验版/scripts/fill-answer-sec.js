// 为演示库中缺少作答耗时（sec）的历史记录补充合理耗时，使报告能完整呈现时间类指标。
// 只补 sec 字段，不改动任何作答内容与评分。
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA = path.join(__dirname, "..", "data");
const db = new Database(path.join(DATA, "hscrt01.db"));

// 各范式单题基准耗时（秒）；连线 B 段按 A 段的 1.6 倍
const BASE = {
  SPAN: 9, CPT: 20, SDMT: 8, TMT: 105, STROOP: 4, TOL: 28,
  AVLT: 48, REC: 4, BNT: 6, FLU: 60, CDT: 95, COPY: 85,
};
const h = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0);

const rows = db.prepare("SELECT id, code, item_id, value FROM assess_answer").all();
const upd = db.prepare("UPDATE assess_answer SET value=? WHERE id=?");
let filled = 0, skipped = 0;

db.transaction(() => {
  for (const r of rows) {
    let v;
    try { v = JSON.parse(r.value || "{}"); } catch (e) { skipped++; continue; }
    if (!v || typeof v !== "object" || Array.isArray(v)) { skipped++; continue; }
    if (Number(v.sec) > 0) continue;
    const base = BASE[r.code];
    if (!base) { skipped++; continue; }
    let sec = base + (h(r.code + r.item_id) % 9) - 4;
    if (r.code === "TMT" && r.item_id === "T2") sec = Math.round(sec * 1.6);
    v.sec = Math.max(2, sec);
    upd.run(JSON.stringify(v), r.id);
    filled++;
  }
})();

console.log(JSON.stringify({ total: rows.length, filled, skipped }));
db.close();
