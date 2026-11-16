/**
 * 第 105 轮核对：画钟测验（CDT）画布清除 + 六种评分法 + 逐项勾选本题评分
 *
 * 用法：先起临时实例
 *   PORT_ADMIN=3220 PORT_DOCTOR=3221 PORT_PATIENT=3222 ~/.nvm/versions/node/v20.19.6/bin/node server/index.js
 * 再跑：node scripts/shot-r105.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const require = createRequire(import.meta.url);
const { CDT_SCALES } = require("../server/cdt-data.js");
const PORT = process.env.PORT_DOCTOR || 3221;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const WEB = `http://127.0.0.1:${PORT}`;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dir, "../docs/shots-r105");
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

const PLAN = "画钟评分法核对（临时）";
const mk = await post("/assessments", {
  patientId: target.id, planName: PLAN, planId: 0,
  items: [{ type: "paradigm", code: "CDT", name: "画钟测验（CDT）" }], mode: "doctor",
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

await page.goto(`${WEB}/doctor?run=${rid}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1100);
await page.locator("button:has-text('开始评估')").first().click();
await page.waitForTimeout(900);

const aside = page.locator("aside.qx-panel");

/* ---- 1. 右侧评分法 ---- */
const mths = aside.locator(".cd-mth");
const mn = await mths.count();
ok("右侧评分法共 6 种", mn === 6, `n=${mn}`);
const mlabels = [];
for (let i = 0; i < mn; i++) mlabels.push(flat(await mths.nth(i).innerText()));
ok("评分法为 3/4/5/7/10/30 分法",
  /^3 分/.test(mlabels[0]) && /^4 分/.test(mlabels[1]) && /^5 分/.test(mlabels[2])
  && /^7 分/.test(mlabels[3]) && /^10 分/.test(mlabels[4]) && /^30 分/.test(mlabels[5]), mlabels.join(" | "));
const onText = flat(await aside.locator(".cd-mth.on").first().innerText());
ok("默认选中 10 分评分法", /^10 分/.test(onText), onText);
const asideText = flat(await aside.innerText());
ok("评估操作写明「先选评分法再逐项勾选」", /先选评分法/.test(asideText), "");
ok("评估操作不再写「给出 0–10 分」", !/给出\s*0–10 分/.test(asideText), "");

/* ---- 2. 10 分法：3 项 / 满分 10 ---- */
const items10 = await aside.locator(".cd-it").count();
ok("10 分法 3 个评分项", items10 === 3, `n=${items10}`);
ok("10 分法满分显示 0 / 10", flat(await aside.locator(".cd-score-sec .qx-score-hd").innerText()).includes("0 / 10"),
  flat(await aside.locator(".cd-score-sec .qx-score-hd").innerText()));
/* 勾「画好一个封闭的圆 2 分」 */
await aside.locator(".cd-it").first().click();
await page.waitForTimeout(150);
ok("勾选后得分 2 / 10", flat(await aside.locator(".cd-score-sec .qx-score-hd").innerText()).includes("2 / 10"),
  flat(await aside.locator(".cd-score-sec .qx-score-hd").innerText()));

/* ---- 3. 切换到 30 分法：14 项 / 满分 30，勾选状态互不影响 ---- */
await mths.nth(5).click();
await page.waitForTimeout(200);
const items30 = await aside.locator(".cd-it").count();
ok("30 分法 14 个评分项", items30 === 14, `n=${items30}`);
ok("切到 30 分法后得分清零 0 / 30", flat(await aside.locator(".cd-score-sec .qx-score-hd").innerText()).includes("0 / 30"),
  flat(await aside.locator(".cd-score-sec .qx-score-hd").innerText()));
