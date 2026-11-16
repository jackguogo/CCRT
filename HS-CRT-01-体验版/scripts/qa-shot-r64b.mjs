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

await page.click('.lb-aside .el-menu-item:has-text("数据记录")');
await page.waitForTimeout(1200);
await page.click(".rec-pick button:has-text('选择患者')");
await page.waitForTimeout(800);
await page.fill('.el-dialog input[placeholder="搜索姓名 / 门诊号 / 科室"]', "刘志远");
await page.waitForTimeout(600);
await page.locator(".el-dialog .el-table__body tr").first().click();
await page.waitForTimeout(1800);

const blocks = (await page.locator(".rec-blk .rb-k").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim());
console.log("数据块:", blocks);

// 训练记录
await page.locator(".rec-blk:has-text('训练记录')").click();
await page.waitForTimeout(1500);
console.log("训练记录子视图:", (await page.locator(".rec-pane:visible .mini-h").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()).slice(0, 6));
await page.screenshot({ path: `${OUT}/04-rec-train.png`, fullPage: true });

// 依从性
await page.locator(".rec-blk:has-text('依从性')").click();
await page.waitForTimeout(1500);
console.log("依从性:", (await page.locator(".rec-pane:visible .mini-h").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()));
const cal = await page.locator(".rec-pane:visible .cal-cell.on").count().catch(() => -1);
console.log("日历已训练格数:", cal);
await page.screenshot({ path: `${OUT}/05-rec-adherence.png`, fullPage: true });

// 训练效果
await page.locator(".rec-blk:has-text('训练效果')").click();
await page.waitForTimeout(1500);
console.log("训练效果时间轴:", (await page.locator(".tl-wrap .rl-step").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()));
await page.screenshot({ path: `${OUT}/06-rec-effect.png`, fullPage: true });

console.log("\nerrors:", errors.length ? errors : "none");
await browser.close();
