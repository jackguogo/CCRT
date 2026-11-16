/**
 * 状态数据三次修正（一次性）——目标：状态机三态齐全 + 时间线自洽
 *
 * 背景：从 data/backups/hscrt01-before-fix2-160538.db 恢复后的基线（9 方案 / 288 记录 / 30 评估）
 * 存在以下问题，本脚本一次性修正：
 *
 *  S1 评估：患者#8 有 4 条进行中（历史重复发起），保留 #20，其余作废 → 补齐「已作废」样本
 *  S2 训练方案：起算日/结束时间重排，保证
 *     ① 起算日 ≥ 该患者首次完成评估日
 *     ② 起算时刻 ≤ 该方案首条训练记录时刻（记录不能早于方案生成）
 *     ③ 同患者方案时间不重叠
 *     ④ 进行中方案疗程未到期；已完成方案 finished_at = 疗程末日 23:59:59
 *  S3 项数补齐：所有方案 ≥ TRAIN_ITEMS_MIN(3) 项；方案#9 的非法项目码 MEM-01 替换
 *  S4 新增一个「刚生成未训练」的进行中方案（刘志远 p22）
 */
const Database = require("better-sqlite3");
const { TRAININGS } = require("../server/seed-data");
const db = new Database("data/hscrt01.db");

const prog = (c) => TRAININGS.find((t) => t.code === c);
const pad = (n) => String(n).padStart(2, "0");
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d) => `${day(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const at = (s) => new Date(s.replace(" ", "T"));
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);

/* ================= S1. 评估：清理患者#8 的多条进行中 ================= */
console.log("=== S1 评估状态补齐 ===");
{
  const keep = 20; // 标准筛查方案，最后一次发起
  const rows = db.prepare("SELECT id,started_at FROM assess_record WHERE patient_id=8 AND status='进行中' AND id<>? ORDER BY id").all(keep);
  const upd = db.prepare("UPDATE assess_record SET status='已作废', finished_at=?, cancel_reason=? WHERE id=?");
  for (const r of rows) {
    // 作废时刻记为该次发起后约 6 分钟（施测中途发现重复/患者离开）
    const fin = stamp(new Date(at(r.started_at).getTime() + 6 * 60000));
    upd.run(fin, "重复发起评估", r.id);
    console.log(`  评估#${r.id} 进行中 → 已作废（重复发起评估，${fin}）`);
  }
  console.log(`  保留评估#${keep} 作为该患者的进行中样本`);
}

/* ================= S2. 训练方案时间线重排 ================= */
console.log("\n=== S2 训练方案时间线 ===");

// 每个方案的起算时刻与结束时间
// start：起算时刻（= created_at = pushed_at）；end：finished_at；status：目标状态；weeks：可选调整
const PLAN_FIX = {
  1: { start: "2026-09-03 09:30:00", status: "已完成" }, // 陈建国 8w → 10-29 到期
  2: { start: "2026-09-02 09:00:00", status: "已终止", end: "2026-09-02 17:30:00" },
  3: { start: "2026-09-17 19:30:00", status: "进行中" },
  4: { start: "2026-09-14 15:30:00", status: "进行中", weeks: 10 },
  5: { start: "2026-07-25 15:30:00", status: "已完成" }, // 李文秀 12w → 10-17 到期
  6: { start: "2026-07-24 09:00:00", status: "已终止", end: "2026-07-24 16:40:00" },
  7: { start: "2026-10-07 10:00:00", status: "进行中", weeks: 6 },
  8: { start: "2026-09-24 08:50:00", status: "已终止", end: "2026-10-16 09:00:00" },
  9: { start: "2026-10-30 17:25:29", status: "已终止", end: "2026-11-02 10:20:00" },
};

for (const [id, f] of Object.entries(PLAN_FIX)) {
  const p = db.prepare("SELECT * FROM train_plan WHERE id=?").get(Number(id));
  if (!p) { console.log(`  方案#${id} 不存在，跳过`); continue; }
  const weeks = f.weeks || p.weeks || 12;
  // 疗程到期日 = 起算日 + weeks×7；最后一天 = 到期日 - 1 天
  const endDate = addDays(at(f.start.slice(0, 10) + " 00:00:00"), weeks * 7);
  let end = f.end || null;
  if (!end) {
    if (f.status === "已完成") end = day(addDays(endDate, -1)) + " 23:59:59";
    else if (f.status === "已终止") end = f.start;
  }
  db.prepare("UPDATE train_plan SET status=?, weeks=?, created_at=?, pushed_at=?, finished_at=? WHERE id=?")
    .run(f.status, weeks, f.start, f.start, end, p.id);
  const due = day(addDays(endDate, -1));
  console.log(`  方案#${p.id}（p${p.patient_id}）→ ${f.status}，起算 ${f.start}，${weeks}w，到期日 ${due}，finished_at=${end || "—"}`);
}

/* ================= S3. 项数补齐 ================= */
console.log("\n=== S3 训练项补齐（≥3 项）===");

// 方案#9 的非法项目码整体替换；其余方案追加 1 项
const ADD_ITEM = {
  2: { program: "CA-01", startLevel: 1 },
  3: { program: "EX-01", startLevel: 2 },
  4: { program: "CA-02", startLevel: 2 },
  6: { program: "CA-01", startLevel: 1 },
  7: { program: "LM-02", startLevel: 2 },
  8: { program: "EX-01", startLevel: 1 },
};
const REPLACE_ITEMS = {
  9: [
    { program: "LM-03", startLevel: 1 },
    { program: "EX-02", startLevel: 1 },
    { program: "CA-03", startLevel: 1 },
  ],
};

