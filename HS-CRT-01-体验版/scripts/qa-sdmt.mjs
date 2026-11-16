/**
 * 第 97 轮验证：SDMT 换成记录单量表（KEY + 练习行 + 90 秒正式表）
 *
 * 用法：先起临时实例
 *   PORT_ADMIN=3220 PORT_DOCTOR=3221 PORT_PATIENT=3222 \
 *   "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node" server/index.js
 * 再跑：node scripts/qa-sdmt.mjs
 *
 * 覆盖：练习行 15 格（含纠错）→ 开始 → 正式表填 15 格（12 对 3 错）→ 提前结束 → 结算卡
 *      → 完成并记录 → 复核 detail（正确数/错误数/完成量）→ 清理临时评估
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const require = createRequire(import.meta.url);
const { SDMT_PRACTICE, SDMT_ROWS } = require("../server/sdmt-data.js");

const PORT = process.env.PORT_DOCTOR || 3221;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const WEB = `http://127.0.0.1:${PORT}`;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dir, "../docs/shots-r97");
fs.mkdirSync(SHOT, { recursive: true });

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

const pats = (await get("/patients")).data.list || (await get("/patients")).data;
const running = new Set(((await get("/assessments")).data || []).filter((a) => a.status === "进行中").map((a) => a.patient_id));
const target = pats.find((p) => !running.has(p.id));
if (!target) { console.log("没有可用患者"); process.exit(1); }
console.log(`临时患者：${target.name}（p${target.id}）`);

const mk = await post("/assessments", {
  patientId: target.id, planName: "SDMT 量表校验（临时）", planId: 0,
  items: [{ type: "paradigm", code: "SDMT", name: "符号数字转换测验（SDMT）" }], mode: "doctor",
});
ok("创建临时评估", mk.code === 0, mk.message || "");
const rid = mk.data.recordId;

const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript((tk) => { try { localStorage.setItem("hs_tk", tk); } catch (e) { } }, TK);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

await page.goto(`${WEB}/doctor?run=${rid}`, { waitUntil: "networkidle" });
const startBtn = page.locator("button:has-text('开始评估')").first();
if (await startBtn.count()) await startBtn.click();
await page.waitForTimeout(1500);

const stage = page.locator(".sd-body");
const hasStage = (await stage.count()) > 0;
ok("进入 SDMT 施测界面", hasStage, hasStage ? "" : (await page.locator("body").innerText()).slice(0, 200).replace(/\s+/g, " "));

if (hasStage) {
  ok("KEY 为 9 列两行（上符号下数字）", (await page.locator(".sd-key-c:not(.num)").count()) === 9 && (await page.locator(".sd-key-c.num").count()) === 9);
  ok("练习行 15 格", (await page.locator(".sd-grid.prac .sd-cell").count()) === SDMT_PRACTICE.length);
  ok("初始计时 90 秒未开始", (await page.locator(".sd-clock").count()) === 0);
  await stage.screenshot({ path: path.join(SHOT, "01-sdmt-practice.png") });
  await page.screenshot({ path: path.join(SHOT, "00-sdmt-full.png") });

  /* 练习：先故意填错第 1 格（应 1，填 9），看是否即时提示；再改正 */
  await page.locator(".sd-keybtn", { hasText: "9" }).first().click();
  await page.waitForTimeout(200);
  const fb = (await page.locator(".sd-fb").innerText()).replace(/\s+/g, " ");
  ok("练习填错即提示正确数字", /应填 1/.test(fb), fb.slice(0, 40));
  await stage.screenshot({ path: path.join(SHOT, "02-sdmt-practice-wrong.png") });
  await page.locator(".sd-keybtn", { hasText: "1" }).first().click();
  await page.waitForTimeout(200);

  /* 补齐其余 14 格 */
  for (let i = 1; i < SDMT_PRACTICE.length; i++) {
    await page.locator(".sd-keybtn", { hasText: String(SDMT_PRACTICE[i]) }).first().click();
    await page.waitForTimeout(90);
  }
  const pracFilled = await page.locator(".sd-grid.prac .sd-cell.ok").count();
  ok("练习 15 格全部填对（绿标）", pracFilled === SDMT_PRACTICE.length, `实际 ${pracFilled}`);

  const startTest = page.locator(".sd-keybtn.start");
  ok("「开始 90 秒测试」可点", !(await startTest.isDisabled()));
  await startTest.click();
  await page.waitForTimeout(1200);

  ok("正式表 105 格", (await page.locator(".sd-grid:not(.prac) .sd-cell").count()) === 105);
  const clock0 = await page.locator(".sd-clock").innerText();
  ok("倒计时已启动", /^0[01]:\d\d$/.test(clock0), clock0);
  await stage.screenshot({ path: path.join(SHOT, "03-sdmt-formal.png") });

  /* 跳格必须被拦住：先点第 6 格，提示按顺序且光标不移动 */
  await page.locator(".sd-grid:not(.prac) .sd-cell").nth(5).click();
  await page.waitForTimeout(200);
  const skipTip = (await page.locator(".sd-skip").innerText().catch(() => "")).trim();
  ok("点后面的空格被拒绝并提示按顺序", /按顺序填写/.test(skipTip), skipTip);
  const onIdx = await page.locator(".sd-grid:not(.prac) .sd-cell.on").evaluateAll((els, root) =>
    els.map((e) => Array.from(root.querySelectorAll(".sd-cell")).indexOf(e)), await page.locator(".sd-grid:not(.prac)").elementHandle());
  ok("光标仍在第 1 格", onIdx[0] === 0, `idx=${JSON.stringify(onIdx)}`);
  await stage.screenshot({ path: path.join(SHOT, "06-sdmt-skip-tip.png") });

  /* 第 1 行 15 格：前 12 格填对、后 3 格故意填错 */
  const row1 = SDMT_ROWS[0];
  for (let i = 0; i < 12; i++) {
    await page.locator(".sd-keybtn", { hasText: String(row1[i]) }).first().click();
    await page.waitForTimeout(70);
  }
  for (let i = 12; i < 15; i++) {
    const wrongDigit = String((row1[i] % 9) + 1);
    await page.locator(".sd-keybtn", { hasText: wrongDigit }).first().click();
    await page.waitForTimeout(70);
  }
  const okCells = await page.locator(".sd-grid:not(.prac) .sd-cell.ok").count();
  const badCells = await page.locator(".sd-grid:not(.prac) .sd-cell.bad").count();
  ok("正式表 12 格判对", okCells === 12, `实际 ${okCells}`);
  ok("正式表 3 格判错", badCells === 3, `实际 ${badCells}`);
  await stage.screenshot({ path: path.join(SHOT, "04-sdmt-formal-filled.png") });

  /* 提前结束 → 结算卡 */
  await page.locator(".sd-keybtn.fn", { hasText: "提前结束" }).click();
  await page.waitForTimeout(500);
  const res = (await page.locator(".sd-result").innerText()).replace(/\s+/g, " ");
  ok("结算卡：正确 12 / 错误 3 / 完成 15", /正确 12/.test(res) && /错误 3/.test(res) && /完成 15/.test(res), res);
  await stage.screenshot({ path: path.join(SHOT, "05-sdmt-result.png") });

  await page.locator(".sd-done").click();
  await page.waitForTimeout(2000);
}

