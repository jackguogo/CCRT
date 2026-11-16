import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r29";
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

// 患者信息列表：操作列
await page.click('.lb-aside .el-menu-item:has-text("患者信息")');
await page.waitForSelector(".list-card .el-table__row", { timeout: 10000 });
await page.waitForTimeout(900);
R.listOpBtns = await page.$$eval(".list-card .el-table__body-wrapper .el-table__row", (trs) =>
  trs.slice(0, 3).map((tr) => {
    const tds = tr.querySelectorAll("td");
    return [...tds[tds.length - 1].querySelectorAll("button")].map((b) => b.innerText.trim());
  }));
await page.screenshot({ path: `${OUT}/01-patient-list.png` });

// 点详情 → 患者详情
await page.click('.list-card .el-table__body-wrapper .el-table__row button:has-text("详情")');
await page.waitForSelector(".el-tabs__item", { timeout: 10000 });
await page.waitForTimeout(1000);
R.detailTabs = await page.$$eval(".el-tabs__item", (els) => els.map((e) => e.innerText.trim()));

// 评估方案：表头 + 序号 + 操作
R.assessHeaders = await page.$$eval(".el-table__header th", (els) => els.map((e) => e.innerText.trim()).filter(Boolean));
R.assessRows = await page.$$eval(".el-table__body-wrapper .el-table__row", (trs) =>
  trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim()).join(" / ")));
await page.screenshot({ path: `${OUT}/02-assess-plan-tab.png` });

// 点「查看报告」→ 报告页
const hasReport = await page.$('.el-table__body-wrapper .el-table__row button:has-text("查看报告")');
if (hasReport) {
  await hasReport.click();
  await page.waitForTimeout(2000);
  R.reportOpened = await page.$eval(".rep-wrap .ph-t", (e) => e.innerText.trim()).catch(() => null);
  R.reportBackBtn = await page.$$eval(".rep-wrap .ph-a button", (bs) => bs.map((b) => b.innerText.trim()));
  await page.screenshot({ path: `${OUT}/03-report.png` });
}

R.errors = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
