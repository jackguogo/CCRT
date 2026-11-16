/**
 * 演示数据：为「周明远（PAT-MZ260915）」补本周训练记录
 * 目的：患者端「记录」页的本周进度 / 记录列表有内容可看（原记录最晚 2026-10-24，本周为空）
 * 幂等：逐条按 (plan_id, created_at) 判重，重复执行只补缺失的那几条。
 * 场次：每条记录独立 session_id（每次训练各算 1 场）。
 * Node 20（better-sqlite3）。
 */
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";

const db = new Database(fileURLToPath(new URL("../data/hscrt01.db", import.meta.url)));
const PLAN = 4, PID = 3;

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const monday = new Date(now);
monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // 周一

const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset, hm) => `${ymd(new Date(monday.getTime() + offset * 86400000))} ${hm}`;
const sess = (created) => "S" + created.replace(/[-: ]/g, "");

/* 周一=0：周一 / 周二 / 周四 / 周六 各一次，凑满「每周 4 次」，
 * 覆盖「通过 / 未通过 / 达标提示」三种展示 */
const rows = [
  { program: "CA-02", level: 10, duration_s: 288, acc: 0.88, avg_rt: 1690, hint_cnt: 0, result: "通过", adjust: "升1关", created_at: day(0, "19:21:05") },
  { program: "LM-01", level: 10, duration_s: 268, acc: 0.92, avg_rt: 1420, hint_cnt: 0, result: "通过", adjust: "升1关", created_at: day(1, "19:12:41") },
  { program: "EX-01", level: 10, duration_s: 296, acc: 0.78, avg_rt: 1880, hint_cnt: 1, result: "未通过", adjust: "降1关", created_at: day(3, "19:05:16") },
  { program: "CA-02", level: 10, duration_s: 312, acc: 0.86, avg_rt: 1720, hint_cnt: 1, result: "通过", adjust: "升1关", created_at: day(5, "18:47:33") },
];

const exists = db.prepare("SELECT 1 FROM train_record WHERE plan_id=? AND created_at=?");
const ins = db.prepare(`INSERT INTO train_record(plan_id,patient_id,program,level,duration_s,acc,avg_rt,hint_cnt,result,adjust,created_at,session_id)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);

const added = [];
const tx = db.transaction((list) => {
  for (const r of list) {
    if (exists.get(PLAN, r.created_at)) continue;
    ins.run(PLAN, PID, r.program, r.level, r.duration_s, r.acc, r.avg_rt, r.hint_cnt, r.result, r.adjust, r.created_at, sess(r.created_at));
    added.push(r);
  }
});
tx(rows);

if (!added.length) console.log("本周记录已齐全，无需补数据");
else {
  console.log("已插入：");
  for (const r of added) console.log(` · ${r.created_at} ${r.program} 第${r.level}关 ${r.result} 正确率 ${Math.round(r.acc * 100)}%`);
}
db.close();
