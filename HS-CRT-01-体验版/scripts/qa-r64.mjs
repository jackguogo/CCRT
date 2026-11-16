import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r64";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then(r => r.json());
const TK = login.data.token;
const call = (p, opt = {}) => fetch(BASE + p, {
  ...opt,
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + TK },
  body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
}).then(r => r.json());

/* ---------- 1. 训练接口状态守卫 ---------- */
console.log("== 训练接口守卫");
const plans = (await call("/prescriptions?patientId=1")).data;
const all = await (await fetch(`${BASE}/patients`, { headers: { Authorization: "Bearer " + TK } })).json();
const donePlan = 1, stopPlan = 2, activePlan = 25;
console.log("已终止方案 start:", (await call("/train/start", { method: "POST", body: { planId: stopPlan, program: "LM-01" } })).message);
console.log("已终止方案 result:", (await call("/train/result", { method: "POST", body: { planId: stopPlan, program: "LM-01", level: 1, trials: [] } })).message);
console.log("已完成方案 start:", (await call("/train/start", { method: "POST", body: { planId: donePlan, program: "LM-01" } })).message);
console.log("进行中方案 start:", (await call("/train/start", { method: "POST", body: { planId: activePlan, program: "LM-01" } })).code === 0 ? "ok" : "失败");
console.log("越界关卡 result:", (await call("/train/result", { method: "POST", body: { planId: activePlan, program: "LM-01", level: 99, durationS: 120, trials: [{ ok: true, rt: 800 }] } })).code === 0 ? "ok（已夹到合法关卡）" : "失败");
console.log("不存在项目 result:", (await call("/train/result", { method: "POST", body: { planId: activePlan, program: "XX-99", level: 1, trials: [] } })).message);

/* ---------- 2. 患者端越权 ---------- */
const pl = await (await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "PAT-MZ260002", password: "hs123456" }) })).json();
if (pl.code === 0) {
  const PT = pl.data.token;
  const pc = (p, body) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + PT }, body: JSON.stringify(body) }).then(r => r.json());
  console.log("患者A 训练患者B 的方案:", (await pc("/train/start", { planId: activePlan, program: "LM-01" })).message);
  console.log("患者本人任务数:", ((await (await fetch(`${BASE}/my/tasks`, { headers: { Authorization: "Bearer " + PT } })).json()).data.planItems || []).length);
} else console.log("患者账号登录失败:", pl.message);

/* ---------- 3. 页面 ---------- */
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

console.log("\n== 菜单顺序");
console.log((await page.locator(".lb-aside .el-menu-item").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()));
await page.screenshot({ path: `${OUT}/01-menu.png`, fullPage: false });

console.log("\n== 训练情况表");
await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1300);
console.log("tab:", (await page.locator(".list-card .el-radio-button").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()));
const rows = await page.locator(".el-table__body tr").allInnerTexts();
console.log("行:", rows.map(s => s.replace(/\s+/g, " ").trim()));
await page.screenshot({ path: `${OUT}/02-train-list.png`, fullPage: true });

console.log("\n== 训练方案页（刘志远，进行中且有记录）");
await page.locator(".el-table__body tr", { hasText: "刘志远" }).first().locator('button:has-text("训练方案")').click();
await page.waitForTimeout(2000);
const head = page.locator(".lb-main .lb-card", { hasText: "训练方案生成" }).first();
console.log("状态块:", (await head.locator(".st-chip").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()));
await page.screenshot({ path: `${OUT}/03-prescribe.png`, fullPage: true });

console.log("\nerrors:", errors.length ? errors : "none");
await browser.close();
