/**
 * 第 106 轮核对：波士顿命名测验（BNT）30 幅逐张出示 + 三级提示评分
 *
 * 用法：先起临时实例
 *   PORT_ADMIN=3220 PORT_DOCTOR=3221 PORT_PATIENT=3222 ~/.nvm/versions/node/v20.19.6/bin/node server/index.js
 * 再跑：node scripts/shot-r106.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const require = createRequire(import.meta.url);
const { BNT_ITEMS } = require("../server/bnt-data.js");
const PORT = process.env.PORT_DOCTOR || 3221;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const WEB = `http://127.0.0.1:${PORT}`;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dir, "../docs/shots-r106");
fs.mkdirSync(SHOT, { recursive: true });

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

const PLAN = "BNT 30 幅核对（临时）";
const mk = await post("/assessments", {
  patientId: target.id, planName: PLAN, planId: 0,
  items: [{ type: "paradigm", code: "BNT", name: "波士顿命名测验（BNT）" }], mode: "doctor",
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
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") console.log("  [console]", m.text().slice(0, 160)); });

await page.goto(`${WEB}/doctor?run=${rid}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.locator("button:has-text('开始评估')").first().click();
await page.waitForTimeout(1200);

/* ---- 1. 首张图与表头 ---- */
const tag = flat(await page.locator(".bn-tag").innerText());
ok("进度显示第 1 / 30 张", tag === "第 1 / 30 张", tag);
const img = page.locator(".bn-fig img");
const src1 = await img.getAttribute("src");
ok("首张图为 bnt-01.png", /bnt-01\.png$/.test(src1 || ""), src1 || "");
const nat = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight }));
ok("图片加载成功（naturalWidth > 0）", nat.w > 200 && nat.h > 150, JSON.stringify(nat));

/* 计时在走 */
const t1 = Number((await page.locator(".bn-clock").innerText()).replace(/\D/g, ""));
await page.waitForTimeout(2200);
const t2 = Number((await page.locator(".bn-clock").innerText()).replace(/\D/g, ""));
ok("20 秒倒计时在走", t1 >= t2 && t2 <= 20, `${t1} → ${t2}`);

/* ---- 2. 勾选评分：无提示正确 ---- */
const score = async () => flat(await page.locator(".bn-score").innerText());
const clickCol = async (col, label) => {
  await page.locator(".bn-col").nth(col).locator(`button:has-text('${label}')`).click();
  await page.waitForTimeout(180);
};
await clickCol(0, "正确");                     // 第 1 张：无提示正确
ok("无提示正确后进入第 2 张", flat(await page.locator(".bn-tag").innerText()) === "第 2 / 30 张", "");
ok("总分 1 / 30", /1\s*\/\s*30/.test(await score()), await score());

await clickCol(1, "正确");                     // 第 2 张：语义提示后正确
ok("语义提示后正确 → 第 3 张、总分 2", flat(await page.locator(".bn-tag").innerText()) === "第 3 / 30 张" && /2\s*\/\s*30/.test(await score()), await score());

/* 第 3 张：语义错误 → 停在原张，等语音列 */
await clickCol(1, "错误");
ok("语义错误后仍停在原张", flat(await page.locator(".bn-tag").innerText()) === "第 3 / 30 张", "");
ok("提示语变为「请给语音提示」", /语音提示/.test(flat(await page.locator(".bn-tip").innerText())), flat(await page.locator(".bn-tip").innerText()));
await clickCol(2, "正确");                     // 语音提示后正确（不计分）
ok("语音后正确进入第 4 张、总分仍 2", flat(await page.locator(".bn-tag").innerText()) === "第 4 / 30 张" && /2\s*\/\s*30/.test(await score()), await score());

/* 第 4 张：直接语音错误（视为跳过语义） */
await clickCol(2, "错误");
ok("语音后错误进入第 5 张、总分仍 2", flat(await page.locator(".bn-tag").innerText()) === "第 5 / 30 张" && /2\s*\/\s*30/.test(await score()), await score());

/* ---- 3. 回退一张 ---- */
await page.locator(".bn-act:has-text('回退一张')").click();
await page.waitForTimeout(200);
ok("回退一张回到第 4 张", flat(await page.locator(".bn-tag").innerText()) === "第 4 / 30 张", "");

/* ---- 4. 右侧六项统计与进度格 ---- */
const aside = page.locator("aside.qx-panel");
const asideText = flat(await aside.innerText());
ok("右侧显示本题评分 2 / 30", /2\s*\/\s*30/.test(asideText), asideText.slice(0, 120));
ok("右侧列出记录单六项",
  /无提示正确数/.test(asideText) && /语义提示数/.test(asideText) && /语义提示后正确数/.test(asideText)
  && /语音提示数/.test(asideText) && /语音提示后正确数/.test(asideText), asideText.slice(0, 260));
ok("右侧写明总分口径与界值", /① \+ ③/.test(asideText) && /24/.test(asideText), "");
const dots = await aside.locator(".bn-grid i").count();
ok("进度格 30 个", dots === 30, `n=${dots}`);

/* 图下评分列 5 个按钮 */
const btns = await page.locator(".bn-btn").count();
ok("图下评分按钮 5 个（无提示 + 语义 2 + 语音 2）", btns === 5, `n=${btns}`);

await page.screenshot({ path: path.join(SHOT, "01-bnt-full.png") });
await aside.screenshot({ path: path.join(SHOT, "02-bnt-aside.png") });
/* 打开提示语看一眼 */
await page.locator(".bn-gbtn").click();
await page.waitForTimeout(200);
const hintText = flat(await page.locator(".bn-hintbox").innerText());
ok("提示语为该图的词义提示", /词义提示/.test(hintText) && new RegExp(BNT_ITEMS[3].hint).test(hintText), hintText);
await page.locator(".bn-body").screenshot({ path: path.join(SHOT, "03-bnt-hint.png") });
await page.locator(".bn-gbtn").click();

/* ---- 5. 提前结束 → 落库 ---- */
await page.locator(".bn-act:has-text('提前结束')").click();
await page.waitForTimeout(1500);
const ans = await get(`/assessments/${rid}/answers?code=BNT`);
const a = ans.data && ans.data.B1;
ok("作答已保存六项统计", !!a && a.ok1 === 1 && a.ok3 === 1 && a.sem >= 1 && a.ph >= 1, JSON.stringify(a && { ok1: a.ok1, sem: a.sem, ok3: a.ok3, ph: a.ph, ok5: a.ok5, total: a.total }));
ok("总分 = 无提示正确 + 语义后正确 = 2", a && a.total === 2, String(a && a.total));

const rv = await get(`/assessments/${rid}/review`);
const pj = (rv.data.projects || []).find((p) => p.code === "BNT");
ok("评分页取到 BNT 项目", !!pj, "");
if (pj) {
  const row = pj.items[0];
  ok("评分页 1 题 · 满分 30", pj.items.length === 1 && row.max === 30, `items=${pj.items.length}, max=${row.max}`);
  ok("评分页预填 2 分", Number(row.score) === 2, `score=${row.score}`);
}

const det = (rv.data.record && rv.data) || null;
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
