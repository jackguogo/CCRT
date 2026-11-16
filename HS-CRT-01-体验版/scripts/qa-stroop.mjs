/**
 * 第 99 轮验证：Stroop 色词测验按记录单三张卡片重做
 *
 * 用法：先起临时实例
 *   PORT_ADMIN=3220 PORT_DOCTOR=3221 PORT_PATIENT=3222 \
 *   "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node" server/index.js
 * 再跑：node scripts/qa-stroop.mjs
 *
 * 覆盖：卡片 A（黑字，48 对 2 错）→ 卡片 B（圆点，50 对）→ 卡片 C（彩字，40 对 10 错）
 *      → 完成并记录 → 复核 detail（SIE 耗时/准确数、评分判读）→ 提交出报告 → 清理
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const require = createRequire(import.meta.url);
const { STROOP_CARDS, STROOP_INK } = require("../server/stroop-data.js");

const PORT = process.env.PORT_DOCTOR || 3221;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const WEB = `http://127.0.0.1:${PORT}`;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dir, "../docs/shots-r99");
fs.mkdirSync(SHOT, { recursive: true });

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
console.log(`临时患者：${target.name}（p${target.id}）`);

const mk = await post("/assessments", {
  patientId: target.id, planName: "Stroop 色词校验（临时）", planId: 0,
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
const startBtn = page.locator("button:has-text('开始评估')").first();
if (await startBtn.count()) await startBtn.click();
await page.waitForTimeout(1500);

const stage = page.locator(".sk-body");
const hasStage = (await stage.count()) > 0;
ok("进入 Stroop 施测界面", hasStage, hasStage ? "" : (await page.locator("body").innerText()).slice(0, 200).replace(/\s+/g, " "));

/* 键盘连按：空格 = 读对，x = 读错 */
const press = async (keys, wait = 25) => {
  for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(wait); }
};
const panelText = async () => (await page.locator(".qx-panel").innerText()).replace(/\s+/g, " ");
const COLOR_IDX = ["红", "黄", "蓝", "绿"];

