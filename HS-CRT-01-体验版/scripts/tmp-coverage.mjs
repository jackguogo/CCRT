import Database from "better-sqlite3";
const db = new Database("data/hscrt01.db", { readonly: true });

console.log("--- 患者评估/训练状态覆盖 ---");
const rows = db.prepare(`
 SELECT p.id, p.name,
  (SELECT COUNT(*) FROM assess_record a WHERE a.patient_id=p.id AND a.status='已完成') done,
  (SELECT COUNT(*) FROM assess_record a WHERE a.patient_id=p.id AND a.status='进行中') doing,
  (SELECT COUNT(*) FROM assess_record a WHERE a.patient_id=p.id AND a.status='已作废') voided,
  (SELECT COUNT(*) FROM train_plan t WHERE t.patient_id=p.id AND t.status='进行中') p_doing,
  (SELECT COUNT(*) FROM train_plan t WHERE t.patient_id=p.id AND t.status='已完成') p_done,
  (SELECT COUNT(*) FROM train_plan t WHERE t.patient_id=p.id AND t.status='已终止') p_stop,
  (SELECT COUNT(*) FROM train_record r WHERE r.patient_id=p.id) recs
 FROM patient p WHERE p.is_deleted=0 ORDER BY p.id`).all();
for (const r of rows) {
  console.log(`p${r.id} ${r.name.padEnd(4, "　")} 评估 完成${r.done}/进行${r.doing}/作废${r.voided} | 方案 进行${r.p_doing}/完成${r.p_done}/终止${r.p_stop} | 训练记录 ${r.recs}`);
}
console.log("--- 训练结果覆盖 ---", db.prepare("SELECT result,COUNT(*) c FROM train_record GROUP BY result").all());
console.log("--- 训练调整覆盖 ---", db.prepare("SELECT adjust,COUNT(*) c FROM train_record GROUP BY adjust").all());
console.log("--- 评估 started_at 空 ---", db.prepare("SELECT COUNT(*) c FROM assess_record WHERE started_at IS NULL").get());
console.log("--- 报告 created_at 与记录 finished_at 差 >1天 ---",
  db.prepare(`SELECT r.id,r.report_no,r.created_at,a.finished_at FROM report r JOIN assess_record a ON a.id=r.record_id
              WHERE ABS(julianday(r.created_at)-julianday(a.finished_at))>1`).all().length);
db.close();
