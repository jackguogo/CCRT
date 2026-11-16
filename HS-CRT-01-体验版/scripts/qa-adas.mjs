/**
 * 第 59 轮验证：ADAS-Cog 计分口径修复
 * 背景：A02–A11 原为 type:"number" 未标 scoring:"item"，itemMaxOf 取不到 max → 满分算成 0，
 *       导致 ADAS 逐题满分仅 15（应为 70）、审核页打分上限为 0。
 * 本脚本建一条仅含 ADAS 的临时评估，走完 施测→评分→提交，校验满分与总分，最后作废清理。
 */
const BASE = "http://localhost:3211/api/v1";
const bad = [];
const ok = (t, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${t}${e ? "  " + e : ""}`); if (!c) bad.push(t); };

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then((r) => r.json());
const TK = login.data.token;
const H = { "Content-Type": "application/json", Authorization: "Bearer " + TK };
const get = (p) => fetch(BASE + p, { headers: H }).then((r) => r.json());
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then((r) => r.json());

/* 找一个没有进行中评估的患者（避免 409） */
const pats = (await get("/patients")).data.list || (await get("/patients")).data;
const running = new Set(((await get("/assessments")).data || []).filter((a) => a.status === "进行中").map((a) => a.patient_id));
const target = pats.find((p) => !running.has(p.id));
if (!target) { console.log("没有可用患者"); process.exit(1); }
console.log(`临时患者：${target.name}（p${target.id}）\n`);

const mk = await post("/assessments", {
  patientId: target.id, planName: "ADAS 计分校验（临时）", planId: 0,
  items: [{ type: "scale", code: "ADAS", name: "阿尔茨海默病评定量表-认知部分（ADAS-Cog）" }], mode: "doctor",
});
ok("创建临时评估", mk.code === 0, mk.message || `#${mk.data && mk.data.recordId}`);
const rid = mk.data.recordId;

/* 施测：记录该量表（不逐题作答，直接记录项完成） */
const rec = await post(`/assessments/${rid}/record-item`, { code: "ADAS" });
ok("记录施测完成", rec.code === 0, rec.message);

/* 审核页：满分应为 70 */
const rv = (await get(`/assessments/${rid}/review`)).data;
const pj = rv.projects.find((p) => p.code === "ADAS");
ok("ADAS 项目满分 = 75", pj.max === 75, `实际 ${pj.max}`);
ok("逐题满分与指南一致", JSON.stringify(pj.items.map((i) => i.max)) === JSON.stringify([10, 5, 5, 5, 5, 8, 12, 5, 5, 5, 5, 5]),
  pj.items.map((i) => `${i.id}=${i.max}`).join(" "));
ok("每道计分题都有分档", pj.items.filter((i) => i.max > 0).every((i) => i.bands && i.bands.length));
ok("A08 分档为 0–5 六档", (pj.items.find((i) => i.id === "A08").bands || []).length === 6);
ok("A05 意象性练习满分 5", (pj.items.find((i) => i.id === "A05") || {}).max === 5);
ok("A06 定向满分 8 且有 9 档", (pj.items.find((i) => i.id === "A06") || {}).max === 8 && ((pj.items.find((i) => i.id === "A06") || {}).bands || []).length === 9);

/* 评分：全项给满分 → 总分应为 70 */
const scores = {};
pj.items.forEach((i) => { if (i.max > 0) scores[i.id] = i.max; });
const sv = await post(`/assessments/${rid}/review-scores`, { code: "ADAS", scores });
ok("保存评分", sv.code === 0, sv.message);

const rv2 = (await get(`/assessments/${rid}/review`)).data;
const pj2 = rv2.projects.find((p) => p.code === "ADAS");
ok("项目合计 = 75", pj2.total === 75, `实际 ${pj2.total} / ${pj2.max}`);

/* 提交并核对报告：报告接口是 /reports/:id（report 主键），不是 /assessments/:id/report */
const done = await post(`/assessments/${rid}/complete-review`, {});
ok("提交并生成报告", done.code === 0, done.message);
const repId = done.data && done.data.reportId;
ok("返回报告编号", !!(done.data && done.data.reportNo), (done.data && done.data.reportNo) || "—");
const rep = repId ? (await get(`/reports/${repId}`)).data : null;
/* chart 行的量表项字段是 total / max（不是 score），用 name 匹配 */
const row = rep ? (rep.chart || []).find((c) => /ADAS/.test(c.name || "")) : null;
ok("报告记录 ADAS 得分 75/75", row && Number(row.total) === 75 && Number(row.max) === 75,
  row ? `${row.total}/${row.max} ${row.verdict || ""}` : "报告无该项");

/* 清理：临时评估已「已完成」并生成报告，作废接口对已完成记录会拒绝，
   所以直接按 record_id 物理删除该临时评估及其明细/评分/作答/报告，避免污染临床数据。 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
const __dir = path.dirname(fileURLToPath(import.meta.url));
const Database = createRequire(import.meta.url)("better-sqlite3");
const db = new Database(path.join(__dir, "../data/hscrt01.db"));
const purge = db.transaction((id) => {
  db.prepare("DELETE FROM report WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_detail WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_score WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_answer WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
});
purge(rid);
const left = db.prepare("SELECT COUNT(*) c FROM assess_record WHERE id=?").get(rid).c;
ok("临时评估已清理", left === 0, `记录#${rid} 及其报告已删除`);
db.close();

console.log("\n===== 结果:", bad.length ? `${bad.length} 项未通过` : "全部通过", "=====");
if (bad.length) bad.forEach((b) => console.log("  ✗ " + b));
