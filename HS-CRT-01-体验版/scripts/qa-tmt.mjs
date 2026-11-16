/**
 * 第 98 轮验证：连线测试（TMT-A/B）按记录单整表重做
 *
 * 用法：先起临时实例
 *   PORT_ADMIN=3220 PORT_DOCTOR=3221 PORT_PATIENT=3222 \
 *   "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node" server/index.js
 * 再跑：node scripts/qa-tmt.mjs
 *
 * 覆盖：A 练习（8 点，含错点提示）→ A 测试（25 点，含 1 次忽略错误 + 1 次连接错误）
 *      → B 练习（8 点）→ B 测试（25 点）→ 完成并记录 → 复核 detail 指标 → 提交出报告
 *      → 清理临时评估
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const require = createRequire(import.meta.url);
const { TMT_BOARDS } = require("../server/tmt-data.js");

const PORT = process.env.PORT_DOCTOR || 3221;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const WEB = `http://127.0.0.1:${PORT}`;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dir, "../docs/shots-r98");
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
/* 认知域得分要按年龄×学历分层临界值折算，挑一个落在记录单分层区间（55–98 岁）里的患者，
   否则 band 为空会回落到「得分/满分」，断言无法验证分层口径 */
const ageOf = (bd) => {
  if (!bd) return null;
  const b = new Date(String(bd).slice(0, 10)), t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const dm = t.getMonth() - b.getMonth();
  if (dm < 0 || (dm === 0 && t.getDate() < b.getDate())) a--;
  return a > 0 && a < 130 ? a : null;
};
const free = pats.filter((p) => !running.has(p.id));
const target = free.find((p) => { const a = ageOf(p.birth_date); return a != null && a >= 55 && a <= 98; }) || free[0];
if (!target) { console.log("没有可用患者"); process.exit(1); }
console.log(`临时患者：${target.name}（p${target.id}，${target.education || "学历未记"}，生日 ${target.birth_date || "未记"}）`);