const insRec = db.prepare(`INSERT INTO train_record(plan_id,patient_id,program,level,duration_s,acc,avg_rt,hint_cnt,result,adjust,created_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)`);

for (const [id, add] of Object.entries(ADD_ITEM)) {
  const p = db.prepare("SELECT * FROM train_plan WHERE id=?").get(Number(id));
  if (!p) continue;
  const items = JSON.parse(p.items || "[]");
  if (items.some((i) => i.program === add.program)) { console.log(`  方案#${id} 已含 ${add.program}，跳过`); continue; }
  const meta = prog(add.program);
  if (!meta) { console.log(`  方案#${id} 项目码 ${add.program} 非法，跳过`); continue; }
  items.push({ program: add.program, name: meta.name, startLevel: add.startLevel });
  db.prepare("UPDATE train_plan SET items=?, items_count=? WHERE id=?").run(JSON.stringify(items), items.length, p.id);

  // 为新增项目按已有训练场次回填记录，保证「每场训练项目数 = 方案项数」
  const sessions = db.prepare("SELECT DISTINCT created_at FROM train_record WHERE plan_id=? ORDER BY created_at").all(p.id);
  const perItem = Math.round(((p.minutes || 30) * 60) / items.length);
  let n = 0;
  sessions.forEach((s, si) => {
    const peers = db.prepare("SELECT level,acc,avg_rt,hint_cnt FROM train_record WHERE plan_id=? AND created_at=?").all(p.id, s.created_at);
    if (!peers.length) return;
    const lvRaw = Math.round(peers.reduce((a, b) => a + b.level, 0) / peers.length);
    const level = Math.max(1, Math.min(meta.levels.length, lvRaw));
    const meanAcc = peers.reduce((a, b) => a + b.acc, 0) / peers.length;
    const acc = Math.max(0.55, Math.min(0.99, Number((meanAcc - 0.02 + ((si * 7) % 9) / 100).toFixed(3))));
    const result = acc >= 0.95 ? "优秀" : acc >= 0.80 ? "通过" : "未通过";
    const adjust = p.locked ? "医生锁定" : result === "未通过" ? "无" : "升1关";
    const rt = Math.round(peers.reduce((a, b) => a + b.avg_rt, 0) / peers.length);
    const hint = si % 4 === 0 ? 1 : 0;
    insRec.run(p.id, p.patient_id, add.program, level, perItem + ((si * 11) % 50) - 25, acc, rt, hint, result, adjust, s.created_at);
    n++;
  });
  console.log(`  方案#${id} 追加 ${add.program}（${meta.name}）→ ${items.length} 项，回填 ${n} 条记录`);
}

for (const [id, list] of Object.entries(REPLACE_ITEMS)) {
  const p = db.prepare("SELECT * FROM train_plan WHERE id=?").get(Number(id));
  if (!p) continue;
  const items = list.map((i) => {
    const m = prog(i.program);
    return { program: i.program, name: m.name, startLevel: i.startLevel };
  });
  db.prepare("UPDATE train_plan SET items=?, items_count=? WHERE id=?").run(JSON.stringify(items), items.length, p.id);
  console.log(`  方案#${id} 清单替换为 ${items.map((i) => i.program + "(" + i.name + ")").join(" / ")} → ${items.length} 项`);
}

/* ================= S4. 新增「刚生成未训练」的进行中方案 ================= */
console.log("\n=== S4 新增「刚生成未训练」方案 ===");
{
  const pid = 22; // 刘志远：10-29 已完成评估，无训练方案
  const act = db.prepare("SELECT id FROM train_plan WHERE patient_id=? AND status='进行中'").get(pid);
  const done = db.prepare("SELECT COUNT(*) c FROM assess_record WHERE patient_id=? AND status='已完成'").get(pid).c;
  if (act) console.log(`  患者#${pid} 已有进行中方案#${act.id}，跳过`);
  else if (!done) console.log(`  患者#${pid} 无已完成评估，跳过`);
  else {
    const items = [
      { program: "LM-01", name: "数字传真", startLevel: 1 },
      { program: "EX-01", name: "色词辨析", startLevel: 1 },
      { program: "CA-01", name: "信号捕捉", startLevel: 1 },
    ];
    const st = `${day(new Date())} 08:45:00`;
    const r = db.prepare(`INSERT INTO train_plan(patient_id,doctor_id,items,items_count,minutes,freq,weeks,locked,status,pushed_at,created_at,finished_at)
      VALUES(?,?,?,?,?,?,?,0,'进行中',?,?,NULL)`).run(pid, 2, JSON.stringify(items), items.length, 30, 3, 12, st, st);
    console.log(`  新增方案#${r.lastInsertRowid}（刘志远 p${pid}）起算 ${st}，3 项 30min freq3 12w，0 条训练记录`);
  }
}

/* ================= 汇总 ================= */
console.log("\n===== 汇总 =====");
const dist = (sql) => Object.fromEntries(db.prepare(sql).all().map((r) => [r.status, r.c]));
console.log("评估状态:", dist("SELECT status,COUNT(*) c FROM assess_record GROUP BY status"));
console.log("方案状态:", dist("SELECT status,COUNT(*) c FROM train_plan GROUP BY status"));
console.log("训练记录:", db.prepare("SELECT COUNT(*) c FROM train_record").get().c, "条 /",
  db.prepare("SELECT COUNT(*) c FROM (SELECT DISTINCT patient_id,created_at FROM train_record)").get().c, "次");
console.log("方案项数:", db.prepare("SELECT id,items_count FROM train_plan ORDER BY id").all().map((r) => `#${r.id}:${r.items_count}`).join(" "));
db.close();
