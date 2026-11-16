import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r30";
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

await page.click('.lb-aside .el-menu-item:has-text("患者信息")');
await page.waitForSelector(".list-card .el-table__row", { timeout: 10000 });
await page.waitForTimeout(900);

R.labels = await page.$$eval(".query-card .el-form-item__label", (els) => els.map((e) => e.innerText.trim()));
R.totalAll = await page.$eval(".lb-pager", (e) => e.innerText.replace(/\n/g, " ").trim());
await page.screenshot({ path: `${OUT}/01-query-bar.png`, clip: { x: 180, y: 50, width: 1260, height: 200 } });

// 逐个枚举值筛选，统计行数与状态分布
const states = ["未开始", "进行中", "审核中", "已完成"];
R.filters = {};
for (const st of states) {
  // 打开评估状态下拉
  const sels = await page.$$(".query-card .el-select");
  await sels[sels.length - 1].click();
  await page.waitForTimeout(400);
  await page.click(`.el-select-dropdown__item:has-text("${st}")`);
  await page.waitForTimeout(800);
  const rows = await page.$$eval(".list-card .el-table__body-wrapper .el-table__row", (trs) =>
    trs.map((tr) => {
      const tds = tr.querySelectorAll("td");
      return { name: tds[1].innerText.trim(), st: tds[tds.length - 3].innerText.trim() };
    }));
  R.filters[st] = { count: rows.length, sample: rows.slice(0, 3) };
  await page.screenshot({ path: `${OUT}/02-filter-${st}.png` });
  // 清空：点下拉的清除按钮不易命中，改用点「重置」
  await page.click('.query-card button:has-text("重置")');
  await page.waitForTimeout(800);
}

R.errors = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
