import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r63";
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

await page.click('.lb-aside .el-menu-item:has-text("数据记录")');
await page.waitForTimeout(1200);
await page.click(".rec-pick button:has-text('选择患者')");
await page.waitForTimeout(800);
await page.fill('.el-dialog input[placeholder="搜索姓名 / 门诊号 / 科室"]', "杨建国");
await page.waitForTimeout(600);
await page.locator(".el-dialog .el-table__body tr").first().click();
await page.waitForTimeout(1800);

// 评估记录 tab（默认）
const polys = await page.locator(".rep-radar svg polygon").count();
const lines = await page.locator(".rep-radar svg line").count();
const circles = await page.locator(".rep-radar svg circle").count();
console.log("多边形数:", polys, "线段数:", lines, "圆点数:", circles);
const filled = await page.locator(".rep-radar svg polygon[fill^='rgba']").evaluateAll(els => els.map(e => ({ fill: e.getAttribute("fill"), points: e.getAttribute("points") })));
console.log("填充多边形:", filled);
await page.screenshot({ path: `${OUT}/02-radar-3dom.png`, fullPage: true });

console.log("\nerrors:", errors.length ? errors : "none");
await browser.close();
