/**
 * 第 103 轮核对：Stroop 卡片 C 的按钮与文案
 *   1. 底部提示改为「请选择字印刷的颜色，而不是字的意义」指导语原文
 *   2. 四色按钮放大、去掉 1–4 序号
 *   3. 右侧面板去掉重复的「评分要点」整段
 *
 * 用法：先起临时实例
 *   PORT_ADMIN=3220 PORT_DOCTOR=3221 PORT_PATIENT=3222 node server/index.js
 * 再跑：node scripts/shot-r103.mjs
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
const SHOT = path.join(__dir, "../docs/shots-r103");
fs.mkdirSync(SHOT, { recursive: true });
const COLOR_IDX = ["红", "黄", "蓝", "绿"];
const TIP = "请您尽可能快、尽可能准确地选择卡片上字的颜色，注意，请您选择字印刷的颜色，而不是字的意义。";

const bad = [];
const ok = (t, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${t}${e ? "  " + e : ""}`); if (!c) bad.push(t); };
const flat = (s) => (s || "").replace(/\s+/g, " ").trim();

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

const PLAN = "Stroop 按钮与文案核对（临时）";
const mk = await post("/assessments", {
  patientId: target.id, planName: PLAN, planId: 0,
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
await page.locator("button:has-text('开始评估')").first().click();
await page.waitForTimeout(900);
const press = async (keys) => { for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(10); } };

/* 卡片 A、B 快速跑完 */
for (const card of ["A", "B"]) {
  await page.locator(".sk-start").click();
  await page.waitForTimeout(300);
  await press(Array(50).fill("Space"));
  await page.waitForTimeout(400);
  await page.locator(".sk-next").click();
  await page.waitForTimeout(300);
}

/* 卡片 C：先看按钮与提示，再跑 20 格 */
await page.locator(".sk-start").click();
await page.waitForTimeout(400);

/* ---- 1. 底部提示 ---- */
const tip = flat(await page.locator(".sk-tip").first().innerText());
ok("提示语改为「选择字印刷的颜色」指导语", tip === TIP, tip);

/* ---- 2. 四色按钮：无序号、尺寸放大 ---- */
const btns = page.locator(".sk-cbtn");
const n = await btns.count();
ok("四个颜色按钮", n === 4, `n=${n}`);
const labels = [];
const sizes = [];
for (let i = 0; i < n; i++) {
  labels.push(flat(await btns.nth(i).innerText()));
  const b = await btns.nth(i).boundingBox();
  sizes.push(b ? { w: Math.round(b.width), h: Math.round(b.height) } : null);
}
ok("按钮文案只有颜色名（无 1–4 序号）", labels.join(",") === "红,黄,蓝,绿", labels.join(","));
ok("按钮高度 ≥ 52px", sizes.every((s) => s && s.h >= 52), JSON.stringify(sizes));
ok("按钮宽度 ≥ 90px", sizes.every((s) => s && s.w >= 90), JSON.stringify(sizes));
const ems = await page.locator(".sk-cbtn em").count();
ok("按钮内不再有序号元素", ems === 0, `em=${ems}`);

/* ---- 3. 右侧面板不再有重复的「评分要点」 ---- */
const aside = page.locator("aside.qx-panel");
const asideText = flat(await aside.innerText());
ok("右侧无「评分要点」小标题", !/评分要点/.test(asideText), asideText.slice(0, 120));
ok("右侧无「本题满分 50 分…」重复句", !/本题满分 50 分/.test(asideText), "");
ok("右侧仍保留「测试进程」", /测试进程/.test(asideText), "");
ok("右侧仍保留「本题评分」与 SIE", /本题评分/.test(asideText) && /SIE耗时数/.test(asideText), "");
const pts = await aside.locator(".qx-pts").count();
ok("评分要点列表已移除", pts === 0, `ul=${pts}`);

await page.screenshot({ path: path.join(SHOT, "01-card-c-pad.png") });
await page.locator(".qx-stage").screenshot({ path: path.join(SHOT, "02-stage.png") });
await aside.screenshot({ path: path.join(SHOT, "03-aside.png") });

/* 跑完本卡，确认仍能正常结算 */
const cCells = STROOP_CARDS.C.cells;
for (let i = 0; i < cCells.length; i++) {
  await btns.nth(COLOR_IDX.indexOf(cCells[i].ink)).click();
  await page.waitForTimeout(8);
}
await page.waitForTimeout(500);
const resText = flat(await page.locator(".sk-res").first().innerText());
ok("50 格读完后结算正确数 50", /50\s*\/\s*50/.test(resText), resText);
await page.locator(".sk-res").first().screenshot({ path: path.join(SHOT, "04-card-c-res.png") });

await browser.close();

/* 清理 */
const Database = require("better-sqlite3");
const db = new Database(path.join(__dir, "../data/hscrt01.db"));
const purge = db.transaction((id) => {
  ["report", "assess_detail", "assess_score", "assess_answer"].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE record_id=?`).run(id));
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
});
const row = db.prepare("SELECT id, plan_name FROM assess_record WHERE id=?").get(rid);
if (row && row.plan_name === PLAN) purge(rid);
db.close();
console.log(`\n清理临时评估 #${rid}`);
console.log(bad.length ? `\n✗ ${bad.length} 项未通过：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
