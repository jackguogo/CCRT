import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r62";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then(r => r.json());
const TK = login.data.token;
const call = (p, opt = {}) => fetch(BASE + p, {
  ...opt,
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + TK, ...(opt.headers || {}) },
  body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
}).then(r => r.json());

/* ---------- 1. 作废接口 ---------- */
console.log("== 作废接口");
const running = (await call("/assessments?status=进行中")).data;
console.log("进行中评估:", running.length);
// 自造一条测试评估用于作废，不动真实在管记录
const mk = await call("/assessments", {
  method: "POST",
  body: { patientId: 8, planName: "快速筛查方案", planId: 1, items: [{ code: "MMSE", name: "MMSE" }] },
});
console.log("造测试评估:", mk.code, mk.data || mk.message);
const victim = { id: mk.data.recordId, patient_id: 8, name: "郭德岗", plan_name: "快速筛查方案" };
console.log("目标:", { id: victim.id, name: victim.name, plan: victim.plan_name });

console.log("空原因:", (await call(`/assessments/${victim.id}/cancel`, { method: "POST", body: {} })).message);
const okc = await call(`/assessments/${victim.id}/cancel`, { method: "POST", body: { reason: "历史测试残留" } });
console.log("作废:", okc.code, okc.data);
console.log("重复作废:", (await call(`/assessments/${victim.id}/cancel`, { method: "POST", body: { reason: "再试" } })).message);
console.log("作废后记录项目:", (await call(`/assessments/${victim.id}/record-item`, { method: "POST", body: { code: "MMSE" } })).message);
console.log("作废后保存作答:", (await call(`/assessments/${victim.id}/answers`, { method: "POST", body: { code: "MMSE", answers: { m1: {} } } })).message);
console.log("作废后保存评分:", (await call(`/assessments/${victim.id}/review-scores`, { method: "POST", body: { code: "MMSE", scores: { m1: 1 } } })).message);
console.log("作废后提交:", (await call(`/assessments/${victim.id}/complete-review`, { method: "POST", body: {} })).message);

const doneOne = (await call("/assessments?status=已完成")).data[0];
console.log("作废已完成记录:", (await call(`/assessments/${doneOne.id}/cancel`, { method: "POST", body: { reason: "x" } })).message);

// 作废后同患者可再发起
const again = await call("/assessments", {
  method: "POST",
  body: { patientId: victim.patient_id, planName: "快速筛查方案", planId: 1, items: [{ code: "MMSE", name: "MMSE" }] },
});
console.log("作废后重新发起:", again.code, again.data || again.message);
if (again.code === 0) {
  await call(`/assessments/${again.data.recordId}/cancel`, { method: "POST", body: { reason: "回归脚本收尾" } });
}

const list = (await call("/assessments")).data;
const bySt = {};
list.forEach(r => bySt[r.status] = (bySt[r.status] || 0) + 1);
console.log("评估状态分布:", bySt);
console.log("已作废样本:", list.filter(r => r.status === "已作废").slice(0, 2).map(r => ({ id: r.id, name: r.name, reason: r.cancel_reason })));

/* ---------- 2. 页面 ---------- */
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1060 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

console.log("\n== 评估情况表");
await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForTimeout(1200);
const tabs = async (sel) => (await page.locator(sel).allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim());
console.log("tab:", await tabs(".list-card .el-radio-button"));
const heads = async () => (await page.locator(".list-card .el-table__header th .cell").allInnerTexts()).map(s => s.trim());
console.log("进行中列:", await heads());
console.log("进行中首行按钮:", await page.locator(".el-table__body tr").first().locator("button").allInnerTexts());
await page.screenshot({ path: `${OUT}/01-assess-running.png`, fullPage: true });

await page.click('.list-card .el-radio-button:has-text("已作废")');
await page.waitForTimeout(900);
console.log("已作废列:", await heads());
const vrows = await page.locator(".el-table__body tr").count();
console.log("已作废行数:", vrows);
if (vrows) console.log("已作废首行:", (await page.locator(".el-table__body tr").first().innerText()).replace(/\s+/g, " ").trim());
await page.screenshot({ path: `${OUT}/02-assess-voided.png`, fullPage: true });

// 作废弹窗
await page.click('.list-card .el-radio-button:has-text("进行中")');
await page.waitForTimeout(700);
await page.locator('.el-table__body tr button:has-text("作废")').first().click();
await page.waitForTimeout(900);
const dlg = page.locator(".el-message-box");
console.log("弹窗标题:", (await dlg.locator(".el-message-box__title").innerText()).trim());
console.log("弹窗提示:", (await dlg.locator(".el-message-box__message").innerText()).trim());
await page.screenshot({ path: `${OUT}/03-cancel-dialog.png`, fullPage: false });
// 空输入校验
await dlg.locator("button:has-text('确认作废')").click();
await page.waitForTimeout(600);
console.log("空输入校验:", (await dlg.locator(".el-message-box__errormsg").innerText().catch(() => "（无）")).trim());
await page.locator(".el-message-box__btns button:has-text('取消')").click();
await page.waitForTimeout(500);

/* ---------- 3. 患者详情不含已作废 ---------- */
console.log("\n== 患者详情");
await page.click('.lb-aside .el-menu-item:has-text("患者信息")');
await page.waitForTimeout(1000);
await page.locator('.el-table__body tr button:has-text("详情")').first().click();
await page.waitForTimeout(1500);
const sts = (await page.locator(".lb-main .el-table__body tr td:nth-child(6)").allInnerTexts()).map(s => s.trim());
console.log("评估记录状态列:", sts.filter(Boolean));
await page.screenshot({ path: `${OUT}/04-patient-detail.png`, fullPage: true });

console.log("\nerrors:", errors.length ? errors : "none");
await browser.close();
