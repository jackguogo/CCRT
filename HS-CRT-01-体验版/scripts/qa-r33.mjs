import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r33";
fs.mkdirSync(OUT, { recursive: true });
const R = {}, errors = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForSelector(".el-table__row", { timeout: 10000 });
await page.click('.el-radio-button:has-text("已完成")');
await page.waitForTimeout(900);
await page.click('.el-table__body-wrapper .el-table__row:has-text("杨建国") button:has-text("查看报告")');
await page.waitForSelector(".rep-wrap", { timeout: 15000 });
await page.waitForTimeout(2200);

R.conclusion = await page.$eval(".rep-wrap .lb-card:last-child div[style*='pre-line']", (e) => e.innerText).catch(() => null);
R.tags = await page.$$eval(".rep-wrap .lb-card:last-child .el-tag", (els) => els.map((e) => e.innerText.trim()));
R.hasAlert = (await page.$$eval(".rep-wrap .el-alert", (e) => e.length)) > 0;
await page.screenshot({ path: `${OUT}/01-report-radar.png`, fullPage: true });

R.errors = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
