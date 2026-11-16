import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/screenshots";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

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
await page.screenshot({ path: `${OUT}/33-patients-query.png` });

const head = await page.$eval(".lb-header", (e) => e.innerText.replace(/\n/g, " | "));
const logo = await page.$eval(".lb-aside", (e) => {
  const l = e.querySelector(".lb-logo");
  const cs = getComputedStyle(l);
  return { text: l.innerText.replace(/\n/g, " | "), borderBottom: cs.borderBottomWidth + " " + cs.borderBottomStyle };
});
const headT = await page.$eval(".list-card .head", (e) => e.innerText.trim());
const rows = await page.$$eval(".list-card .el-table__body-wrapper .el-table__row", (trs) =>
  trs.map((tr) => [...tr.querySelectorAll("td")].slice(0, 4).map((td) => td.innerText.trim()).join(" / ")));
const pager = await page.$eval(".lb-pager", (e) => e.innerText.replace(/\n/g, " ").trim());
const pageheadText = await page.$eval(".lb-pagehead", (e) => e.innerText.replace(/\n/g, " | "));

// 分页：切到每页 5 条
await page.click(".lb-pager .el-select");
await page.waitForTimeout(400);
await page.click(".el-select-dropdown__item:has-text('5条/页')");
await page.waitForTimeout(700);
const rows5 = await page.$$eval(".list-card .el-table__body-wrapper .el-table__row", (t) => t.length);
const pager5 = await page.$eval(".lb-pager", (e) => e.innerText.replace(/\n/g, " ").trim());
await page.screenshot({ path: `${OUT}/34-patients-pager5.png` });

// 翻到第 2 页，看序号是否连续
await page.click(".lb-pager .btn-next");
await page.waitForTimeout(600);
const rowsP2 = await page.$$eval(".list-card .el-table__body-wrapper .el-table__row", (trs) =>
  trs.map((tr) => tr.querySelector("td").innerText.trim()));

// 科室筛选
await page.click(".query-card .el-select");
await page.waitForTimeout(400);
await page.click(".el-select-dropdown__item:has-text('神经内科')");
await page.waitForTimeout(700);
const rowsDept = await page.$$eval(".list-card .el-table__body-wrapper .el-table__row", (trs) =>
  trs.map((tr) => [...tr.querySelectorAll("td")].slice(0, 1).concat([...tr.querySelectorAll("td")].slice(5, 6)).map((td) => td.innerText.trim()).join("/")));
const pagerDept = await page.$eval(".lb-pager", (e) => e.innerText.replace(/\n/g, " ").trim());
await page.screenshot({ path: `${OUT}/35-patients-dept.png` });

console.log(JSON.stringify({ head, logo, pageheadText, headT, rows, pager, rows5, pager5, rowsP2, rowsDept, pagerDept, errors }, null, 2));
await browser.close();
