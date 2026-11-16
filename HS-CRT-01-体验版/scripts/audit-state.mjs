/**
 * 状态机与数据一致性审计（只读）
 * 运行：/Users/lionz/.nvm/versions/node/v20.19.6/bin/node scripts/audit-state.mjs
 */
import Database from "better-sqlite3";
const db = new Database("data/hscrt01.db", { readonly: true });

const bad = [];
const warn = [];
const info = [];

const q = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);

/* ---------- 0. 总量 ---------- */
const cnt = (sql, ...a) => one(sql, ...a).c;
info.push(`患者 ${cnt("SELECT COUNT(*) c FROM patient")} · 评估记录 ${cnt("SELECT COUNT(*) c FROM assess_record")} · 报告 ${cnt("SELECT COUNT(*) c FROM report")} · 训练方案 ${cnt("SELECT COUNT(*) c FROM train_plan")} · 训练记录 ${cnt("SELECT COUNT(*) c FROM train_record")}`);
info.push("评估状态分布: " + JSON.stringify(Object.fromEntries(q("SELECT status,COUNT(*) c FROM assess_record GROUP BY status").map(r => [r.status, r.c]))));
info.push("方案状态分布: " + JSON.stringify(Object.fromEntries(q("SELECT status,COUNT(*) c FROM train_plan GROUP BY status").map(r => [r.status, r.c]))));

/* ---------- 1. 枚举越界 ---------- */
for (const r of q("SELECT id,status FROM assess_record WHERE status NOT IN ('进行中','已完成','已作废')"))
  bad.push(`[评估枚举] #${r.id} 状态「${r.status}」不在 进行中/已完成/已作废 内`);
for (const r of q("SELECT id,status FROM train_plan WHERE status NOT IN ('进行中','已完成','已终止')"))
  bad.push(`[方案枚举] #${r.id} 状态「${r.status}」不在 进行中/已完成/已终止 内`);

/* ---------- 2. 同患者多条进行中 ---------- */
for (const r of q("SELECT patient_id, COUNT(*) c, GROUP_CONCAT(id) ids FROM assess_record WHERE status='进行中' GROUP BY patient_id HAVING c>1"))
  bad.push(`[评估唯一] 患者#${r.patient_id} 有 ${r.c} 条进行中评估（#${r.ids}）`);
for (const r of q("SELECT patient_id, COUNT(*) c, GROUP_CONCAT(id) ids FROM train_plan WHERE status='进行中' GROUP BY patient_id HAVING c>1"))
  bad.push(`[方案唯一] 患者#${r.patient_id} 有 ${r.c} 个进行中方案（#${r.ids}）`);

/* ---------- 3. 已完成评估必须有且只有一份报告 ---------- */
for (const r of q(`SELECT a.id, a.patient_id, (SELECT COUNT(*) FROM report rp WHERE rp.record_id=a.id) n
                   FROM assess_record a WHERE a.status='已完成' AND (SELECT COUNT(*) FROM report rp WHERE rp.record_id=a.id)<>1`))
  bad.push(`[报告缺失] 评估#${r.id}（患者#${r.patient_id}）已完成但报告数=${r.n}`);
for (const r of q(`SELECT rp.id, rp.record_id, a.status FROM report rp LEFT JOIN assess_record a ON a.id=rp.record_id
                   WHERE a.id IS NULL OR a.status<>'已完成'`))
  bad.push(`[报告悬挂] 报告#${r.id} 指向评估#${r.record_id}（状态 ${r.status || "不存在"}）`);

/* ---------- 4. 已完成评估必须有明细，且明细项目 ⊆ 方案项目 ---------- */
for (const r of q(`SELECT a.id, a.items, (SELECT COUNT(*) FROM assess_detail d WHERE d.record_id=a.id) n
                   FROM assess_record a WHERE a.status='已完成' AND (SELECT COUNT(*) FROM assess_detail d WHERE d.record_id=a.id)=0`))
  bad.push(`[明细缺失] 评估#${r.id} 已完成但无任何 assess_detail`);
