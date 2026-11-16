import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r63";
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

// 造一条测试评估（郭德岗，当前无进行中）
const mk = await call("/assessments", {
  method: "POST",
  body: { patientId: 8, planName: "快速筛查方案", planId: 1, items: [{ code: "MMSE", name: "MMSE" }] },
});
const recId = mk.data.recordId;
console.log("测试评估:", recId);

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

await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForTimeout(1200);
await page.locator(".el-table__body tr", { hasText: "郭德岗" }).first().locator('button:has-text("作废")').click();
await page.waitForTimeout(800);
const dlg = page.locator(".el-dialog");
await dlg.locator(".el-select").click();
await page.waitForTimeout(600);
await page.locator(".el-select-dropdown:visible .el-select-dropdown__item").nth(2).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/04-cancel-picked.png`, fullPage: false });
await dlg.locator("button:has-text('确认作废')").click();
await page.waitForTimeout(1500);
const toast = await page.locator(".el-message").allInnerTexts().catch(() => []);
console.log("toast:", toast.map(s => s.trim()));
console.log("tab:", (await page.locator(".list-card .el-radio-button").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()));

const after = (await call(`/assessments`)).data.find(r => r.id === recId);
console.log("记录状态:", after && { status: after.status, reason: after.cancel_reason });
console.log("（测试记录 #" + recId + " 需用 Node 20 手动清理）");

console.log("\nerrors:", errors.length ? errors : "none");
await browser.close();
