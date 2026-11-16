import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r64";
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

await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1300);
console.log("tab:", (await page.locator(".list-card .el-radio-button").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()));
console.log((await page.locator(".el-table__body tr").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()).join("\n"));
await page.screenshot({ path: `${OUT}/07-train-list-final.png`, fullPage: true });

const openRec = async (name, block) => {
  await page.click('.lb-aside .el-menu-item:has-text("数据记录")');
  await page.waitForTimeout(1000);
  await page.click(".rec-pick button:has-text('选择患者')");
  await page.waitForTimeout(700);
  await page.fill('.el-dialog input[placeholder="搜索姓名 / 门诊号 / 科室"]', name);
  await page.waitForTimeout(600);
  await page.locator(".el-dialog .el-table__body tr").first().click();
  await page.waitForTimeout(1600);
  if (block) { await page.locator(`.rec-blk:has-text('${block}')`).click(); await page.waitForTimeout(1400); }
};

for (const [name, file] of [["赵慧珍", "08-adh-zhao"], ["刘志远", "09-effect-liu"]]) {
  await openRec(name, name === "赵慧珍" ? "依从性" : "训练效果");
  const st = (await page.locator(".rec-pane:visible .adh-st .v").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim());
  console.log(`\n${name} 依从性统计:`, st);
  console.log(`${name} 时间轴:`, (await page.locator(".tl-wrap .rl-step").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()));
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
}

console.log("\nerrors:", errors.length ? errors : "none");
await browser.close();
