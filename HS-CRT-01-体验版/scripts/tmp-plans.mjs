import Database from "better-sqlite3";
const db = new Database("data/hscrt01.db", { readonly: true });
for (const p of db.prepare("SELECT id,patient_id,items,minutes,freq,weeks,locked,status,created_at FROM train_plan WHERE status='进行中' ORDER BY id").all()) {
  console.log(p.id, "p" + p.patient_id, p.status, `freq=${p.freq} weeks=${p.weeks} min=${p.minutes} locked=${p.locked}`, p.created_at, JSON.parse(p.items).map(i => i.program + "@L" + i.startLevel).join(","));
}
console.log("\n--- 已终止/已完成方案的最后训练时间 ---");
for (const p of db.prepare("SELECT id,patient_id,status,created_at,weeks FROM train_plan WHERE status<>'进行中' ORDER BY id").all()) {
  const last = db.prepare("SELECT MAX(created_at) t, COUNT(*) c FROM train_record WHERE plan_id=?").get(p.id);
  console.log(p.id, "p" + p.patient_id, p.status, "created", p.created_at, "weeks", p.weeks, "→ 记录", last.c, "最后", last.t);
}
console.log("\n--- 方案 9 items ---", JSON.parse(db.prepare("SELECT items FROM train_plan WHERE id=9").get().items));
db.close();