for (const r of q(`SELECT a.id, a.items, (SELECT COUNT(*) FROM assess_detail d WHERE d.record_id=a.id) n
                   FROM assess_record a WHERE a.status='进行中'`)) {
  const total = JSON.parse(r.items || "[]").length;
  if (r.n > total) bad.push(`[明细越界] 评估#${r.id} 明细 ${r.n} > 方案项目 ${total}`);
}

/* ---------- 5. 作废记录不应有报告 ---------- */
for (const r of q(`SELECT a.id FROM assess_record a WHERE a.status='已作废'
                   AND EXISTS(SELECT 1 FROM report rp WHERE rp.record_id=a.id)`))
  bad.push(`[作废带报告] 评估#${r.id} 已作废但仍挂着报告`);
for (const r of q("SELECT id FROM assess_record WHERE status='已作废' AND (cancel_reason IS NULL OR TRIM(cancel_reason)='')"))
  bad.push(`[作废无原因] 评估#${r.id} 已作废但没有 cancel_reason`);
for (const r of q("SELECT id FROM assess_record WHERE status='已作废' AND finished_at IS NULL"))
  warn.push(`[作废无时间] 评估#${r.id} 已作废但没有 finished_at`);

/* ---------- 6. 已完成评估的 finished_at ---------- */
for (const r of q("SELECT id FROM assess_record WHERE status='已完成' AND finished_at IS NULL"))
  bad.push(`[完成无时间] 评估#${r.id} 已完成但没有 finished_at`);
for (const r of q("SELECT id,started_at,finished_at FROM assess_record WHERE status='已完成' AND finished_at<started_at"))
  bad.push(`[时间倒挂] 评估#${r.id} 完成时间早于开始时间`);

/* ---------- 7. 训练方案 ---------- */
for (const r of q("SELECT id,status FROM train_plan WHERE status IN ('已完成','已终止') AND finished_at IS NULL"))
  bad.push(`[方案无结束时间] 方案#${r.id} 状态 ${r.status} 但 finished_at 为空`);
for (const r of q("SELECT id FROM train_plan WHERE status='进行中' AND pushed_at IS NULL"))
  warn.push(`[方案无起算日] 方案#${r.id} 进行中但 pushed_at 为空（靠 created_at 回退）`);
for (const r of q("SELECT id,weeks FROM train_plan WHERE weeks IS NULL OR weeks<=0"))
  bad.push(`[方案周期] 方案#${r.id} weeks=${r.weeks}`);
for (const r of q(`SELECT p.id, p.items_count, p.items FROM train_plan p`)) {
  const n = JSON.parse(r.items || "[]").length;
  if (n !== r.items_count) bad.push(`[方案项数] 方案#${r.id} items 实际 ${n} ≠ items_count ${r.items_count}`);
  if (n === 0) bad.push(`[方案空清单] 方案#${r.id} 没有任何训练项目`);
}

/* ---------- 8. 训练前置：有进行中/已完成方案的患者必须有已完成评估 ---------- */
for (const r of q(`SELECT DISTINCT p.patient_id FROM train_plan p
                   WHERE p.status IN ('进行中','已完成')
                     AND NOT EXISTS(SELECT 1 FROM assess_record a WHERE a.patient_id=p.patient_id AND a.status='已完成')`))
  bad.push(`[前置违规] 患者#${r.patient_id} 有训练方案但没有已完成评估`);

/* ---------- 8b. 训练起算日不得早于该患者首次完成评估 ---------- */
for (const r of q(`SELECT p.id, p.patient_id, COALESCE(p.pushed_at,p.created_at) st,
    (SELECT MIN(a.finished_at) FROM assess_record a WHERE a.patient_id=p.patient_id AND a.status='已完成') first_done
  FROM train_plan p`)) {
  if (!r.first_done) { bad.push(`[前置违规] 方案#${r.id} 的患者#${r.patient_id} 没有已完成评估`); continue; }
  if (String(r.st) < String(r.first_done))
    bad.push(`[时序倒挂] 方案#${r.id} 起算 ${String(r.st).slice(0, 10)} 早于该患者首次完成评估 ${String(r.first_done).slice(0, 10)}`);
}

