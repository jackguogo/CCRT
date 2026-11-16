// fix-custom-plan-name.js —— 把历史「自定义评估方案」记录回填为具体方案名
// 规则：plan_id=0 且 plan_name 为泛称的记录，按 assess_detail 的实际项目生成名称，
//      与医生端发起评估时的自动命名保持一致（1 项：自定义 · X；2 项：自定义 · X + Y；3+：自定义 · X + Y 等 N 项）
const path = require("path");
const Database = require("better-sqlite3");
const { SCALES, PARADIGMS } = require("../server/seed-data");

const db = new Database(path.join(__dirname, "..", "data", "hscrt01.db"));
const nameOf = (kind, code) => {
  const src = kind === "scale" ? SCALES : PARADIGMS;
  const s = src.find(x => x.code === code);
  return s ? s.name.replace(/（.*?）/g, "") : code;
};
const buildName = (items) => {
  const names = items.map(it => nameOf(it.kind, it.code));
  if (!names.length) return null;
  if (names.length === 1) return "自定义 · " + names[0];
  if (names.length === 2) return "自定义 · " + names[0] + " + " + names[1];
  return "自定义 · " + names[0] + " + " + names[1] + " 等 " + names.length + " 项";
};

const rows = db.prepare("SELECT id, plan_name FROM assess_record WHERE plan_id=0 AND plan_name IN ('自定义评估方案','评估方案','')").all();
let filled = 0;
for (const r of rows) {
  const items = db.prepare("SELECT code, kind FROM assess_detail WHERE record_id=? ORDER BY id").all(r.id);
  const name = buildName(items);
  if (!name) { console.log("skip #" + r.id + "（无明细）"); continue; }
  db.prepare("UPDATE assess_record SET plan_name=? WHERE id=?").run(name, r.id);
  console.log(`#${r.id}  ${r.plan_name}  →  ${name}`);
  filled++;
}
console.log("total " + rows.length + " / filled " + filled);
