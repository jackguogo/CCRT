/**
 * 状态数据二次修正（一次性）
 * 1. 方案#2/#6 起算日早于该患者首次完成评估 → 后移到评估次日
 * 2. 方案#22 恢复为「今天刚生成」（陈美玲），删除上一轮人为回拨时生成的记录
 * 3. 方案#25 起算日改为评估次日（10-30），重新生成记录
 * 4. 给赵慧珍（p6，原方案已终止）新建一个进行中方案，起算 10-16，补齐训练记录
 */
const Database = require("better-sqlite3");
const { TRAININGS } = require("../server/seed-data");
const db = new Database("data/hscrt01.db");

const prog = (c) => TRAININGS.find((t) => t.code === c);
const pad = (n) => String(n).padStart(2, "0");
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d) => `${day(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const TODAY = new Date(); TODAY.setHours(23, 59, 59, 0);

/* ---------- 1. 方案 2 / 6 起算日后移 ---------- */
const shift = { 2: "2026-09-02 19:30:00", 6: "2026-07-24 19:30:00" };
for (const [id, at] of Object.entries(shift)) {
  const p = db.prepare("SELECT * FROM train_plan WHERE id=?").get(Number(id));
  if (!p) continue;
  const fin = stamp(addDays(new Date(at.slice(0, 10) + "T18:00:00"), 1));
  db.prepare("UPDATE train_plan SET created_at=?, pushed_at=?, finished_at=? WHERE id=?").run(at, at, fin, p.id);
  console.log(`① 方案#${id} 起算 ${p.created_at} → ${at}，终止时间 ${fin}`);
}

/* ---------- 2. 方案 22 恢复今天生成 ---------- */
const p22 = db.prepare("SELECT * FROM train_plan WHERE id=22").get();
if (p22) {
  const del = db.prepare("DELETE FROM train_record WHERE plan_id=22").run().changes;
  const at = "2026-11-04 11:38:07";
  db.prepare("UPDATE train_plan SET created_at=?, pushed_at=? WHERE id=?").run(at, at, p22.id);
  console.log(`② 方案#22（陈美玲）恢复为今天生成 ${at}，删除人为生成的 ${del} 条记录 → 保留「刚生成未训练」状态`);
}

/* ---------- 3. 方案 25 起算 10-30 重新生成 ---------- */
function seedSessions(plan, startStr) {
  const items = JSON.parse(plan.items);
  const start = new Date(startStr + "T09:00:00");
  const weeks = plan.weeks || 12;
  const freq = Math.max(1, Math.min(7, plan.freq || 3));
  const perItem = Math.round(((plan.minutes || 30) * 60) / Math.max(1, items.length));
  const lv = {}; items.forEach((i) => (lv[i.program] = i.startLevel || 1));
  const prev = {}, fail = {};
  const ins = db.prepare(`INSERT INTO train_record(plan_id,patient_id,program,level,duration_s,acc,avg_rt,hint_cnt,result,adjust,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  let sessions = 0, records = 0;
  for (let w = 0; w < weeks; w++) {
    const offsets = freq >= 3 ? [1, 3, 5] : freq === 2 ? [1, 4] : [2];
    for (const off of offsets.slice(0, freq)) {
      const d = addDays(start, w * 7 + off);
      if (d > TODAY) continue;
      const at = stamp(new Date(d.getTime() + (8 + (sessions % 3)) * 3600000));
      sessions++;
      for (const it of items) {
        const meta = prog(it.program);
        if (!meta) continue;
        const base = 0.70 + Math.min(0.22, w * 0.02);
        const acc = Math.max(0.55, Math.min(0.99, base + ((records * 37) % 17) / 100 - 0.08));
        const pass = acc >= 0.80, excellent = acc >= 0.95;
        const result = pass ? (excellent ? "优秀" : "通过") : "未通过";
        const level = Math.max(1, Math.min(meta.levels.length, lv[it.program]));
        let adjust = "无";
        if (plan.locked) adjust = "医生锁定";
        else if (excellent && prev[it.program] === "优秀") adjust = "跳升1关";
        else if (pass) adjust = "升1关";
        else {
          fail[it.program] = (fail[it.program] || 0) + 1;
          if (fail[it.program] >= 3) adjust = level > 1 ? "降1关" : "保底第1关";
        }
        if (pass) fail[it.program] = 0;
        prev[it.program] = result;
        ins.run(plan.id, plan.patient_id, it.program, level, perItem + ((records * 13) % 60) - 30,
          Number(acc.toFixed(3)), 1200 + ((records * 97) % 1400), records % 5 === 0 ? 1 : 0, result, adjust, at);
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

const p25 = db.prepare("SELECT * FROM train_plan WHERE id=25").get();
if (p25) {
  const del = db.prepare("DELETE FROM train_record WHERE plan_id=25").run().changes;
  const at = "2026-10-30 09:00:00";
  db.prepare("UPDATE train_plan SET created_at=?, pushed_at=? WHERE id=?").run(at, at, p25.id);
  p25.created_at = at; p25.pushed_at = at;
  const r = seedSessions(p25, "2026-10-30");
  console.log(`③ 方案#25（刘志远）起算 ${at}，重建 ${r.sessions} 次 / ${r.records} 条（原 ${del} 条已删）`);
}

/* ---------- 4. 赵慧珍：新增进行中方案 ---------- */
const hasActive = db.prepare("SELECT 1 FROM train_plan WHERE patient_id=6 AND status='进行中'").get();
if (!hasActive) {
  const items = [
    { program: "EX-01", name: "色词辨析", domain: "执行能力", startLevel: 1 },
    { program: "LM-01", name: "数字传真", domain: "学习与记忆", startLevel: 1 },
    { program: "CA-01", name: "持续性注意", domain: "复合性注意", startLevel: 1 },
  ];
  const at = "2026-10-16 09:00:00";
  const r = db.prepare(`INSERT INTO train_plan(patient_id,doctor_id,items,items_count,minutes,freq,weeks,locked,status,pushed_at,created_at)
    VALUES(?,?,?,?,?,?,?,0,'进行中',?,?)`).run(6, 2, JSON.stringify(items), items.length, 30, 3, 12, at, at);
  const plan = db.prepare("SELECT * FROM train_plan WHERE id=?").get(r.lastInsertRowid);
  const s = seedSessions(plan, "2026-10-16");
  console.log(`④ 新增方案#${plan.id}（赵慧珍 p6）起算 ${at}，生成 ${s.sessions} 次 / ${s.records} 条`);
} else console.log("④ 赵慧珍已有进行中方案，跳过");

/* ---------- 汇总 ---------- */
console.log("\n方案状态分布:", Object.fromEntries(db.prepare("SELECT status,COUNT(*) c FROM train_plan GROUP BY status").all().map((r) => [r.status, r.c])));
console.log("训练记录总数:", db.prepare("SELECT COUNT(*) c FROM train_record").get().c);
db.close();
