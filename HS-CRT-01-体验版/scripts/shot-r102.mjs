/**
 * 第 102 轮核对：项目标题去重 + Stroop 本题评分（1 题 · 满分 50，得分取卡片 C 正确数）
 *
 * 用法：先起临时实例
 *   PORT_ADMIN=3220 PORT_DOCTOR=3221 PORT_PATIENT=3222 node server/index.js
 * 再跑：node scripts/shot-r102.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const require = createRequire(import.meta.url);
const { STROOP_CARDS } = require("../server/stroop-data.js");
const PORT = process.env.PORT_DOCTOR || 3221;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const WEB = `http://127.0.0.1:${PORT}`;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dir, "../docs/shots-r102");
fs.mkdirSync(SHOT, { recursive: true });
const COLOR_IDX = ["红", "黄", "蓝", "绿"];

const bad = [];
const ok = (t, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${t}${e ? "  " + e : ""}`); if (!c) bad.push(t); };

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then((r) => r.json());
const TK = login.data.token;
const H = { "Content-Type": "application/json", Authorization: "Bearer " + TK };
const get = (p) => fetch(BASE + p, { headers: H }).then((r) => r.json());
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then((r) => r.json());

const pats = (await get("/patients")).data.list || (await get("/patients")).data;
const running = new Set(((await get("/assessments")).data || []).filter((a) => a.status === "进行中").map((a) => a.patient_id));
const target = pats.find((p) => !running.has(p.id));
if (!target) { console.log("没有可用患者"); process.exit(1); }

const mk = await post("/assessments", {
  patientId: target.id, planName: "Stroop 标题核对（临时）", planId: 0,
  items: [{ type: "paradigm", code: "STROOP", name: "Stroop 色词测验（SCWT）" }], mode: "doctor",
});
ok("创建临时评估", mk.code === 0, mk.message || "");
const rid = mk.data.recordId;

const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript((tk) => { try { localStorage.setItem("hs_tk", tk); } catch (e) { } }, TK);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

await page.goto(`${WEB}/doctor?run=${rid}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

/* ---- 1. 项目卡标题不重复 ---- */
const cardText = (await page.locator(".item-card").first().innerText()).replace(/\s+/g, " ");
ok("项目卡标题只出现一次 Stroop", (cardText.match(/stroop/gi) || []).length === 1, cardText);
ok("项目卡标题为「Stroop 色词测验（SCWT）」", /^Stroop 色词测验（SCWT）/.test(cardText), cardText);
await page.locator(".item-card").first().screenshot({ path: path.join(SHOT, "01-item-card.png") });

/* ---- 2. 跑完三张卡（A 48 对 2 错 / B 50 对 / C 40 对 10 错） ---- */
await page.locator("button:has-text('开始评估')").first().click();
await page.waitForTimeout(900);
const press = async (keys) => { for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(12); } };

for (const card of ["A", "B"]) {
  await page.locator(".sk-start").click();
  await page.waitForTimeout(400);
  if (card === "A") { await press(Array(48).fill("Space")); await press(["x", "x"]); }
  else await press(Array(50).fill("Space"));
  await page.waitForTimeout(500);
  await page.locator(".sk-next").click();
  await page.waitForTimeout(400);
}

await page.locator(".sk-start").click();
await page.waitForTimeout(400);
const cCells = STROOP_CARDS.C.cells;
for (let i = 0; i < cCells.length; i++) {
  const c = cCells[i];
  const pick = i < 40 ? c.ink : (c.w !== c.ink ? c.w : COLOR_IDX.find((x) => x !== c.ink));
  await page.locator(".sk-cbtn").nth(COLOR_IDX.indexOf(pick)).click();
  await page.waitForTimeout(10);
}
await page.waitForTimeout(500);
await page.locator(".sk-next").click();
await page.waitForTimeout(2200);

/* ---- 3. 进入评分页看「1 题 · 满分 50」与得分 ---- */
const toReview = page.locator("button:has-text('评分并提交')").first();
if (await toReview.count()) { await toReview.click(); await page.waitForTimeout(1800); }
const rvBar = page.locator(".rv-bar-t").first();
if (await rvBar.count()) {
  const rvText = (await rvBar.innerText()).replace(/\s+/g, " ");
  ok("评分项目条标题不重复", (rvText.match(/stroop/gi) || []).length === 1, rvText);
  ok("评分项目条为「1 题 · 满分 50」", /1 题 · 满分 50/.test(rvText), rvText);
  const scoreText = (await page.locator(".rv-pjscore").first().innerText()).replace(/\s+/g, " ");
  ok("得分显示 40 / 50", /40\s*\/\s*50/.test(scoreText), scoreText);
  /* 展开项目，逐题评分与「卡片 C 正确数」都在项目体内 */
  await page.locator(".rv-bar").first().click();
  await page.waitForTimeout(500);
  const body = (await page.locator(".rv-body").first().innerText()).replace(/\s+/g, " ");
  const rowCount = await page.locator(".rv-body .rv-row").count();
  ok("项目内只有 1 道题", rowCount === 1, `rows=${rowCount}`);
  ok("本题评分项写明「卡片 C 正确数」", /卡片 C 正确数/.test(body), body.slice(0, 200));
  await page.locator(".rv-card").first().screenshot({ path: path.join(SHOT, "02-review-bar.png") });
  await page.screenshot({ path: path.join(SHOT, "03-review-full.png") });
} else {
  ok("找到评分项目条", false, "未渲染");
}

await browser.close();

/* 清理 */
const Database = require("better-sqlite3");
const db = new Database(path.join(__dir, "../data/hscrt01.db"));
const purge = db.transaction((id) => {
  ["report", "assess_detail", "assess_score", "assess_answer"].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE record_id=?`).run(id));
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
});
const row = db.prepare("SELECT id, plan_name FROM assess_record WHERE id=?").get(rid);
if (row && row.plan_name === "Stroop 标题核对（临时）") purge(rid);
db.close();
console.log(`\n清理临时评估 #${rid}`);
console.log(bad.length ? `\n✗ ${bad.length} 项未通过：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
