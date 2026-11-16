/**
 * 第 72 轮：文案精简
 * 校验：
 *   1) MMSE 计分说明不再出现「记录单另标注正常筛查分界值 >26 分」
 *   2) 评估情况表区域条按钮文案为「发起评估」
 *   3) 训练情况表区域条按钮文案为「配置方案」
 *   4) 两个按钮点击后弹窗正常打开、可选患者
 * 运行：Node 22（Playwright），工作目录 = HS-CRT-01-体验版/
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r72";
fs.mkdirSync(OUT, { recursive: true });

const bad = [];
const ok = (t, c, extra = "") => {
  console.log(`${c ? "✓" : "✗"} ${t}${extra ? "  " + extra : ""}`);
  if (!c) bad.push(t);
};

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then(r => r.json());
const H = { "Content-Type": "application/json", Authorization: "Bearer " + login.data.token };
const get = (p) => fetch(BASE + p, { headers: H }).then(r => r.json());

/* ---------- 1. 指导语数据：MMSE 计分说明 ---------- */
const banks = (await get("/banks")).data;
const mmse = banks.scales.find(s => s.code === "MMSE");
const mmseScore = (mmse.guide && mmse.guide.score) || "";
console.log("MMSE 计分说明：" + mmseScore + "\n");
ok("MMSE 计分说明保留学历分层判读", /文盲\s*>17/.test(mmseScore) && /小学\s*>20/.test(mmseScore) && /中学及以上\s*>24/.test(mmseScore));
ok("MMSE 计分说明不含「正常筛查分界值 >26 分」", !/26\s*分/.test(mmseScore) && !/分界值/.test(mmseScore));

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", e => errs.push(String(e)));

try {
  await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="工号账号"]', "doctor");
  await page.fill('input[placeholder="密码"]', "hs123456");
  await page.click("button:has-text('登 录')");
  await page.waitForSelector(".lb-banner");

  /* ---------- 2. 评估情况表 ---------- */
  await page.locator(".el-menu-item", { hasText: "评估功能" }).first().click();
  await page.waitForTimeout(1000);
  const assessBar = await page.evaluate(() => {
    const bar = document.querySelector("#sec-assess-list");
    if (!bar) return null;
    const btn = bar.querySelector("button");
    return { title: (bar.querySelector(".sec-bar-t") || {}).innerText || "", btn: btn ? btn.innerText.trim() : "" };
  });
  ok("评估情况表按钮为「发起评估」", assessBar && assessBar.btn === "发起评估", assessBar ? assessBar.btn : "无区域条");
  ok("评估情况表按钮无「选择患者」前缀", assessBar && !/选择患者/.test(assessBar.btn), assessBar ? assessBar.btn : "");
  await page.locator("#sec-assess-list button").first().click();
  await page.waitForTimeout(900);
  const pickA = await page.evaluate(() => {
    const d = [...document.querySelectorAll(".el-dialog")].find(x => x.offsetParent !== null);
    if (!d) return null;
    return { title: (d.querySelector(".el-dialog__title") || {}).innerText || "", rows: d.querySelectorAll(".el-table__row").length };
  });
  ok("「发起评估」打开选择患者弹窗且有患者行", pickA && pickA.rows > 0, pickA ? `${pickA.title} · ${pickA.rows} 行` : "无弹窗");
  await page.screenshot({ path: `${OUT}/01-assess-bar.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  /* ---------- 3. 训练情况表 ---------- */
  await page.locator(".el-menu-item", { hasText: "训练功能" }).first().click();
  await page.waitForTimeout(1200);
  const trainBar = await page.evaluate(() => {
    const bar = document.querySelector("#sec-train-list");
    if (!bar) return null;
    const btn = bar.querySelector("button");
    return { title: (bar.querySelector(".sec-bar-t") || {}).innerText || "", btn: btn ? btn.innerText.trim() : "" };
  });
  ok("训练情况表按钮为「配置方案」", trainBar && trainBar.btn === "配置方案", trainBar ? trainBar.btn : "无区域条");
  ok("训练情况表按钮无「选择患者」前缀", trainBar && !/选择患者/.test(trainBar.btn), trainBar ? trainBar.btn : "");
  await page.locator("#sec-train-list button").first().click();
  await page.waitForTimeout(900);
  const pickT = await page.evaluate(() => {
    const d = [...document.querySelectorAll(".el-dialog")].find(x => x.offsetParent !== null);
    if (!d) return null;
    return { title: (d.querySelector(".el-dialog__title") || {}).innerText || "", rows: d.querySelectorAll(".el-table__row").length };
  });
  ok("「配置方案」打开选择患者弹窗且有患者行", pickT && pickT.rows > 0, pickT ? `${pickT.title} · ${pickT.rows} 行` : "无弹窗");
  await page.screenshot({ path: `${OUT}/02-train-bar.png` });

  ok("页面无脚本错误", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await browser.close();
}

console.log(bad.length ? `\n✗ ${bad.length} 项未通过：${bad.join(" / ")}` : "\n✓ 全部通过");
process.exit(bad.length ? 1 : 0);