const sum30 = CDT_SCALES.find((s) => s.k === "s30").items.reduce((a, it) => a + it.pts, 0);
ok("30 分法各项分值合计 = 30", sum30 === 30, `sum=${sum30}`);
/* 勾前 3 项（4+4+3=11） */
for (const i of [0, 1, 2]) { await aside.locator(".cd-it").nth(i).click(); await page.waitForTimeout(60); }
ok("勾 3 项后 11 / 30", flat(await aside.locator(".cd-score-sec .qx-score-hd").innerText()).includes("11 / 30"),
  flat(await aside.locator(".cd-score-sec .qx-score-hd").innerText()));

/* ---- 4. 7 分法：错误计分，判读文案 ---- */
await mths.nth(3).click();
await page.waitForTimeout(180);
const items7 = await aside.locator(".cd-it").count();
ok("7 分法 4 个象限项", items7 === 4, `n=${items7}`);
const rule7 = flat(await aside.locator(".cd-rule").innerText());
ok("7 分法判读为「得分越高…≤ 3 分为正常」", /得分越高/.test(rule7) && /≤ 3 分/.test(rule7), rule7);
await aside.locator(".cd-it").nth(3).click();
await page.waitForTimeout(120);
ok("勾第四象限（4 分）得 4 / 7", flat(await aside.locator(".cd-score-sec .qx-score-hd").innerText()).includes("4 / 7"),
  flat(await aside.locator(".cd-score-sec .qx-score-hd").innerText()));
await aside.locator(".cd-it").nth(3).click();
await page.waitForTimeout(120);

/* 回到 30 分法，勾 11 分留着下结论 */
await mths.nth(5).click();
await page.waitForTimeout(180);
await aside.screenshot({ path: path.join(SHOT, "01-aside-30.png") });
await page.screenshot({ path: path.join(SHOT, "02-full-30.png") });

/* ---- 5. 画布：画两笔 → 清除一次剩 1 笔 ---- */
const cv = page.locator("canvas.quiz-canvas");
const box = await cv.boundingBox();
const drawStroke = async (dx) => {
  await page.mouse.move(box.x + 120 + dx, box.y + 90);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 120 + dx + i * 9, box.y + 90 + Math.sin(i / 2) * 20);
  await page.mouse.up();
};
await drawStroke(0);
await drawStroke(80);
await page.waitForTimeout(200);
const tip2 = flat(await page.locator(".quiz-cleartip").innerText());
ok("画两笔后提示「已画 2 笔」", /已画 2 笔/.test(tip2), tip2);
const clearBtn = page.locator(".quiz-clear");
ok("清除按钮可用", !(await clearBtn.isDisabled()), "");
await clearBtn.click();
await page.waitForTimeout(200);
const tip1 = flat(await page.locator(".quiz-cleartip").innerText());
ok("点一次清除后剩 1 笔", /已画 1 笔/.test(tip1), tip1);
await clearBtn.click();
await page.waitForTimeout(200);
ok("再点一次清除后无笔画、按钮禁用",
  /还没有笔画/.test(flat(await page.locator(".quiz-cleartip").innerText())) && await clearBtn.isDisabled(), "");
await drawStroke(0);
await page.waitForTimeout(150);
await page.locator(".quiz-draw").screenshot({ path: path.join(SHOT, "03-canvas-clear.png") });

/* ---- 6. 完成 → 落库：满分 30、得分 11 ---- */
await page.locator("button:has-text('完成')").last().click();
await page.waitForTimeout(1600);
const rv = await get(`/assessments/${rid}/review`);
const pj = (rv.data.projects || []).find((p) => p.code === "CDT");
ok("评分页取到画钟项目", !!pj, "");
if (pj) {
  const row = pj.items[0];
  ok("评分页满分随评分法变 30", row.max === 30, `max=${row.max}`);
  ok("评分页预填本题得分 11", Number(row.score) === 11, `score=${row.score}`);
  ok("评分要点写明所用评分法与判读", /30 分评分法/.test(row.n) && /19/.test(row.n), row.n);
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
if (row && row.plan_name === PLAN) purge(rid);
db.close();
console.log(`\n清理临时评估 #${rid}`);
console.log(bad.length ? `\n✗ ${bad.length} 项未通过：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
