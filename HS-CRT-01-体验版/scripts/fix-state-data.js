/**
 * 状态机数据修复 + 补齐（一次性）
 * 运行：/Users/lionz/.nvm/versions/node/v20.19.6/bin/node scripts/fix-state-data.js
 *
 * 1. pushed_at 全量补齐（起算日）
 * 2. 已完成方案的 finished_at 改为疗程最后一天 23:59:59（原来被批量写成同一秒）
 * 3. 已终止方案补 finished_at（取最后一条训练记录时间，没有则 created_at 次日）
 * 4. 方案 9 的清单补到 3 项（历史测试残留，违反 TRAIN_ITEMS_MIN）
 * 5. 两个当天生成的进行中方案回拨起算日，并补训练记录，让「训练中」患者有依从性/趋势数据
 */
const Database = require("better-sqlite3");
const { TRAININGS } = require("../server/seed-data");
const db = new Database("data/hscrt01.db");

const prog = (code) => TRAININGS.find((t) => t.code === code);
const pad = (n) => String(n).padStart(2, "0");
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d) => `${day(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

/* ---------- 1. pushed_at ---------- */
const n1 = db.prepare("UPDATE train_plan SET pushed_at=created_at WHERE pushed_at IS NULL").run().changes;
console.log(`① 补齐起算日 pushed_at：${n1} 个方案`);

/* ---------- 2. 已完成 finished_at = 疗程最后一天 ---------- */
let n2 = 0;
for (const p of db.prepare("SELECT id,weeks,created_at,pushed_at,finished_at FROM train_plan WHERE status='已完成'").all()) {
  const start = new Date(String(p.pushed_at || p.created_at).slice(0, 10) + "T00:00:00");
  const end = addDays(start, (p.weeks || 12) * 7);
  const last = day(addDays(end, -1)) + " 23:59:59";
  if (p.finished_at !== last) {
    db.prepare("UPDATE train_plan SET finished_at=? WHERE id=?").run(last, p.id);
    console.log(`   方案#${p.id} 完成时间 ${p.finished_at || "（空）"} → ${last}`);
    n2++;
  }
}
console.log(`② 修正已完成方案的完成时间：${n2} 个`);

/* ---------- 3. 已终止 finished_at ---------- */
let n3 = 0;
for (const p of db.prepare("SELECT id,created_at FROM train_plan WHERE status='已终止' AND finished_at IS NULL").all()) {
  const last = db.prepare("SELECT MAX(created_at) t FROM train_record WHERE plan_id=?").get(p.id).t;
  const at = last || stamp(addDays(new Date(String(p.created_at).slice(0, 10) + "T18:00:00"), 1));
  db.prepare("UPDATE train_plan SET finished_at=? WHERE id=?").run(at, p.id);
  console.log(`   方案#${p.id} 终止时间补为 ${at}（${last ? "最后训练时间" : "创建次日"}）`);
  n3++;
}
console.log(`③ 补齐已终止方案的结束时间：${n3} 个`);

/* ---------- 4. 方案 9 清单补到 3 项 ---------- */
const p9 = db.prepare("SELECT * FROM train_plan WHERE id=9").get();
if (p9) {
  const items = JSON.parse(p9.items);
  if (items.length < 3) {
    const fill = [
      { program: "LM-01", name: "数字传真", domain: "学习与记忆", startLevel: 1 },
      { program: "EX-01", name: "色词辨析", domain: "执行能力", startLevel: 1 },
    ];
    for (const f of fill) {
      if (items.length >= 3) break;
      if (!items.some((i) => i.program === f.program)) items.push(f);
    }
    db.prepare("UPDATE train_plan SET items=?, items_count=? WHERE id=?").run(JSON.stringify(items), items.length, p9.id);
    console.log(`④ 方案#9 清单 ${JSON.parse(p9.items).length} → ${items.length} 项`);
  } else console.log("④ 方案#9 清单已合规，跳过");
}

/* ---------- 5. 回拨两个进行中方案 + 生成训练记录 ---------- */
const PLAN_START = { 22: "2026-10-14", 25: "2026-09-30" };
const TODAY = new Date(); TODAY.setHours(23, 59, 59, 0);