if (hasStage) {
  ok("首屏为卡片 A 准备页", /卡片 A · 词语任务/.test(await page.locator(".sk-tag").innerText()));
  ok("准备页有「准备，开始」", (await page.locator(".sk-start").count()) === 1);
  await stage.screenshot({ path: path.join(SHOT, "01-stroop-ready.png") });

  await page.locator(".sk-start").click();
  await page.waitForTimeout(600);
  ok("卡片 A 共 50 格", (await page.locator(".sk-cell").count()) === 50, `实际 ${await page.locator(".sk-cell").count()}`);
  const cellA = (await page.locator(".sk-cell").first().innerText()).trim();
  ok("卡片 A 第一格为汉字「绿」", cellA === STROOP_CARDS.A.cells[0], cellA);
  const colorA = await page.locator(".sk-cell").first().evaluate((el) => getComputedStyle(el.querySelector("span")).color);
  ok("卡片 A 为黑字（白纸黑字）", colorA === "rgb(17, 24, 39)", colorA);
  await page.screenshot({ path: path.join(SHOT, "02-stroop-a-full.png") });

  /* 右侧：三张卡片分段，逐段给评估操作与评分；左侧不再有「本题评分」 */
  ok("左侧不再有「本题评分」", (await page.locator(".sk-score").count()) === 0);
  ok("右侧按 A/B/C 三张卡片分段", (await page.locator(".sk-ac").count()) === 3, `实际 ${await page.locator(".sk-ac").count()}`);
  ok("当前卡片（A）默认展开并给评估操作", (await page.locator(".sk-ac.now").count()) === 1
    && /评估操作/.test(await page.locator(".sk-ac.now").innerText()),
    (await page.locator(".sk-ac.now").innerText()).replace(/\s+/g, " ").slice(0, 80));

  /* 本题评分：卡片 A/B/C 分开三行 + SIE耗时数 / SIE准确数 */
  ok("本题评分单列三张卡片", (await page.locator(".sk-item-row:not(.sie)").count()) === 3, `实际 ${await page.locator(".sk-item-row:not(.sie)").count()}`);
  ok("本题评分含 SIE耗时数 / SIE准确数", (await page.locator(".sk-item-row.sie").count()) === 2);
  ok("未测的卡片评分显示「—」", /完成时间\s*—/.test(await page.locator(".sk-item").innerText()));
  ok("未开始的卡片标「未开始」", /未开始/.test(await panelText()), (await panelText()).slice(-60));
  await stage.screenshot({ path: path.join(SHOT, "02b-stroop-a.png") });

  /* 48 对 + 2 错 */
  await press(Array(48).fill("Space"));
  await press(["x", "x"]);
  await page.waitForTimeout(400);
  const resA = (await page.locator(".sk-res").innerText()).replace(/\s+/g, " ");
  ok("卡片 A 结算：正确 48 / 错误 2", /正确数\s*48/.test(resA) && /错误数\s*2/.test(resA), resA);
  await stage.screenshot({ path: path.join(SHOT, "03-stroop-a-done.png") });

  /* 卡片 B */
  await page.locator(".sk-next").click();
  await page.waitForTimeout(400);
  ok("进入卡片 B 准备页", /卡片 B · 颜色任务/.test(await page.locator(".sk-tag").innerText()));
  await page.locator(".sk-start").click();
  await page.waitForTimeout(500);
  ok("卡片 B 有 50 个圆点", (await page.locator(".sk-dot").count()) === 50, `实际 ${await page.locator(".sk-dot").count()}`);
  const dotBg = await page.locator(".sk-dot").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  ok("圆点用四色之一着色（绿）", dotBg === "rgb(46, 139, 87)", dotBg);
  await page.screenshot({ path: path.join(SHOT, "04-stroop-b-full.png") });
  await stage.screenshot({ path: path.join(SHOT, "04b-stroop-b.png") });

  await press(Array(50).fill("Space"));
  await page.waitForTimeout(400);
  const resB = (await page.locator(".sk-res").innerText()).replace(/\s+/g, " ");
  ok("卡片 B 结算：正确 50 / 错误 0", /正确数\s*50/.test(resB) && /错误数\s*0/.test(resB), resB);

  /* 卡片 C */
  await page.locator(".sk-next").click();
  await page.waitForTimeout(400);
  ok("进入卡片 C 准备页", /卡片 C · 色词任务/.test(await page.locator(".sk-tag").innerText()));
  await page.locator(".sk-start").click();
  await page.waitForTimeout(500);
  const cellCText = (await page.locator(".sk-cell").first().innerText()).trim();
  ok("卡片 C 第一格字为「蓝」", cellCText === STROOP_CARDS.C.cells[0].w, cellCText);
  const colorC = await page.locator(".sk-cell").first().evaluate((el) => getComputedStyle(el.querySelector("span")).color);
  const wantC = STROOP_INK[STROOP_CARDS.C.cells[0].ink];
  const hex2rgb = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
  ok("卡片 C 第一格墨色为绿（字义与墨色不同）", colorC === hex2rgb(wantC), `${colorC} vs ${hex2rgb(wantC)}`);
  await page.screenshot({ path: path.join(SHOT, "05-stroop-c-full.png") });
  await stage.screenshot({ path: path.join(SHOT, "05b-stroop-c.png") });

  /* 卡片 C：下方为四色点选，按被试读出的颜色点（不点「读对/读错」） */
  ok("卡片 C 显示四个颜色选项", (await page.locator(".sk-cbtn").count()) === 4, `实际 ${await page.locator(".sk-cbtn").count()}`);
  ok("卡片 C 无「读对/读错」按钮", (await page.locator(".sk-btn.ok").count()) === 0 && (await page.locator(".sk-btn.bad").count()) === 0);

  const cCells = STROOP_CARDS.C.cells;
  let semantic = 0;
  for (let i = 0; i < cCells.length; i++) {
    const c = cCells[i];
    /* 前 40 格点正确墨色；后 10 格故意点字义（字义≠墨色即为「读成字义」） */
    let pick;
    if (i < 40) pick = c.ink;
    else if (c.w !== c.ink) pick = c.w;
    else pick = COLOR_IDX.find((x) => x !== c.ink);
    /* 「读成字义」只算真冲突格（字义 ≠ 墨色）；字义本＝墨色的格子无法区分，不计 */
    if (c.w !== c.ink && pick === c.w) semantic++;
    await page.locator(".sk-cbtn").nth(COLOR_IDX.indexOf(pick)).click();
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(400);
  const resC = (await page.locator(".sk-res").innerText()).replace(/\s+/g, " ");
  ok("卡片 C 结算：正确 40 / 错误 10", /正确数\s*40/.test(resC) && /错误数\s*10/.test(resC), resC);
  const panel3 = await panelText();
  ok("本题评分显示「读成字义」次数", new RegExp("读成字义\\s*" + semantic).test(panel3), panel3.slice(-160));
  ok("本题评分给出 SIE耗时数 / SIE准确数", /SIE耗时数/.test(panel3) && /SIE准确数/.test(panel3), panel3.slice(-120));
  await stage.screenshot({ path: path.join(SHOT, "06-stroop-c-done.png") });
  await page.screenshot({ path: path.join(SHOT, "06b-stroop-c-done-full.png") });

  await page.locator(".sk-next").click();
  await page.waitForTimeout(2500);
}

await browser.close();

/* ---------- 复核 ---------- */
const Database = require("better-sqlite3");
const _db = new Database(path.join(__dir, "../data/hscrt01.db"), { readonly: true });
const readDetail = (id) => _db.prepare("SELECT payload, raw FROM assess_detail WHERE record_id=? AND code=?").get(id, "STROOP");

const rv = (await get(`/assessments/${rid}/review`)).data;
const pj = rv.projects.find((p) => p.code === "STROOP");
ok("评分页只有 1 题（本题评分单列）", !!pj && pj.items.length === 1, pj ? `items=${pj.items.length}` : "无");
if (pj) {
  ok("本题满分 = 50", Number(pj.max) === 50, `max=${pj.max}`);
  ok("得分预填 = 卡片 C 正确数 40", Number(pj.items[0].score) === 40, `score=${pj.items[0].score}`);
  ok("题干标明取卡片 C 正确数", /卡片 C 正确数/.test(pj.items[0].parts?.[0]?.l || JSON.stringify(pj.items[0])), JSON.stringify(pj.items[0]).slice(0, 120));
}
const ans = (await get(`/assessments/${rid}/answers?code=STROOP`)).data || {};
ok("作答留存三卡的正确/错误数", ans.SA && ans.SB && ans.SC
  && ans.SA.ok === 48 && ans.SA.bad === 2 && ans.SB.ok === 50 && ans.SC.ok === 40 && ans.SC.bad === 10,
  JSON.stringify({ A: ans.SA, B: ans.SB, C: ans.SC }));

const det = readDetail(rid);
const payload = det ? JSON.parse(det.payload || "{}") : null;
ok("detail 已生成", !!payload, det ? "有" : "无");
if (payload) {
  const ind = (payload.ind || []).reduce((a, x) => (a[x.k] = x.v, a), {});
  const mt = JSON.stringify(payload.metrics || {});
  ok("指标含三卡用时与正确数", /卡片 A 用时/.test(mt) && /卡片 C 正确数/.test(mt), mt.slice(0, 160));
  ok("A 正确数 = 48 / 50", ind["卡片 A 正确数"] === "48 / 50", ind["卡片 A 正确数"]);
  ok("B 正确数 = 50 / 50", ind["卡片 B 正确数"] === "50 / 50", ind["卡片 B 正确数"]);
  ok("C 正确数 = 40 / 50", ind["卡片 C 正确数"] === "40 / 50", ind["卡片 C 正确数"]);
  ok("SIE耗时数 = C − B", /^[+-]?\d+ 秒$/.test(String(ind["SIE耗时数"])), ind["SIE耗时数"]);
  ok("SIE准确数 = C − B = −10 个", ind["SIE准确数"] === "-10 个", ind["SIE准确数"]);
  ok("指标含「C 读成字义」次数", /^\d+ 次$/.test(String(ind["C 读成字义"])), ind["C 读成字义"]);
  ok("判读：评分 40 > 39 正常", /评分 40 > 39/.test(String(ind["评分与判读"])), ind["评分与判读"]);
  ok("不再出现「卡片 A 25 分」这类错标", !/卡片\s*[ABC]\s*-?\d+\s*分/.test(mt), mt.slice(0, 160));
  /* 认知域得分不能按「用时/满分」算（那会测得越快分越低），按卡片 C 正确率 40/50 = 80 */
  ok("认知域得分按卡片 C 正确率 = 80", Number(payload.domainScore) === 80, `domainScore=${payload.domainScore}`);
}

const done = await post(`/assessments/${rid}/complete-review`, {});
ok("提交并生成报告", done.code === 0, done.message);
if (done.code === 0) {
  const rep = (await get(`/reports/${done.data.reportId}`)).data;
  const row = (rep.chart || []).find((c) => /STROOP|色词|Stroop/.test(c.name || ""));
  const mt = JSON.stringify((row && row.metrics) || []);
  ok("报告列出三卡指标", /卡片 A 用时/.test(mt) && /卡片 C 正确数/.test(mt), mt.slice(0, 160));
  ok("报告保留 SIE 与判读", /SIE耗时数/.test(mt) && /评分与判读/.test(mt), mt.slice(0, 200));
}

/* ---------- 清理 ---------- */
const db = new Database(path.join(__dir, "../data/hscrt01.db"));
const purge = db.transaction((id) => {
  ["report", "assess_detail", "assess_score", "assess_answer"].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE record_id=?`).run(id));
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
});
const row = db.prepare("SELECT id, plan_name FROM assess_record WHERE id=?").get(rid);
if (row && row.plan_name === "Stroop 色词校验（临时）") purge(rid);
db.close();
_db.close();
console.log(`\n清理临时评估 #${rid}`);
console.log(bad.length ? `\n✗ ${bad.length} 项未通过：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
