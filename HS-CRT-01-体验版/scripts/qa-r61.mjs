import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r61";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then(r => r.json());
const TK = login.data.token;
const call = (p, opt = {}) => fetch(BASE + p, {
  ...opt, headers: { "Content-Type": "application/json", Authorization: "Bearer " + TK, ...(opt.headers || {}) },
}).then(r => r.json());

/* ---------- 1. 接口：生成即进行中 / 不可手动完成 / 可终止 ---------- */
console.log("== 接口");
const pats = (await call("/patients")).data;
const target = pats.find(p => (p.assess_done || 0) > 0 && p.train_status !== "进行中" && p.train_status !== "待推送");
console.log("候选患者:", target && { id: target.id, name: target.name, assess_done: target.assess_done, train_status: target.train_status });
let created = null;
if (target) {
  const r = await call("/prescriptions", {
    method: "POST",
    body: JSON.stringify({
      patientId: target.id, minutes: 30, freq: 3, weeks: 8,
      items: [
        { program: "LM-01", name: "词语回忆", domain: "学习与记忆", startLevel: 1 },
        { program: "EX-01", name: "连线测验", domain: "执行能力", startLevel: 1 },
        { program: "AT-01", name: "持续注意", domain: "复合性注意", startLevel: 1 },
      ],
    }),
  });
  created = r.data;
  console.log("生成方案:", r.code, r.data);
  const again = await call("/prescriptions", {
    method: "POST",
    body: JSON.stringify({ patientId: target.id, minutes: 30, freq: 3, weeks: 8, items: [{ program: "LM-01", name: "词语回忆", domain: "学习与记忆", startLevel: 1 }, { program: "EX-01", name: "连线测验", domain: "执行能力", startLevel: 1 }, { program: "AT-01", name: "持续注意", domain: "复合性注意", startLevel: 1 }] }),
  });
  console.log("重复生成:", again.code, again.message);
  const fin = await call(`/prescriptions/${created.planId}/status`, { method: "PUT", body: JSON.stringify({ status: "已完成" }) });
  console.log("手动完成:", fin.code, fin.message);
  const stop = await call(`/prescriptions/${created.planId}/status`, { method: "PUT", body: JSON.stringify({ status: "已终止" }) });
  console.log("终止:", stop.code, stop.data);
  const pushRes = await fetch(`${BASE}/prescriptions/${created.planId}/push`, { method: "POST", headers: { Authorization: "Bearer " + TK } });
  console.log("旧推送接口:", pushRes.status, "（已下线）");
}

/* ---------- 2. 页面 ---------- */
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1060 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

const shot = async (name, sel) => {
  await page.waitForTimeout(700);
  if (sel) { const el = await page.$(sel); if (el) return el.screenshot({ path: `${OUT}/${name}.png` }); }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};
const rowOf = (name) => page.locator(".el-table__body tr", { hasText: name }).first();
const tabs = async (sel) => (await page.locator(sel).allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim());

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

console.log("\n== 3. 评估功能");
await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForTimeout(1200);
console.log("tab:", await tabs(".list-card .el-radio-button"));
await shot("01-assess-list", ".lb-main");

const cont = page.locator(".el-table__body tr button:has-text('继续评估')").first();
if (await cont.count()) {
  await cont.click();
  await page.waitForTimeout(2000);
  const url = page.url();
  const pages = ctx.pages();
  const runPage = pages[pages.length - 1];
  console.log("执行页:", url, "页数:", pages.length);
  if (runPage && runPage !== page) {
    runPage.on("pageerror", (e) => errors.push("run pageerror: " + e.message));
    await runPage.waitForTimeout(1500);
    console.log("页头按钮:", await runPage.locator(".lb-pagehead .ph-a button").allInnerTexts());
    await runPage.screenshot({ path: `${OUT}/02-assess-run.png`, fullPage: true });
    const btn = runPage.locator(".lb-pagehead .ph-a button:has-text('评分并提交')");
    if (await btn.count()) {
      await btn.click();
      await runPage.waitForTimeout(1800);
      console.log("评分页流程条:", await runPage.locator(".flow-path .fp-t").allInnerTexts());
      console.log("评分页底部:", await runPage.locator(".rv-foot").innerText());
      await runPage.screenshot({ path: `${OUT}/03-assess-score.png`, fullPage: true });
    }
    await runPage.close();
  }
}

console.log("\n== 4. 训练功能");
await page.bringToFront();
await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1500);
console.log("tab:", await tabs(".list-card .el-radio-button"));
const runningRow = page.locator(".el-table__body tr").filter({ has: page.locator(".st-chip:has-text('进行中')") }).first();
if (await runningRow.count()) {
  console.log("进行中行按钮:", await runningRow.locator("button").allInnerTexts());
}
const doneRow = page.locator(".el-table__body tr").filter({ has: page.locator(".st-chip:has-text('已完成')") }).first();
if (await doneRow.count()) {
  console.log("已完成行按钮:", await doneRow.locator("button").allInnerTexts());
}
await shot("04-train-list", ".lb-main");

if (await runningRow.count()) {
  await runningRow.locator("button:has-text('训练方案')").click();
  await page.waitForTimeout(1800);
  console.log("方案页卡头按钮:", await page.locator(".lb-card .head button").allInnerTexts());
  console.log("方案页状态行:", await page.locator(".st-chip.run").allInnerTexts());
  console.log("方案页底部按钮:", await page.locator(".lb-card > div:last-child button").allInnerTexts());
  await shot("05-prescribe", ".lb-main");
}

console.log("\n== 5. 训练效果");
await page.click('.lb-aside .el-menu-item:has-text("数据记录")');
await page.waitForTimeout(1200);
await page.click(".rec-pick button:has-text('选择患者')");
await page.waitForTimeout(800);
await page.fill('.el-dialog input[placeholder="搜索姓名 / 门诊号 / 科室"]', "李文秀");
await page.waitForTimeout(600);
await page.locator(".el-dialog .el-table__body tr").first().click();
await page.waitForTimeout(1800);
console.log("四个数据块:", await page.locator(".rec-blk .rb-k").allInnerTexts());
await page.locator(".rec-blk:has-text('训练效果')").click();
await page.waitForTimeout(1500);
console.log("时间轴节点:", await page.locator(".tl-wrap .rl-step").allInnerTexts());
console.log("对比选择:", await page.locator(".cmp-pick .el-select__placeholder").allInnerTexts());
console.log("画像标题:", await page.locator(".rec-pane:visible .mini-h").allInnerTexts());
await shot("06-effect", ".lb-main");
await shot("07-effect-timeline", ".tl-wrap");

await browser.close();
console.log("\nerrors:", errors.length ? errors : "none");
