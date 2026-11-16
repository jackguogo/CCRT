import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r32";
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

// 患者详情：页头无病史、基础信息有病史摘要
await page.click('.lb-aside .el-menu-item:has-text("患者信息")');
await page.waitForSelector(".list-card .el-table__row", { timeout: 10000 });
await page.waitForTimeout(700);
await page.click('.list-card .el-table__body-wrapper .el-table__row:has-text("杨建国") button:has-text("详情")');
await page.waitForSelector(".el-tabs__item", { timeout: 10000 });
await page.waitForTimeout(900);
R.pagehead = await page.$eval(".lb-pagehead", (e) => e.innerText.replace(/\n/g, " | ").trim());
await page.click('.el-tabs__item:has-text("基础信息")');
await page.waitForTimeout(700);
R.infoLabels = await page.$$eval(".el-descriptions__label", (els) => els.map((e) => e.innerText.trim()));
R.historyCell = await page.$$eval(".el-descriptions__body tr:last-child td", (tds) => tds.map((t) => t.innerText.trim()));
await page.screenshot({ path: `${OUT}/01-detail-info.png` });

// 报告页
await page.click('.el-tabs__item:has-text("评估方案")');
await page.waitForTimeout(700);
await page.click('.el-table__body-wrapper .el-table__row button:has-text("查看报告")');
await page.waitForSelector(".rep-wrap", { timeout: 15000 });
await page.waitForTimeout(1800);

R.repSub = await page.$eval(".rep-wrap .ph-d", (e) => e.innerText.trim());
R.hasVersion = /V1\.0\.0|软件/.test(R.repSub);
R.hasAlert = (await page.$$eval(".rep-wrap .el-alert", (e) => e.length)) > 0;
R.conclHead = await page.$eval(".lb-card:has(.el-tag) .head", (e) => e.innerText.trim()).catch(() => null);
R.conclText = await page.$eval(".rep-wrap .lb-card:last-child div[style*='white-space:pre-line']", (e) => e.innerText).catch(() => null);
R.footnote = await page.$eval(".rep-wrap .lb-card:last-child p", (e) => e.innerText.trim()).catch(() => null);
await page.screenshot({ path: `${OUT}/02-report-full.png`, fullPage: true });
await page.screenshot({ path: `${OUT}/03-report-head.png`, clip: { x: 0, y: 0, width: 1440, height: 260 } });

R.errors = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
