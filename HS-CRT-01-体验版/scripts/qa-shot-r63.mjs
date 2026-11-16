import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r63";
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

/* ---- 作废弹窗（下拉选择） ---- */
await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForTimeout(1200);
await page.locator('.el-table__body tr button:has-text("作废")').first().click();
await page.waitForTimeout(900);
const dlg = page.locator(".el-dialog");
console.log("弹窗标题:", (await dlg.locator(".el-dialog__title").innerText()).trim());
console.log("提示:", (await dlg.locator(".el-dialog__body").innerText()).replace(/\s+/g, " ").trim());
await dlg.locator(".el-select").click();
await page.waitForTimeout(700);
console.log("默认原因选项:", (await page.locator(".el-select-dropdown:visible .el-select-dropdown__item").allInnerTexts()).map(s => s.trim()));
await page.screenshot({ path: `${OUT}/03-cancel-select.png`, fullPage: false });
// 选第一项后确认按钮可用性
await page.locator(".el-select-dropdown:visible .el-select-dropdown__item").first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/04-cancel-picked.png`, fullPage: false });
await dlg.locator("button:has-text('取消')").click();
await page.waitForTimeout(500);

/* ---- 训练方案页状态行 ---- */
console.log("\n== 训练方案页");
await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1300);
await page.locator('.el-table__body tr button:has-text("训练方案")').first().click();
await page.waitForTimeout(2000);
const head = page.locator(".lb-main .lb-card", { hasText: "训练方案生成" }).first();
console.log("卡头:", (await head.locator(".head").innerText()).replace(/\s+/g, " ").trim());
const chips = await head.locator(".st-chip").allInnerTexts();
console.log("状态块:", chips.map(s => s.replace(/\s+/g, " ").trim()));
console.log("是否还有「到期自动归档」:", (await head.innerText()).includes("到期自动归档"));
await page.screenshot({ path: `${OUT}/05-prescribe-head.png`, fullPage: true });

console.log("\nerrors:", errors.length ? errors : "none");
await browser.close();