const mk = await post("/assessments", {
  patientId: target.id, planName: "TMT 连线校验（临时）", planId: 0,
  items: [{ type: "paradigm", code: "TMT", name: "连线测试（TMT-A/B）" }], mode: "doctor",
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

const stage = page.locator(".tm-body");
const hasStage = (await stage.count()) > 0;
ok("进入 TMT 施测界面", hasStage, hasStage ? "" : (await page.locator("body").innerText()).slice(0, 200).replace(/\s+/g, " "));

/* 按标签点圆圈（坐标取自 SVG 实际渲染位置，模拟被试点纸面） */
const nodeXY = async (label) => page.evaluate((lb) => {
  const g = [...document.querySelectorAll(".tm-node")]
    .find((el) => (el.querySelector("text") || {}).textContent.trim() === lb);
  if (!g) return null;
  const r = g.querySelector(".tm-cir").getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, label);
const tap = async (label, wait = 90) => {
  const p = await nodeXY(label);
  if (!p) throw new Error("找不到节点 " + label);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(wait);
};
const nodesCount = () => page.locator(".tm-node").count();
const tipText = async () => (await page.locator(".tm-tip").innerText().catch(() => "")).trim();
const resText = async () => (await page.locator(".tm-res").innerText().catch(() => "")).replace(/\s+/g, " ");

if (hasStage) {
  /* ---------- A 部分练习 ---------- */
  ok("笔头标签为「A 部分 · 练习」", /A 部分 · 练习/.test(await page.locator(".tm-tag").innerText()));
  ok("A 练习 8 个节点", (await nodesCount()) === 8, `实际 ${await nodesCount()}`);
  ok("纸面有 Begin / End 标注", (await page.locator(".tm-lb").count()) === 2);
  await stage.screenshot({ path: path.join(SHOT, "01-tmt-a-practice.png") });
  await page.screenshot({ path: path.join(SHOT, "00-tmt-full.png") });

  /* 故意点错（该连 1，点 4）：练习只提示、不计数 */
  await tap("4");
  ok("练习点错有提示（应连 1）", /应该连「1」/.test(await tipText()), await tipText());
  /* 练习阶段的错误不进「本题评分」：A 部分在正式测试前应显示「—」，且练习卡里错误数为 0 */
  const strip = (await page.locator(".tm-score").innerText()).replace(/\s+/g, " ");
  ok("练习阶段不计入本题评分（A 部分仍为 —）", /A 部分\s*完成时间\s*—/.test(strip), strip);
  await stage.screenshot({ path: path.join(SHOT, "02-tmt-practice-wrong.png") });

  /* 顺序点完 1–8 */
  for (const k of TMT_BOARDS.A_prac.seq) await tap(k);
  ok("A 练习完成后出结算卡", (await page.locator(".tm-res").count()) > 0);
  const pr = await resText();
  ok("练习卡标注「练习不计分」", /练习不计分/.test(pr), pr.slice(0, 60));
  ok("练习下一步按钮为「开始 A 部分测试」", /开始 A 部分测试/.test(pr), pr.slice(0, 80));
  ok("练习也计时（完成时间 > 0 秒）", !/完成时间\s*0\s*秒/.test(pr), pr.slice(0, 60));
  await stage.screenshot({ path: path.join(SHOT, "03-tmt-practice-done.png") });

  /* ---------- A 部分测试 ---------- */
  await page.locator(".tm-next").click();
  await page.waitForTimeout(400);
  ok("进入 A 部分测试", /A 部分 · 测试/.test(await page.locator(".tm-tag").innerText()));
  ok("A 测试 25 个节点", (await nodesCount()) === 25, `实际 ${await nodesCount()}`);
  await stage.screenshot({ path: path.join(SHOT, "04-tmt-a-test.png") });
  await page.screenshot({ path: path.join(SHOT, "04b-tmt-a-test-full.png") });

  await tap("1", 300);
  const clock1 = await page.locator(".tm-clock").innerText();
  await page.waitForTimeout(1200);
  const clock2 = await page.locator(".tm-clock").innerText();
  ok("连到起点后开始计时", clock1 !== clock2, `${clock1} → ${clock2}`);

  /* 跳过 2 去点 3 → 忽略错误 +1；再点一个无关节点 5 → 连接错误 +1 */
  await tap("3");
  ok("跳过应连节点提示「漏掉了」", /漏掉了「2」/.test(await tipText()), await tipText());
  await tap("5");
  ok("点无关节点提示「连错了」", /连错了/.test(await tipText()), await tipText());
  const mid = (await page.locator(".tm-score").innerText()).replace(/\s+/g, " ");
  ok("A 部分计数：连接错误 1、忽略错误 1", /A 部分[\s\S]*连接错误数\s*1[\s\S]*忽略错误数\s*1/.test(mid), mid);
  await stage.screenshot({ path: path.join(SHOT, "05-tmt-a-test-err.png") });

  /* 已连到 1，接着 2..25 */
  for (let i = 2; i <= 25; i++) await tap(String(i), 40);
  ok("A 测试完成后出结算卡", (await page.locator(".tm-res").count()) > 0);
  const ar = await resText();
  ok("A 测试结算卡含完成时间/连接错误/忽略错误", /完成时间/.test(ar) && /连接错误数\s*1/.test(ar) && /忽略错误数\s*1/.test(ar), ar);
  ok("下一步为「进入 B 部分练习」", /进入 B 部分练习/.test(ar), ar.slice(0, 80));
  await stage.screenshot({ path: path.join(SHOT, "06-tmt-a-test-done.png") });

  /* ---------- B 部分练习 ---------- */
  await page.locator(".tm-next").click();
  await page.waitForTimeout(400);
  ok("进入 B 部分练习", /B 部分 · 练习/.test(await page.locator(".tm-tag").innerText()));
  ok("B 练习 8 个节点（4 数字 + 4 字母）", (await nodesCount()) === 8, `实际 ${await nodesCount()}`);
  for (const k of TMT_BOARDS.B_prac.seq) await tap(k);
  ok("B 练习完成后出结算卡", (await page.locator(".tm-res").count()) > 0);
  await stage.screenshot({ path: path.join(SHOT, "07-tmt-b-practice-done.png") });

  /* ---------- B 部分测试 ---------- */
  await page.locator(".tm-next").click();
  await page.waitForTimeout(400);
  ok("进入 B 部分测试", /B 部分 · 测试/.test(await page.locator(".tm-tag").innerText()));
  ok("B 测试 25 个节点（13 数字 + 12 字母）", (await nodesCount()) === 25, `实际 ${await nodesCount()}`);
  ok("B 部分显示剩余秒数", /剩余\s*\d+\s*秒/.test(await page.locator(".tm-left").innerText()));
  await tap("1", 200);
  for (const k of TMT_BOARDS.B_test.seq.slice(1)) await tap(k, 40);
  const br = await resText();
  ok("B 测试完成后出结算卡", (await page.locator(".tm-res").count()) > 0);
  ok("B 测试结算卡含完成时间", /完成时间/.test(br), br.slice(0, 80));
  await stage.screenshot({ path: path.join(SHOT, "08-tmt-b-test-done.png") });

  await page.locator(".tm-next").click();
  await page.waitForTimeout(2500);
}

await browser.close();

const Database = require("better-sqlite3");
const _db = new Database(path.join(__dir, "../data/hscrt01.db"), { readonly: true });
const readDetail = (id) => _db.prepare("SELECT payload, raw FROM assess_detail WHERE record_id=? AND code=?").get(id, "TMT");

/* ---------- 复核：评分页预填 + detail 指标 ---------- */
const rv = (await get(`/assessments/${rid}/review`)).data;
const pj = rv.projects.find((p) => p.code === "TMT");
ok("评分页列出 A/B 两项", !!pj && pj.items.length === 2, pj ? `items=${pj.items.length}` : "无");
if (pj) {
  const sa = Number(pj.items.find((i) => i.id === "TA").score);
  const sb = Number(pj.items.find((i) => i.id === "TB").score);
  ok("A/B 完成时间已预填到评分页", sa > 0 && sb > 0, `A=${sa} B=${sb}`);
  ok("项目满分 = 600（A/B 各 300）", Number(pj.max) === 600, `max=${pj.max}`);
}
const ans = (await get(`/assessments/${rid}/answers?code=TMT`)).data || {};
ok("作答留存 A/B 两部分的错误计数", ans.TA && ans.TB && ans.TA.err === 1 && ans.TA.skip === 1,
  JSON.stringify({ TA: ans.TA, TB: ans.TB }));

const det = readDetail(rid);
const payload = det ? JSON.parse(det.payload || "{}") : null;
ok("detail 已生成", !!payload, det ? "有" : "无");
if (payload) {
  const mt = JSON.stringify(payload.metrics || {});
  const ind = JSON.stringify(payload.ind || []);
  ok("指标含 A/B 完成时间", /A 完成时间/.test(mt) && /B 完成时间/.test(mt), mt.slice(0, 160));
  ok("指标含连接错误数与忽略错误数", /连接错误数/.test(mt) && /忽略错误数/.test(mt), mt.slice(0, 200));
  ok("指标含分层临界值", /分层临界值/.test(ind), ind.slice(0, 200));
  ok("指标含参考判读", /参考判读/.test(ind), ind.slice(0, 200));
  ok("不再出现「A 部分 45 分」这类错标", !/部分\s*-?\d+\s*分/.test(mt), mt.slice(0, 160));
  /* 认知域得分按「临界值/实际用时」：极快的用时按上限 100 计，不会出现「越快分越低」 */
  ok("认知域得分按临界值折算（用时远低于临界值 → 100）", Number(payload.domainScore) === 100, `domainScore=${payload.domainScore}`);
}

/* ---------- 提交并看报告 ---------- */
const done = await post(`/assessments/${rid}/complete-review`, {});
ok("提交并生成报告", done.code === 0, done.message);
if (done.code === 0) {
  const rep = (await get(`/reports/${done.data.reportId}`)).data;
  const row = (rep.chart || []).find((c) => /TMT|连线/.test(c.name || ""));
  const mt = JSON.stringify((row && row.metrics) || []);
  ok("报告列出 TMT 指标", /完成时间/.test(mt), mt.slice(0, 160));
  ok("报告中保留错误数", /连接错误数/.test(mt) && /忽略错误数/.test(mt), mt.slice(0, 200));
}

/* ---------- 清理 ---------- */
const db = new Database(path.join(__dir, "../data/hscrt01.db"));
const purge = db.transaction((id) => {
  ["report", "assess_detail", "assess_score", "assess_answer"].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE record_id=?`).run(id));
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
});
const row = db.prepare("SELECT id, plan_name FROM assess_record WHERE id=?").get(rid);
if (row && row.plan_name === "TMT 连线校验（临时）") purge(rid);
db.close();
_db.close();
console.log(`\n清理临时评估 #${rid}`);
console.log(bad.length ? `\n✗ ${bad.length} 项未通过：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
