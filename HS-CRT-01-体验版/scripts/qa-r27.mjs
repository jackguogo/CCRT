import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r27";
fs.mkdirSync(OUT, { recursive: true });
const R = {}, errors = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

// 评估功能 → 已完成 → 查看报告
await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForSelector(".el-table__row", { timeout: 10000 });
await page.click('.el-radio-button:has-text("已完成")');
await page.waitForTimeout(900);
await page.click('.el-table__body-wrapper .el-table__row button:has-text("查看报告")');
await page.waitForSelector(".rep-wrap", { timeout: 15000 });
await page.waitForTimeout(1500);

R.repTitle = await page.$eval(".rep-wrap .ph-t", (e) => e.innerText.trim());
R.phBtns = await page.$$eval(".rep-wrap .ph-a button", (bs) => bs.map((b) => b.innerText.trim()).filter(Boolean));
R.hasPrinterIcon = await page.$$eval(".rep-wrap .ph-a svg", (e) => e.length);
await page.screenshot({ path: `${OUT}/01-report-head.png`, clip: { x: 0, y: 0, width: 1440, height: 220 } });

// 点返回 → 应回到评估情况表
await page.click('.rep-wrap .ph-a button:has-text("返回评估情况表")');
await page.waitForTimeout(1200);
R.afterBack = {
  view: await page.$eval(".lb-pagehead .ph-t", (e) => e.innerText.trim()).catch(() => null),
  hasRadioTabs: !!(await page.$(".el-radio-button")),
  tabs: await page.$$eval(".el-radio-button", (els) => els.map((e) => e.innerText.trim())),
};
await page.screenshot({ path: `${OUT}/02-back-to-assess.png` });

R.errors = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
