import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r61";
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

await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForTimeout(1200);

const cont = page.locator(".el-table__body tr button:has-text('继续评估')").first();
await cont.click();
await page.waitForTimeout(2000);
const pages = ctx.pages();
const runPage = pages[pages.length - 1];
runPage.on("pageerror", (e) => errors.push("run pageerror: " + e.message));
await runPage.waitForTimeout(1500);

const btn = runPage.locator(".lb-pagehead .ph-a button:has-text('评分并提交')");
await btn.click();
await runPage.waitForTimeout(1800);

console.log("提示条:", (await runPage.locator(".rv-tip").innerText()).replace(/\s+/g, " ").trim());
console.log("吸底条:", (await runPage.locator(".rv-foot").innerText()).replace(/\s+/g, " ").trim());
await runPage.screenshot({ path: `${OUT}/03-assess-score.png`, fullPage: false });
await runPage.close();

console.log("\nerrors:", errors.length ? errors : "none");
await browser.close();
