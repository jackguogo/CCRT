import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r62";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

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

const heads = async () => (await page.locator(".list-card .el-table__header th .cell").allInnerTexts()).map(s => s.trim());

await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForTimeout(1200);
console.log("tab:", (await page.locator(".list-card .el-radio-button").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()));
console.log("进行中列:", await heads());
await page.screenshot({ path: `${OUT}/01-assess-running.png`, fullPage: true });

await page.click('.list-card .el-radio-button:has-text("已作废")');
await page.waitForTimeout(900);
console.log("已作废列:", await heads());
const rows = await page.locator(".el-table__body tr").count();
console.log("已作废行数:", rows);
const heights = [];
for (let i = 0; i < rows; i++) heights.push(Math.round((await page.locator(".el-table__body tr").nth(i).boundingBox()).height));
console.log("行高:", [...new Set(heights)]);
await page.screenshot({ path: `${OUT}/02-assess-voided.png`, fullPage: true });

await page.click('.list-card .el-radio-button:has-text("已完成")');
await page.waitForTimeout(800);
console.log("已完成列:", await heads());
await page.screenshot({ path: `${OUT}/05-assess-done.png`, fullPage: true });

console.log("\n== 患者详情（郭德岗）");
await page.click('.lb-aside .el-menu-item:has-text("患者信息")');
await page.waitForTimeout(1000);
await page.fill('input[placeholder="姓名 / 门诊号 / 手机号"]', "郭德岗");
await page.press('input[placeholder="姓名 / 门诊号 / 手机号"]', "Enter");
await page.waitForTimeout(1200);
await page.locator('.el-table__body tr', { hasText: "郭德岗" }).first().locator('button:has-text("详情")').click();
await page.waitForTimeout(1600);
const tbl = page.locator(".lb-main .lb-card", { hasText: "评估记录" }).first();
console.log("评估记录表头:", (await tbl.locator(".el-table__header th .cell").allInnerTexts()).map(s => s.trim()));
console.log("评估记录行:", (await tbl.locator(".el-table__body tr").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()));
await page.screenshot({ path: `${OUT}/04-patient-detail.png`, fullPage: true });

console.log("\nerrors:", errors.length ? errors : "none");
await browser.close();