/* ---------- 9. 方案时间窗：进行中方案不应已过期（sweep 应已归档） ---------- */for (const r of q(`SELECT id, patient_id, weeks, COALESCE(pushed_at,created_at) st FROM train_plan WHERE status='进行中'`)) {
  const start = String(r.st || "").slice(0, 10);
  if (!start) { bad.push(`[方案无起算] 方案#${r.id}`); continue; }
  const end = new Date(start + "T00:00:00");
  end.setDate(end.getDate() + (r.weeks || 12) * 7);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (today >= end) bad.push(`[方案过期未归档] 方案#${r.id}（患者#${r.patient_id}）到期日 ${end.toISOString().slice(0, 10)}`);
}

/* ---------- 10. 训练记录归属 ---------- */
for (const r of q(`SELECT t.id, t.patient_id, t.plan_id FROM train_record t
                   WHERE t.plan_id IS NOT NULL AND t.plan_id<>0
                     AND NOT EXISTS(SELECT 1 FROM train_plan p WHERE p.id=t.plan_id AND p.patient_id=t.patient_id)`))
  bad.push(`[训练记录归属] 记录#${r.id} plan_id=${r.plan_id} 与患者#${r.patient_id} 不匹配`);

/* ---------- 10b. 训练场次标识（频次依从性按场次统计，缺标识会被算成多次） ---------- */
for (const r of q("SELECT id, patient_id, created_at FROM train_record WHERE session_id IS NULL OR TRIM(session_id)=''"))
  bad.push(`[场次缺失] 记录#${r.id}（患者#${r.patient_id} ${r.created_at}）无 session_id`);
for (const r of q(`SELECT patient_id, session_id, COUNT(DISTINCT plan_id) n FROM train_record
                   WHERE session_id IS NOT NULL AND TRIM(session_id)<>''
                   GROUP BY patient_id, session_id HAVING n>1`))
  warn.push(`[跨方案场次] 患者#${r.patient_id} session=${r.session_id} 同时出现在 ${r.n} 个方案（可能误合并）`);

/* ---------- 11. 患者派生状态口径 ---------- */
const derived = q(`SELECT p.id, p.name,
    (SELECT COUNT(*) FROM assess_record a WHERE a.patient_id=p.id AND a.status='已完成') done,
    (SELECT COUNT(*) FROM assess_record a WHERE a.patient_id=p.id AND a.status='进行中') doing,
    (SELECT COUNT(*) FROM train_plan t WHERE t.patient_id=p.id AND t.status='进行中') plan_doing
  FROM patient p ORDER BY p.id`);
for (const r of derived) {
  if (r.plan_doing > 0 && r.done === 0) bad.push(`[派生矛盾] 患者#${r.id} ${r.name} 有进行中方案但无已完成评估`);
  if (r.doing > 1) bad.push(`[派生矛盾] 患者#${r.id} ${r.name} 进行中评估 ${r.doing} 条`);
}

/* ---------- 12. 评估方案项目是否可解析 ---------- */
for (const r of q("SELECT id, items FROM assess_record")) {
  try {
    const it = JSON.parse(r.items || "[]");
    if (!Array.isArray(it)) bad.push(`[项目格式] 评估#${r.id} items 不是数组`);
    else if (it.some(x => !x || !x.code)) bad.push(`[项目格式] 评估#${r.id} 存在无 code 的项目`);
  } catch (e) { bad.push(`[项目格式] 评估#${r.id} items 不是合法 JSON`); }
}

/* ---------- 输出 ---------- */
console.log("\n===== 概览 =====");
info.forEach(s => console.log("· " + s));
console.log(`\n===== 错误 ${bad.length} 项 =====`);
bad.forEach(s => console.log("✗ " + s));
console.log(`\n===== 警告 ${warn.length} 项 =====`);
warn.forEach(s => console.log("! " + s));
if (!bad.length && !warn.length) console.log("\n全部不变量通过。");
db.close();