function seedPlanSessions(plan) {
  const items = JSON.parse(plan.items);
  const start = new Date(PLAN_START[plan.id] + "T09:00:00");
  const weeks = plan.weeks || 12;
  const freq = Math.max(1, Math.min(7, plan.freq || 3));
  const perItem = Math.round(((plan.minutes || 30) * 60) / Math.max(1, items.length));
  const lv = {}; items.forEach((i) => (lv[i.program] = i.startLevel || 1));
  const prevResult = {}, failStreak = {};
  const ins = db.prepare(`INSERT INTO train_record(plan_id,patient_id,program,level,duration_s,acc,avg_rt,hint_cnt,result,adjust,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  let sessions = 0, records = 0;

  for (let w = 0; w < weeks; w++) {
    const offsets = freq >= 3 ? [1, 3, 5] : freq === 2 ? [1, 4] : [2];
    for (const off of offsets.slice(0, freq)) {
      const d = addDays(start, w * 7 + off);
      if (d > TODAY) continue;
      if (d < start) continue;
      const at = stamp(new Date(d.getTime() + (8 + (sessions % 3)) * 3600000));
      sessions++;
      for (const it of items) {
        const meta = prog(it.program);
        if (!meta) continue;
        // 熟练度随疗程缓慢上升，掺入波动
        const base = 0.70 + Math.min(0.22, w * 0.02);
        const acc = Math.max(0.55, Math.min(0.99, base + ((records * 37) % 17) / 100 - 0.08));
        const pass = acc >= 0.80;
        const excellent = acc >= 0.95;
        const result = pass ? (excellent ? "优秀" : "通过") : "未通过";
        const level = Math.max(1, Math.min(meta.levels.length, lv[it.program]));
        let adjust = "无";
        if (plan.locked) adjust = "医生锁定";
        else if (excellent && prevResult[it.program] === "优秀") adjust = "跳升1关";
        else if (pass) adjust = "升1关";
        else {
          failStreak[it.program] = (failStreak[it.program] || 0) + 1;
          if (failStreak[it.program] >= 3) adjust = level > 1 ? "降1关" : "保底第1关";
        }
        if (pass) failStreak[it.program] = 0;
        prevResult[it.program] = result;
        ins.run(plan.id, plan.patient_id, it.program, level,
          perItem + ((records * 13) % 60) - 30,
          Number(acc.toFixed(3)), 1200 + ((records * 97) % 1400), records % 5 === 0 ? 1 : 0,
          result, adjust, at);
        records++;
        if (!plan.locked) {
          if (adjust === "跳升1关") lv[it.program] += 2;
          else if (adjust === "升1关") lv[it.program] += 1;
          else if (adjust === "降1关") lv[it.program] -= 1;
          lv[it.program] = Math.max(1, Math.min(meta.levels.length, lv[it.program]));
        }
      }
    }
  }
  return { sessions, records };
}

let n5 = 0;
for (const id of Object.keys(PLAN_START)) {
  const plan = db.prepare("SELECT * FROM train_plan WHERE id=?").get(Number(id));
  if (!plan || plan.status !== "进行中") { console.log(`   方案#${id} 非进行中，跳过`); continue; }
  const had = db.prepare("SELECT COUNT(*) c FROM train_record WHERE plan_id=?").get(plan.id).c;
  if (had) { console.log(`   方案#${id} 已有 ${had} 条记录，跳过`); continue; }
  const st = PLAN_START[id] + " 09:00:00";
  db.prepare("UPDATE train_plan SET created_at=?, pushed_at=? WHERE id=?").run(st, st, plan.id);
  plan.created_at = st; plan.pushed_at = st;
  const r = seedPlanSessions(plan);
  console.log(`⑤ 方案#${id}（患者#${plan.patient_id}）起算日 ${PLAN_START[id]}，生成 ${r.sessions} 次训练 / ${r.records} 条记录`);
  n5 += r.records;
}

/* ---------- 汇总 ---------- */
const st = {};
db.prepare("SELECT status,COUNT(*) c FROM train_plan GROUP BY status").all().forEach((r) => (st[r.status] = r.c));
console.log("\n方案状态分布:", st);
console.log("训练记录总数:", db.prepare("SELECT COUNT(*) c FROM train_record").get().c, `（本次新增 ${n5}）`);
db.close();
