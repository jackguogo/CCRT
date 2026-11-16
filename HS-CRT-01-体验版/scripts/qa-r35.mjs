import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r35";
fs.mkdirSync(OUT, { recursive: true });
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const errors = [];

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1500);

const tabs = await page.evaluate(() => [...document.querySelectorAll(".list-card .el-radio-button")].map(b => b.innerText.replace(/\s+/g, " ").trim()));
console.log("Tab:", JSON.stringify(tabs));

const rows = await page.evaluate(() => [...document.querySelectorAll(".list-card .el-table__body tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.replace(/\s+/g, " ").trim())));
console.log("行数:", rows.length);
rows.forEach(r => console.log("  ", r.join(" | ")));
await page.screenshot({ path: OUT + "/01-train-list.png" });

// 弹窗：只列已完成评估且不在训练中的患者
await page.click('#sec-train-list button:has-text("选择患者配置训练方案")');
await page.waitForTimeout(1200);
const dlg = await page.evaluate(() => {
  const d = [...document.querySelectorAll(".el-dialog")].find(x => x.offsetParent !== null);
  if (!d) return null;
  return {
    title: d.querySelector(".el-dialog__title")?.innerText.trim(),
    head: [...d.querySelectorAll(".el-table__header th")].map(t => t.innerText.trim()).filter(Boolean),
    rows: [...d.querySelectorAll(".el-table__body tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.replace(/\s+/g, " ").trim()).join(" | ")),
    total: d.querySelector(".el-pagination__total")?.innerText.trim(),
  };
});
console.log("弹窗:", JSON.stringify({ title: dlg.title, head: dlg.head, total: dlg.total }, null, 0));
dlg.rows.forEach(r => console.log("  ", r));
await page.screenshot({ path: OUT + "/02-pick-train.png" });

// 已完成 tab 操作列
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await page.click('.list-card .el-radio-button:has-text("已完成")');
await page.waitForTimeout(800);
const doneRows = await page.evaluate(() => [...document.querySelectorAll(".list-card .el-table__body tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.replace(/\s+/g, " ").trim()).join(" | ")));
console.log("已完成 tab:", JSON.stringify(doneRows));
await page.screenshot({ path: OUT + "/03-tab-done.png" });

// 点「训练记录」→ 数据记录
await page.click('.list-card .el-table__body tbody tr:first-child button:has-text("训练记录")');
await page.waitForTimeout(2000);
const rec = await page.evaluate(() => ({
  menu: document.querySelector(".lb-aside .el-menu-item.is-active")?.innerText.trim(),
  ph: document.querySelector(".lb-pagehead .ph-t")?.innerText.trim(),
  hasTable: !!document.querySelector(".el-table__body tbody tr"),
}));
console.log("训练记录跳转:", JSON.stringify(rec));
await page.screenshot({ path: OUT + "/04-train-records.png" });

console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
