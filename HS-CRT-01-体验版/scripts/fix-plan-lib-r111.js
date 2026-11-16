// fix-plan-lib-r111.js —— 清理自定义示例方案里已「待开放」的项目，并让方案名/说明与剩余项目一致
// 背景：AVLT / FLU 等 6 项暂不开放（见 server/seed-data.js 的 PENDING_CODES），
//      示例方案若还挂着这些项目，点开就会跑到没有引擎的条目上。
//   1) 记忆与执行专项 → 执行功能专项：TMT + STROOP + TOL（记忆类范式全在待开放，方案名不再提「记忆」）
//   2) 语言专项评估 → 只留 BNT，补齐方案说明
// 执行前自动备份数据库。
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dir = path.join(__dirname, "..", "data");
const file = path.join(dir, "hscrt01.db");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const bak = path.join(dir, "backups", `hscrt01.before-plan-fix-${stamp}.db`);
fs.mkdirSync(path.dirname(bak), { recursive: true });
fs.copyFileSync(file, bak);
console.log("备份 → " + bak);

const db = new Database(file);
const S = (code) => ({ type: "scale", code });
const P = (code) => ({ type: "paradigm", code });
const upd = db.prepare(`UPDATE plan_lib SET name=?,desc=?,items=?,minutes=?,updated_at=datetime('now','localtime')
  WHERE kind='assess' AND category='custom' AND name=?`);

const n1 = upd.run("执行功能专项", "自定义示例：连线 + 色词干扰 + 伦敦塔，聚焦执行功能",
  JSON.stringify([P("TMT"), P("STROOP"), P("TOL")]), 30, "记忆与执行专项").changes;
const n2 = upd.run("语言专项评估", "自定义示例：波士顿命名（30 幅图），聚焦语言与命名功能",
  JSON.stringify([P("BNT")]), 10, "语言专项评估").changes;
console.log(`记忆与执行专项 → 执行功能专项：${n1} 行；语言专项评估说明补齐：${n2} 行`);

for (const r of db.prepare("SELECT id,name,items,minutes FROM plan_lib WHERE kind='assess'").all())
  console.log(`  #${r.id}  ${r.name}  ${r.minutes} 分钟  ${JSON.parse(r.items).map(i => i.code).join(", ")}`);
db.close();
