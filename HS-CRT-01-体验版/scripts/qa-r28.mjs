import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r28";
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

// 患者信息 → 陈建国 详情
await page.click('.lb-aside .el-menu-item:has-text("患者信息")');
await page.waitForSelector(".list-card .el-table__row", { timeout: 10000 });
await page.waitForTimeout(700);
 await page.fill('input[placeholder="姓名 / 门诊号 / 手机号"]', '陈建国');
 await page.click('button:has-text("查询")');
 await page.waitForTimeout(900);
await page.click('.list-card .el-table__body-wrapper .el-table__row:has-text("陈建国") button:has-text("详情")');
await page.waitForSelector(".lb-pagehead", { timeout: 10000 });
await page.waitForTimeout(1200);

R.phBtns = await page.$$eval(".lb-pagehead .ph-a button", (bs) => bs.map((b) => b.innerText.trim()).filter(Boolean));
R.tabs = await page.$$eval(".el-tabs__item", (els) => els.map((e) => e.innerText.trim()));
R.activeTab = await page.$eval(".el-tabs__item.is-active", (e) => e.innerText.trim());
R.assessHeaders = await page.$$eval(".el-table__header th", (els) => els.map((e) => e.innerText.trim()).filter(Boolean));
R.assessRows = await page.$$eval(".el-table__body-wrapper .el-table__row", (trs) =>
  trs.slice(0, 4).map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim()).join(" / ")));
await page.screenshot({ path: `${OUT}/01-detail-assess-plan.png` });

// 训练方案 tab
await page.click('.el-tabs__item:has-text("训练方案")');
await page.waitForTimeout(900);
R.trainCards = await page.$$eval(".el-tab-pane:not([style*='display: none']) .el-tab-pane:not([style*=none]) > div", (els) =>
  els.slice(0, 3).map((e) => e.innerText.replace(/\n/g, " | ").trim())).catch(() => []);
await page.screenshot({ path: `${OUT}/02-detail-train-plan.png` });

// 基础信息 tab
await page.click('.el-tabs__item:has-text("基础信息")');
await page.waitForTimeout(600);
R.infoFields = await page.$$eval(".el-descriptions__label", (els) => els.map((e) => e.innerText.trim()));
await page.screenshot({ path: `${OUT}/03-detail-info.png` });

// 返回列表
await page.click('.lb-pagehead .ph-a button:has-text("返回列表")');
await page.waitForTimeout(900);
R.backToList = !!(await page.$(".list-card"));

R.errors = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
