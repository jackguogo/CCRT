/**
 * 第 73 轮：医生端登录页（书页式居中窗口）
 * 校验：
 *   1) 登录窗口居中，左右两页（书脊分栏）
 *   2) 左页：logo、软件名称、公司名称小字
 *   3) 右页：账号、密码、记住密码、登录按钮
 *   4) 记住密码：勾选并登录后刷新回填；取消勾选后清除
 *   5) 管理端登录页与医生端同款书页式（第 79 轮起）
 * 运行：Node 22（Playwright），工作目录 = HS-CRT-01-体验版/
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r73";
fs.mkdirSync(OUT, { recursive: true });

const bad = [];
const ok = (t, c, extra = "") => {
  console.log(`${c ? "✓" : "✗"} ${t}${extra ? "  " + extra : ""}`);
  if (!c) bad.push(t);
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", e => errs.push(String(e)));

try {
  await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  /* ---------- 1. 书页布局 ---------- */
  const L = await page.evaluate(() => {
    const book = document.querySelector(".lg-book");
    if (!book) return null;
    const left = book.querySelector(".lg-brand");
    const right = book.querySelector(".lg-form");
    const br = book.getBoundingClientRect();
    const lr = left.getBoundingClientRect();
    const rr = right.getBoundingClientRect();
    return {
      centerX: br.left + br.width / 2,
      centerY: br.top + br.height / 2,
      vw: innerWidth, vh: innerHeight,
      leftW: Math.round(lr.width), rightW: Math.round(rr.width),
      leftX: Math.round(lr.left), rightX: Math.round(rr.left),
      logo: left.querySelectorAll(".lg-logo img").length,
      title: (left.querySelector(".lg-title") || {}).innerText || "",
      co: (left.querySelector(".lg-co") || {}).innerText || "",
      leftCenter: lr.left + lr.width / 2,
      logoCenter: (() => { const e = left.querySelector(".lg-logo"); const r = e.getBoundingClientRect(); return r.left + r.width / 2; })(),
      titleCenter: (() => { const e = left.querySelector(".lg-title"); const r = e.getBoundingClientRect(); return r.left + r.width / 2; })(),
      coCenter: (() => { const e = left.querySelector(".lg-co"); const r = e.getBoundingClientRect(); return r.left + r.width / 2; })(),
      h3: (right.querySelector("h3") || {}).innerText || "",
      inputs: right.querySelectorAll("input:not([type=checkbox])").length,
      remember: !!right.querySelector(".el-checkbox"),
      rememberText: (right.querySelector(".el-checkbox") || {}).innerText || "",
      btn: (right.querySelector(".lg-btn") || {}).innerText || "",
    };
  });
  ok("存在书页式窗口", !!L);
  ok("窗口水平居中", L && Math.abs(L.centerX - L.vw / 2) < 2, L ? `${L.centerX.toFixed(0)} / ${L.vw / 2}` : "");
  ok("窗口垂直居中", L && Math.abs(L.centerY - L.vh / 2) < 2, L ? `${L.centerY.toFixed(0)} / ${L.vh / 2}` : "");
  ok("左右两页分栏", L && L.leftW > 200 && L.rightW > 300 && L.rightX > L.leftX, L ? `左 ${L.leftW} · 右 ${L.rightW}` : "");
  ok("左页有 logo", L && L.logo === 1);
  ok("左页有软件名称", L && /认知功能障碍评估与训练软件/.test(L.title), L ? L.title : "");
  ok("左页有公司名称小字", L && /海思太科医疗科技（杭州）有限公司/.test(L.co), L ? L.co : "");
  ok("左页 logo / 软件名 / 公司名水平居中", L && Math.abs(L.logoCenter - L.leftCenter) < 2
    && Math.abs(L.titleCenter - L.leftCenter) < 2 && Math.abs(L.coCenter - L.leftCenter) < 2,
    L ? `logo ${(L.logoCenter - L.leftCenter).toFixed(1)} · 名 ${(L.titleCenter - L.leftCenter).toFixed(1)} · 公司 ${(L.coCenter - L.leftCenter).toFixed(1)}` : "");
  ok("右页有登录标题与两个输入框", L && /医务人员登录/.test(L.h3) && L.inputs === 2, L ? `${L.h3} · ${L.inputs} input` : "");
  ok("右页有「记住密码」", L && L.remember && /记住密码/.test(L.rememberText), L ? L.rememberText : "");
  ok("右页有登录按钮", L && /登\s*录/.test(L.btn), L ? L.btn : "");
  await page.screenshot({ path: `${OUT}/01-doctor-login.png` });

  /* ---------- 2. 记住密码：勾选 → 登录 → 刷新回填 ---------- */
  await page.fill('input[placeholder="工号账号"]', "doctor");
  await page.fill('input[placeholder="密码"]', "hs123456");
  await page.locator(".lg-row .el-checkbox").click();
  await page.waitForTimeout(200);
  await page.locator(".lg-btn").click();
  await page.waitForSelector(".lb-banner", { timeout: 15000 });
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => localStorage.getItem("hs_remember_doctor"));
  ok("勾选后登录写入本地记录", !!saved, saved ? saved.slice(0, 40) + "…" : "无");

  await page.evaluate(() => localStorage.removeItem("hs_tk"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const back = await page.evaluate(() => ({
    u: document.querySelector('input[placeholder="工号账号"]').value,
    p: document.querySelector('input[placeholder="密码"]').value,
    checked: !!document.querySelector(".lg-row .is-checked"),
  }));
  ok("刷新后回填账号", back.u === "doctor", back.u || "(空)");
  ok("刷新后回填密码", back.p === "hs123456", back.p ? back.p.replace(/./g, "*") : "(空)");
  ok("刷新后「记住密码」保持勾选", back.checked);
  await page.screenshot({ path: `${OUT}/02-login-remembered.png` });

  /* ---------- 3. 取消勾选即清除 ---------- */
  await page.locator(".lg-row .el-checkbox").click();
  await page.waitForTimeout(300);
  const cleared = await page.evaluate(() => localStorage.getItem("hs_remember_doctor"));
  ok("取消勾选后清除本地记录", cleared === null, cleared === null ? "已清除" : "仍有残留");

  /* ---------- 4. 管理端登录页（第 79 轮起与医生端同款书页式） ---------- */
  await page.goto("http://localhost:3210/admin", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const a = await page.evaluate(() => {
    const book = document.querySelector(".lg-book");
    const pages = document.querySelectorAll(".lg-book .lg-page").length;
    const form = document.querySelector(".lg-page.lg-form");
    return {
      isBook: !!book,
      pages,
      oldLayout: !!document.querySelector(".lb-login"),
      title: form ? (form.querySelector("h3") || {}).textContent || "" : "",
      tip: form ? /内置账号/.test(form.innerText) : false,
    };
  });
  ok("管理端同为书页式版式", a.isBook && a.pages === 2 && !a.oldLayout, `${a.pages} 页 · 旧版式 ${a.oldLayout ? "仍在" : "已下线"}`);
  ok("管理端标题为管理员登录且无内置账号提示", a.title.trim() === "管理员登录" && !a.tip, a.title.trim());
  await page.screenshot({ path: `${OUT}/03-admin-login.png` });

  ok("页面无脚本错误", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await browser.close();
}

console.log(bad.length ? `\n✗ ${bad.length} 项未通过：${bad.join(" / ")}` : "\n✓ 全部通过");
process.exit(bad.length ? 1 : 0);
