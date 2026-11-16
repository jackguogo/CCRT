import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r58";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1060 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

const shot = async (name, sel) => {
  await page.waitForTimeout(600);
  if (sel) { const el = await page.$(sel); if (el) return el.screenshot({ path: `${OUT}/${name}.png` }); }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};
const rowOf = (name) => page.locator(".el-table__body tr", { hasText: name }).first();
const stateOf = async (name) => (await rowOf(name).locator(".st-chip").first().innerText()).trim();

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });
await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1500);

console.log("== 训练情况表");
console.log("孙玉兰 状态:", await stateOf("孙玉兰"));
console.log("孙玉兰 按钮:", await rowOf("孙玉兰").locator("button").allInnerTexts());
console.log("周明远 按钮:", await rowOf("周明远").locator("button").allInnerTexts());
await shot("01-train-list", ".lb-main");

// A. 训练方案页的「终止当前方案」
await rowOf("孙玉兰").locator("button:has-text('训练方案')").click();
await page.waitForSelector(".pr-grid, .prescribe", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1800);
const stopBtn = await page.$("button:has-text('终止当前方案')");
console.log("训练方案页 终止按钮存在:", !!stopBtn);
await shot("02-prescribe", ".lb-main");

await page.click("button:has-text('终止当前方案')");
await page.waitForTimeout(700);
console.log("确认弹窗文案:", (await page.locator(".el-message-box__message").innerText()).replace(/\n/g, " "));
await shot("03-confirm");
await page.click(".el-message-box__btns button:has-text('确定')");
await page.waitForTimeout(2000);
console.log("终止后 训练方案页 终止按钮还在:", !!(await page.$("button:has-text('终止当前方案')")));

// 回列表看状态
await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1500);
console.log("孙玉兰 终止后状态:", await stateOf("孙玉兰"));

// B. 列表行内「终止」
await rowOf("周明远").locator("button:has-text('终止')").click();
await page.waitForTimeout(700);
console.log("行内终止 弹窗文案:", (await page.locator(".el-message-box__message").innerText()).replace(/\n/g, " "));
await page.click(".el-message-box__btns button:has-text('确定')");
await page.waitForTimeout(2000);
console.log("周明远 终止后状态:", await stateOf("周明远"));
console.log("周明远 终止后按钮:", await rowOf("周明远").locator("button").allInnerTexts());
await shot("04-after-stop", ".lb-main");

console.log("errors:", errors.length ? errors.slice(0, 6) : "none");
await browser.close();
