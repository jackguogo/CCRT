import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const B = "http://localhost:3211";
const shots = "docs/shots-r34";
const errors = [];

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// 登录
await page.goto(B + "/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click('button:has-text("登 录")');
await page.waitForSelector(".lb-banner", { timeout: 15000 });

// 进入训练功能
await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1500);

const secBar = await page.evaluate(() => {
  const el = document.querySelector("#sec-train-list");
  if (!el) return null;
  return { title: el.querySelector(".sec-bar-t")?.innerText.trim(), buttons: [...el.querySelectorAll("button")].map(b => b.innerText.trim()) };
});
console.log("区域条:", JSON.stringify(secBar));

const tabs = await page.evaluate(() => [...document.querySelectorAll(".list-card .el-radio-button")].map(b => b.innerText.replace(/\s+/g, " ").trim()));
console.log("Tab:", JSON.stringify(tabs));

const heads = await page.evaluate(() => [...document.querySelectorAll(".list-card .el-table__header th")].map(t => t.innerText.trim()).filter(Boolean));
console.log("表头:", JSON.stringify(heads));

const row0 = await page.evaluate(() => {
  const tr = document.querySelector(".list-card .el-table__body tbody tr");
  return tr ? [...tr.querySelectorAll("td")].map(td => td.innerText.replace(/\s+/g, " ").trim()) : null;
});
console.log("首行:", JSON.stringify(row0));

const pager = await page.evaluate(() => document.querySelector(".list-card .lb-pager")?.innerText.replace(/\s+/g, " ").trim());
console.log("分页:", pager);

await page.screenshot({ path: shots + "/01-train-list.png", fullPage: false });

// 切 tab
for (const [label, file] of [["训练中", "02-tab-running"], ["已完成", "03-tab-done"], ["未开始", "04-tab-none"]]) {
  await page.click(`.list-card .el-radio-button:has-text("${label}")`);
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const tr = document.querySelector(".list-card .el-table__body tbody tr");
    const empty = document.querySelector(".list-card .el-empty__description");
    return { first: tr ? tr.innerText.replace(/\s+/g, " ").trim().slice(0, 60) : null, empty: empty ? empty.innerText.trim() : null, total: document.querySelector(".list-card .el-pagination__total")?.innerText.trim() };
  });
  console.log(label + ":", JSON.stringify(info));
  await page.screenshot({ path: `${shots}/${file}.png` });
}

// 全部
await page.click('.list-card .el-radio-button:has-text("全部")');
await page.waitForTimeout(600);

// 主入口：选择患者配置训练方案
await page.click('#sec-train-list button:has-text("选择患者配置训练方案")');
await page.waitForTimeout(1200);
const dlg = await page.evaluate(() => {
  const d = [...document.querySelectorAll(".el-dialog")].find(x => x.offsetParent !== null);
  return d ? { title: d.querySelector(".el-dialog__title")?.innerText.trim(), rows: d.querySelectorAll(".el-table__body tbody tr").length } : null;
});
console.log("弹窗:", JSON.stringify(dlg));
await page.screenshot({ path: shots + "/05-pick-train.png" });

// 选第一个患者 → 应进入训练方案配置
const firstName = await page.evaluate(() => {
  const tr = [...document.querySelectorAll(".el-dialog")].find(x => x.offsetParent !== null)?.querySelector(".el-table__body tbody tr");
  return tr ? tr.innerText.split("\n")[0].trim() : null;
});
await page.click('.el-dialog:visible .el-table__body tbody tr:first-child');
await page.waitForTimeout(2000);
const after = await page.evaluate(() => ({
  secBar: [...document.querySelectorAll(".sec-bar-t")].map(x => x.innerText.trim()),
  head: document.querySelector(".lb-pagehead .ph-t")?.innerText.trim(),
  body: document.body.innerText.slice(0, 120).replace(/\s+/g, " "),
}));
console.log("选择「" + firstName + "」后:", JSON.stringify(after));
await page.screenshot({ path: shots + "/06-prescribe.png" });

console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
