/**
 * 第 65 轮：状态机三态数据覆盖验证（只读，不改数据）
 * 校验：评估三态 / 训练方案三态 / 患者训练状态 在接口层是否齐全且口径一致
 */
const BASE = "http://localhost:3211/api/v1";
const bad = [];
const ok = (t, c, extra = "") => { console.log(`${c ? "✓" : "✗"} ${t}${extra ? "  " + extra : ""}`); if (!c) bad.push(t); };

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then((r) => r.json());
const TK = login.data.token;
const H = { "Content-Type": "application/json", Authorization: "Bearer " + TK };
const get = (p) => fetch(BASE + p, { headers: H }).then((r) => r.json());
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then((r) => r.json());

/* ---------- 1. 评估三态 ---------- */
console.log("\n== 评估三态");
const as = (await get("/assessments")).data || [];
const cnt = (arr, k) => arr.reduce((m, r) => ((m[r[k]] = (m[r[k]] || 0) + 1), m), {});
const aDist = cnt(as, "status");
console.log("   分布:", JSON.stringify(aDist));
for (const st of ["进行中", "已完成", "已作废"]) ok(`评估存在「${st}」样本`, (aDist[st] || 0) > 0, `共 ${aDist[st] || 0} 条`);
const voided = as.filter((r) => r.status === "已作废");
ok("已作废记录均带作废原因", voided.every((r) => r.cancel_reason), voided.map((r) => `#${r.id}:${r.cancel_reason}`).join(" / "));
ok("已作废记录均带结束时间", voided.every((r) => r.finished_at));
ok("已完成记录均带结束时间", as.filter((r) => r.status === "已完成").every((r) => r.finished_at));
// 同患者只能有一条进行中
const runBy = cnt(as.filter((r) => r.status === "进行中"), "patient_id");
const dup = Object.entries(runBy).filter(([, n]) => n > 1);
ok("无患者存在多条进行中评估", dup.length === 0, dup.length ? JSON.stringify(dup) : "");

/* ---------- 2. 已作废评估的写保护 ---------- */
console.log("\n== 已作废评估写保护");
const v1 = voided[0];
if (v1) {
  const r1 = await post(`/assessments/${v1.id}/answers`, { code: "MMSE", itemId: "q1", value: {} });
  ok("作废记录不可再保存作答", r1.code !== 0, r1.message);
  const r2 = await post(`/assessments/${v1.id}/complete-review`, { scores: [] });
  ok("作废记录不可再生成报告", r2.code !== 0, r2.message);
}

/* ---------- 3. 训练方案三态（/prescriptions 按患者查，需聚合） ---------- */
console.log("\n== 训练方案三态");
const pats = (await get("/patients")).data || [];
const list = Array.isArray(pats) ? pats : pats.list || [];
const plans = [];
for (const p of list) {
  if (!(p.assess_done > 0)) continue;
  const rows = (await get(`/prescriptions?patientId=${p.id}`)).data || [];
  rows.forEach((r) => plans.push({ ...r, patient: p.name, sessions: p.train_sessions }));
}
const pDist = cnt(plans, "status");
console.log("   分布:", JSON.stringify(pDist), "共", plans.length, "个");
for (const st of ["进行中", "已完成", "已终止"]) ok(`方案存在「${st}」样本`, (pDist[st] || 0) > 0, `共 ${pDist[st] || 0} 个`);
ok("已完成方案均带结束时间", plans.filter((p) => p.status === "已完成").every((p) => p.finished_at));
ok("已终止方案均带结束时间", plans.filter((p) => p.status === "已终止").every((p) => p.finished_at));
ok("进行中方案均带起算日", plans.filter((p) => p.status === "进行中").every((p) => p.pushed_at));
ok("所有方案项数 ≥3", plans.every((p) => (p.items_count || 0) >= 3), plans.map((p) => `#${p.id}:${p.items_count}`).join(" "));
ok("所有方案项目码合法", plans.every((p) => p.items.every((i) => /^(CA|EX|LM|LA|VP|SC)-\d\d$/.test(i.program))));

/* ---------- 4. 「刚生成未训练」样本 ---------- */
console.log("\n== 刚生成未训练");
const fresh = list.filter((p) => p.train_status === "进行中" && !(p.train_sessions > 0));
ok("存在「已生成但 0 次训练」的进行中方案", fresh.length > 0, fresh.map((p) => `${p.name} p${p.id} 累计训练 ${p.train_sessions} 次`).join(" / "));

/* ---------- 5. 患者训练状态覆盖 ---------- */
console.log("\n== 患者训练状态");
const tDist = cnt(list, "train_status");
console.log("   分布:", JSON.stringify(tDist));
ok("训练状态覆盖 ≥3 种", Object.keys(tDist).filter((k) => k !== "-").length >= 3, Object.keys(tDist).join(" / "));
// 训练前置：未完成评估者不得有训练方案（"-" 表示未开始）
const badPre = list.filter((p) => p.train_status && p.train_status !== "-" && !(p.assess_done > 0));
ok("有训练方案者均完成过评估", badPre.length === 0, badPre.map((p) => p.name).join(" / "));

/* ---------- 6. 患者详情不含已作废 ---------- */
console.log("\n== 患者详情口径");
const p8 = (await get("/patients/8")).data;
const p8rec = p8.assess || p8.assessList || [];
ok("患者详情不展示已作废评估", p8rec.every((r) => r.status !== "已作废"), `郭德岗 ${p8rec.length} 条`);

console.log("\n===== 结果:", bad.length ? `${bad.length} 项未通过` : "全部通过", "=====");
if (bad.length) console.log(bad.map((b) => "  ✗ " + b).join("\n"));
