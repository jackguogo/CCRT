import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r57";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1060 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

const shot = async (name, sel) => {
  await page.waitForTimeout(700);
  if (sel) { const el = await page.$(sel); if (el) { await el.screenshot({ path: `${OUT}/${name}.png` }); return; } }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });
await page.click('.lb-aside .el-menu-item:has-text("数据记录")');
await page.waitForTimeout(1800);

await shot("01-assess", ".lb-main");

// 训练记录：方案序号框 + 折线配色
await page.click('.rec-blk:has-text("训练记录")');
await page.waitForTimeout(1200);
await shot("02-train-trend", ".rec-pane:not([style*='none'])");

// 依从性：方案序号框
await page.click('.rec-blk:has-text("依从性")');
await page.waitForTimeout(1000);
await shot("03-adhere", ".rec-pane:not([style*='none'])");

const probe = await page.evaluate(() => ({
  rbF: document.querySelectorAll(".rb-f").length,
  blocks: [...document.querySelectorAll(".rec-blk")].map(b => b.innerText.replace(/\n/g, " | ")),
  pchips: [...document.querySelectorAll(".pchip")].map(p => ({
    idx: p.querySelector(".ra-idx")?.innerText,
    text: p.innerText.replace(/\n/g, " | "),
    on: p.classList.contains("on"),
  })),
  miniH: [...document.querySelectorAll(".rec-pane .mini-h")].filter(e => e.offsetParent).map(e => e.innerText.replace(/\n/g, " ")),
  fullBtn: [...document.querySelectorAll("button")].filter(b => b.innerText.includes("完整报告")).length,
}));
console.log(JSON.stringify(probe, null, 1));

// 折线颜色
await page.click('.rec-blk:has-text("训练记录")');
await page.waitForTimeout(1200);
const colors = await page.evaluate(() => {
  const inst = window.echarts?.getInstanceByDom(document.querySelector(".rec-pane canvas")?.parentElement);
  if (!inst) return "no inst";
  const opt = inst.getOption();
  return opt.series.map(s => ({ name: s.name, color: s.itemStyle?.color }));
});
console.log("series colors:", JSON.stringify(colors));

console.log("errors:", errors.length ? errors.slice(0, 6) : "none");
await browser.close();