await browser.close();

const Database = require("better-sqlite3");
const _db = new Database(path.join(__dir, "../data/hscrt01.db"), { readonly: true });
const readDetail = (id) => _db.prepare("SELECT payload, raw FROM assess_detail WHERE record_id=? AND code=?").get(id, "SDMT");

/* 复核落库：评分页项目 + detail 指标 + 作答明细 */
const rv = (await get(`/assessments/${rid}/review`)).data;
const pj = rv.projects.find((p) => p.code === "SDMT");
ok("评分页列出 S1 且已预填 12 分", !!pj && Number(pj.items[0].score) === 12, pj ? `score=${pj.items[0].score}` : "无");
ok("评分页满分 = 110", !!pj && Number(pj.max) === 110, pj ? `max=${pj.max}` : "无");
const det = readDetail(rid);
const payload = det ? JSON.parse(det.payload || "{}") : null;
ok("detail 已生成", !!payload, det ? "有" : "无");
if (payload) {
  ok("detail 总分 = 12 / 110", Number(payload.total) === 12 && Number(payload.max) === 110, `${payload.total}/${payload.max}`);
  ok("detail 指标含错误数 3", /错误数.*3/.test(JSON.stringify(payload.metrics || {})), JSON.stringify(payload.metrics || {}));
  ok("指标含参考判读", /参考判读/.test(JSON.stringify(payload.ind || [])), JSON.stringify(payload.ind || []).slice(0, 120));
}
const ans = (await get(`/assessments/${rid}/answers?code=SDMT`)).data || {};
const sheet = ans.S1 && ans.S1.parts && ans.S1.parts[0];
ok("作答表整串已留存（7 行 15 格）", typeof sheet === "string" && sheet.split("|").length === 7 && sheet.split("|")[0].length === 15,
  typeof sheet === "string" ? sheet.slice(0, 24) + "…" : "无");

/* 提交并看报告：确认错误数/完成量在提交后仍留在指标里 */
const done = await post(`/assessments/${rid}/complete-review`, {});
ok("提交并生成报告", done.code === 0, done.message);
if (done.code === 0) {
  const rep = (await get(`/reports/${done.data.reportId}`)).data;
  const row = (rep.chart || []).find((c) => /SDMT|符号/.test(c.name || ""));
  /* 范式在报告里按指标呈现（total/max 恒为 null），正确数/错误数在 metrics 里 */
  const mt = JSON.stringify((row && row.metrics) || []);
  ok("报告指标含正确数 12/110", /12 \/ 110/.test(mt), mt.slice(0, 120));
  ok("报告指标含错误数", /错误数/.test(mt) && /"3 个"/.test(mt), mt.slice(0, 160));
  const det2 = readDetail(rid);
  const p2 = JSON.parse((det2 && det2.payload) || "{}");
  ok("提交后指标仍含错误数 3", /错误数.*3/.test(JSON.stringify(p2.metrics || {})), JSON.stringify(p2.metrics || {}));
  ok("提交后指标仍含参考判读", /参考判读/.test(JSON.stringify(p2.ind || [])), "");
}

/* 清理 */
const db = new Database(path.join(__dir, "../data/hscrt01.db"));
const purge = db.transaction((id) => {
  ["report", "assess_detail", "assess_score", "assess_answer"].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE record_id=?`).run(id));
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
});
const row = db.prepare("SELECT id, plan_name FROM assess_record WHERE id=?").get(rid);
if (row && row.plan_name === "SDMT 量表校验（临时）") purge(rid);
db.close();
_db.close();
console.log(`\n清理临时评估 #${rid}`);
console.log(bad.length ? `\n✗ ${bad.length} 项未通过：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
