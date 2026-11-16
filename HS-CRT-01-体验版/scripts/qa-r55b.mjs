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

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

const pickPatient = async (kw) => {
  await page.click('.rec-pick button:has-text("选择患者")');
  await page.waitForTimeout(500);
  await page.fill('.el-dialog:visible input[placeholder="搜索姓名 / 门诊号 / 科室"]', kw);
  await page.waitForTimeout(400);
  await page.click('.el-dialog:visible .el-table__body tbody tr:first-child');
  await page.waitForSelector(".rec-blk", { timeout: 15000 });
  await page.waitForTimeout(1200);
};

// 入口一：左侧菜单
await page.click('.lb-aside .el-menu-item:has-text("数据记录")');
await page.waitForSelector(".rec-blk", { timeout: 15000 });
await page.waitForTimeout(1200);
console.log("菜单入口:", await page.evaluate(() => document.querySelector(".rec-pick")?.innerText.replace(/\n/g, " | ")));
await page.screenshot({ path: `${OUT}/10-menu-entry.png`, fullPage: true });

// 患者 5：两个方案
await pickPatient("吴志强");
await page.click('.rec-blk:has-text("训练记录")');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/11-multi-plan.png`, fullPage: true });
await page.click('.rec-pane .el-radio-button:has-text("训练完成情况")');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/12-multi-plan-progress.png`, fullPage: true });
await page.click('.rec-blk:has-text("依从性")');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/13-adhere-2.png`, fullPage: true });

// 患者 24：无训练记录 + 单次评估
await pickPatient("杨建国");
for (const b of ["训练记录", "依从性", "复评效果"]) {
  await page.click(`.rec-blk:has-text("${b}")`);
  await page.waitForTimeout(700);
}
await page.screenshot({ path: `${OUT}/14-no-train.png`, fullPage: true });
console.log("无训练患者:", await page.evaluate(() => ({
  blocks: [...document.querySelectorAll(".rec-blk")].map(b => b.innerText.replace(/\n/g, " | ")),
  empties: [...document.querySelectorAll(".rec-pane .el-empty__description")].map(e => e.innerText).filter(Boolean),
})));

// 入口二：患者详情 → 查看全部
await page.click('.lb-aside .el-menu-item:has-text("患者信息")');
await page.waitForTimeout(1200);
await page.click('.el-table__body tbody tr:first-child');
await page.waitForTimeout(1200);
const more = await page.$('button:has-text("查看全部")');
if (more) { await more.click(); await page.waitForTimeout(1600); }
console.log("详情入口:", await page.evaluate(() => ({
  on: document.querySelector(".rec-blk.on")?.innerText.replace(/\n/g, " | "),
  sub: [...document.querySelectorAll(".rec-pane .el-radio-button")].map(b => b.innerText.trim() + (b.classList.contains("is-active") ? "(选中)" : "")),
})));

console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
