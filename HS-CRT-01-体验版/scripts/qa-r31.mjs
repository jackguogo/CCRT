import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r31";
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
await page.waitForTimeout(1200);

R.bannerBtns = await page.$$eval(".lb-banner .bt button", (bs) => bs.map((b) => b.innerText.trim()));
R.domCardHead = await page.$eval(".lb-card:has(.dom-entry) .head", (e) => e.innerText.replace(/\n/g, " | ").trim());
R.domCardBtns = await page.$$eval(".lb-card:has(.dom-entry) .head button", (bs) => bs.map((b) => b.innerText.trim()));

// 最近患者
const cards = await page.$$(".lb-card");
R.recentHead = await page.$$eval(".lb-card .head", (els) => els.map((e) => e.innerText.replace(/\n/g, " | ").trim()));
R.recentHeaders = await page.$$eval(".lb-card:last-of-type .el-table__header th", (els) => els.map((e) => e.innerText.trim()).filter(Boolean));
R.recentRows = await page.$$eval(".lb-card:last-of-type .el-table__body-wrapper .el-table__row", (trs) =>
  trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim()).join(" / ")));
await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: true });

// 发起评估按钮 → 选患者弹窗
await page.click('.lb-banner .bt button:has-text("发起评估")');
await page.waitForTimeout(1200);
R.pickDialog = await page.$$eval(".el-dialog__title", (els) => els.map((e) => e.innerText.trim())).catch(() => []);
await page.screenshot({ path: `${OUT}/02-pick-dialog.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(600);

// 查看全部 → 患者信息
await page.click('.lb-card .head button:has-text("查看全部")');
await page.waitForTimeout(1200);
R.afterViewAll = await page.$eval(".lb-pagehead .ph-t", (e) => e.innerText.trim()).catch(() => null);
R.listHeaders = await page.$$eval(".list-card .el-table__header th", (els) => els.map((e) => e.innerText.trim()).filter(Boolean));

R.errors = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
