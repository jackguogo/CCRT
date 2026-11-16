// 按新版分条格式重算已生成报告的结论（服务端 buildConclusion 改版后的数据回填）
const path = require("path");
const Database = require("better-sqlite3");

const ORDER = ["复合性注意", "执行能力", "学习与记忆", "语言", "视结构-知觉能力", "社会认知"];

function buildConclusion(radar) {
  const keys = ORDER.filter((k) => radar[k] != null)
    .concat(Object.keys(radar).filter((k) => !ORDER.includes(k)));
  const weak = keys.filter((k) => radar[k] < 55);
  const mid = keys.filter((k) => radar[k] >= 55 && radar[k] < 75);
  const lines = ["各项评估已完成。"];
  if (!weak.length && !mid.length) lines.push("各认知域结果处于参考范围内。");
  weak.forEach((k) => lines.push(`【${k}】结果低于参考范围；`));
  mid.forEach((k) => lines.push(`【${k}】处于临界水平，建议关注；`));
  lines.push("本报告仅供医疗专业人员参考，不能单独作为诊断依据。建议由医师结合临床进行解读。");
  return lines.join("\n");
}

const db = new Database(path.join(__dirname, "..", "data", "hscrt01.db"));
const rows = db.prepare("SELECT id, report_no, radar, conclusion FROM report").all();
const upd = db.prepare("UPDATE report SET conclusion=? WHERE id=?");
let changed = 0, skipped = 0;
const sample = [];

db.transaction(() => {
  for (const r of rows) {
    let radar = null;
    try { radar = JSON.parse(r.radar); } catch (e) { }
    if (!radar) { skipped++; continue; }
    const next = buildConclusion(radar);
    if (next === r.conclusion) continue;
    if (sample.length < 2) sample.push({ no: r.report_no, text: next });
    upd.run(next, r.id);
    changed++;
  }
})();

console.log(JSON.stringify({ total: rows.length, changed, skipped, sample }, null, 1));
db.close();
