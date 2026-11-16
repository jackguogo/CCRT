import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r55";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1060 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); };
const block = async (label) => { await page.click(`.rec-blk:has-text("${label}")`); await page.waitForTimeout(800); };

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });
await page.click('.lb-aside .el-menu-item:has-text("数据记录")');
await page.waitForTimeout(1800);

// 切到有 2 次评估 + 训练方案的患者：赵慧婷
await page.click('.rec-pick button:has-text("选择患者")');
await page.waitForTimeout(600);
await page.fill('.el-dialog:visible input[placeholder="搜索姓名 / 门诊号 / 科室"]', "赵慧");
await page.waitForTimeout(500);
await shot("00-pick-dialog");
await page.click('.el-dialog:visible .el-table__body tbody tr:first-child');
await page.waitForTimeout(1800);

await block("评估记录");
await shot("01-assess");
await block("训练记录");
await shot("02-train-trend");
await page.click('.rec-pane .el-radio-button:has-text("训练认知域")');
await shot("03-train-domain");
await page.click('.rec-pane .el-radio-button:has-text("训练完成情况")');
await shot("04-train-progress");
await page.click('.rec-pane .el-radio-button:has-text("训练明细")');
await shot("05-train-detail");
await block("依从性");
await shot("06-adhere");
await block("复评效果");
await shot("07-review");

const probe = await page.evaluate(() => ({
  blocks: [...document.querySelectorAll(".rec-blk")].map(b => b.innerText.replace(/\n/g, " | ")),
  active: document.querySelector(".rec-blk.on")?.innerText.replace(/\n/g, " | "),
  calCells: document.querySelectorAll(".rec-pane .cal-c:not(.cal-f .cal-c)").length,
  chips: [...document.querySelectorAll(".pchip")].map(c => c.innerText.replace(/\n/g, " | ")),
  loop: document.querySelector(".rloop")?.innerText.replace(/\n/g, " | "),
  cmpRows: document.querySelectorAll(".cmp-row").length,
  canvas: document.querySelectorAll(".rec-pane canvas").length,
  empties: [...document.querySelectorAll(".rec-pane .el-empty__description")].map(e => e.innerText),
}));
console.log(JSON.stringify(probe, null, 1));
console.log("errors:", errors.length ? errors.slice(0, 6) : "none");
await browser.close();
