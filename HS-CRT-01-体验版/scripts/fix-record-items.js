/**
 * 修正评估记录里「项目」与「所选方案」不一致的历史数据。
 *
 * 判定规则（两条，互不重叠）：
 *  1) plan_id > 0 且方案库中该方案仍存在 → 项目一律同步为方案的当前项目（方案为准）。
 *  2) plan_id = 0（临时自定义）且记录名恰好等于「已完成项目」拼出来的名字
 *     → 说明当初只选了这些项目，项目收敛为已完成项目。
 *     名字对不上的（例如医生手动命名、或确实选了 18 项但只做了 1 项）只报告、不修改。
 *
 * 用法：
 *   node scripts/fix-record-items.js          # 只报告
 *   node scripts/fix-record-items.js --fix    # 执行修改
 */
const path = require("path");
const Database = require("better-sqlite3");
const { SCALES, PARADIGMS } = require("../server/seed-data");

const db = new Database(path.join(__dirname, "..", "data", "hscrt01.db"));
const FIX = process.argv.includes("--fix");

const nameOf = (code) => {
  const s = SCALES.find(x => x.code === code) || PARADIGMS.find(x => x.code === code);
  return s ? s.name.replace(/（.*?）/g, "") : code;
};
const autoName = (codes) => {
  const names = codes.map(nameOf);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + " + " + names[1];
  return names[0] + " + " + names[1] + " 等 " + names.length + " 项";
};
const norm = (raw) => {
  const seen = new Set(), out = [];
  for (const it of raw) {
    if (!it || !it.code || seen.has(it.code)) continue;
    seen.add(it.code);
    out.push({ type: it.type, code: it.code });
  }
  return out;
};

const recs = db.prepare(`SELECT r.id,r.plan_name,r.plan_id,r.items,r.status,p.name
  FROM assess_record r JOIN patient p ON p.id=r.patient_id ORDER BY r.id`).all();

let fixed = 0, reported = 0;
for (const r of recs) {
  const items = norm(JSON.parse(r.items || "[]"));
  const details = db.prepare("SELECT code FROM assess_detail WHERE record_id=? ORDER BY id").all(r.id).map(x => x.code);
  const detSet = new Set(details);
  let target = null, why = "";

  if (r.plan_id > 0) {
    const pl = db.prepare("SELECT id,name,items FROM plan_lib WHERE id=?").get(r.plan_id);
    if (pl) {
      const pi = norm(JSON.parse(pl.items || "[]"));
      const same = pi.length === items.length && pi.every((x, i) => x.code === items[i].code);
      if (!same) { target = pi; why = `同步为方案「${pl.name}」的项目`; }
    }
  } else if (details.length && items.length > details.length) {
    const gen = autoName(details);
    if (r.plan_name === gen || r.plan_name === gen.replace(/ 等 \d+ 项$/, "")) {
      target = details.map(code => {
        const hit = items.find(x => x.code === code);
        return { type: hit ? hit.type : (SCALES.find(s => s.code === code) ? "scale" : "paradigm"), code };
      });
      why = `方案名由已完成项目拼出（${gen}），收敛为已完成项目`;
    }
  }

  if (!target) continue;
  if (!target.length) { console.log(`跳过 #${r.id} ${r.name}：目标项目为空`); continue; }

  reported++;
  console.log(`#${r.id} ${r.name} | ${r.plan_name} | 项目 ${items.length} → ${target.length} | ${why}`);
  console.log(`   ${items.map(x => x.code).join(",")}  →  ${target.map(x => x.code).join(",")}`);

  if (FIX) {
    db.prepare("UPDATE assess_record SET items=? WHERE id=?").run(JSON.stringify(target), r.id);
    // 全部项目已完成却仍是「进行中」的，补正状态
    if (r.status === "进行中" && detSet.size >= target.length) {
      db.prepare("UPDATE assess_record SET status='审核中' WHERE id=?").run(r.id);
      console.log(`   状态 进行中 → 审核中（项目已全部完成）`);
    }
    fixed++;
  }
}

console.log(`\ntotal ${recs.length} / reported ${reported} / ${FIX ? "fixed " + fixed : "未修改（加 --fix 执行）"}`);
