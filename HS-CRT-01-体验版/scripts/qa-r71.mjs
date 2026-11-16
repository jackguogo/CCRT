/**
 * 第 71 轮：术语统一「评估」、查看评估展示逐题情况、训练卡片无「效果测试」、CA-01 可完成一关
 * 校验：
 *   1) 评分页未评估项目标「未评估」，全页无「施测」字样
 *   2) 项目表「查看评估」弹窗逐题展示评估情况（与评分页项目详情同构：指导语 / 评估操作 / 评分分档 / 作答）
 *   3) 训练方案 24 张卡片底部无「效果测试」
 *   4) CA-01 信号捕捉：点目标可推进，满 30 个刺激即结算并给出通过判定
 * 运行：Node 22（Playwright），工作目录 = HS-CRT-01-体验版/
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const NODE20 = "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node";
const OUT = "docs/shots-r71";
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
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then(r => r.json());

const DB = path.resolve("data/hscrt01.db");
const purge = (id) => {
  const code = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(DB)});
const id = ${id};
db.transaction((id) => {
  db.prepare("DELETE FROM report WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_detail WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_score WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_answer WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
})(id);
process.stdout.write(String(db.prepare("SELECT COUNT(*) c FROM assess_record WHERE id=?").get(id).c));
db.close();
`;
  const left = execFileSync(NODE20, ["-e", code], { encoding: "utf8" }).trim();
  console.log(left === "0" ? `✓ 临时评估 #${id} 已清理` : `! 临时评估 #${id} 清理失败（剩 ${left}）`);
};

const pats = (await get("/patients")).data.list || (await get("/patients")).data;
const running = new Set(((await get("/assessments")).data || []).filter(a => a.status === "进行中").map(a => a.patient_id));
const target = pats.find(p => !running.has(p.id));
if (!target) { console.log("没有可用患者"); process.exit(1); }

const mk = await post("/assessments", {
  patientId: target.id, planName: "全面评估方案", planId: 0,
  items: [
    { type: "scale", code: "MMSE", name: "简易精神状态量表（MMSE）" },
    { type: "scale", code: "MoCA", name: "蒙特利尔认知评估量表（MoCA）" },
  ], mode: "doctor",
});
if (!mk.data) { console.log("创建临时评估失败", mk.message); process.exit(1); }
const rid = mk.data.recordId;
console.log(`临时评估 #${rid} · ${target.name}（p${target.id}）\n`);

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", e => errs.push(String(e)));

try {
  /* MMSE 全部满分施测，MoCA 留作未评估 */
  const rv = (await get(`/assessments/${rid}/review`)).data;
  const pj = rv.projects.find(x => x.code === "MMSE");
  const sc = {};
  pj.items.forEach(i => { sc[i.id] = i.max; });
  await post(`/assessments/${rid}/review-scores`, { code: "MMSE", scores: sc });
  await post(`/assessments/${rid}/record-item`, { code: "MMSE" });

  await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="工号账号"]', "doctor");
  await page.fill('input[placeholder="密码"]', "hs123456");
  await page.click("button:has-text('登 录')");
  await page.waitForSelector(".lb-banner");

  /* ---------- 1. 术语：未评估 / 无「施测」 ---------- */
  await page.goto(`http://localhost:3211/doctor?run=${rid}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1100);
  const box = page.locator(".el-message-box:visible").first();
  if (await box.count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
  await page.locator("button:visible", { hasText: "评分并提交" }).first().click();
  await page.waitForTimeout(1200);
  const terms = await page.evaluate(() => ({
    todo: [...document.querySelectorAll(".rv-todo")].map(e => e.innerText.trim()),
    text: document.querySelector(".el-main").innerText,
  }));
  ok("未评估项目标「未评估」", terms.todo.length === 1 && terms.todo[0] === "未评估", terms.todo.join(" "));
  ok("评分页无「施测」字样", !/施测/.test(terms.text), (terms.text.match(/.{0,12}施测.{0,12}/) || [""])[0]);
  await page.screenshot({ path: `${OUT}/01-review-terms.png` });

  /* ---------- 2. 查看评估：逐题展示评估情况 ---------- */
  await page.locator(".ph-a button", { hasText: "返回" }).first().click();
  await page.waitForTimeout(1000);
  await page.locator(".item-card button", { hasText: "查看评估" }).first().click();
  await page.waitForTimeout(1000);
  const dlg = await page.evaluate(() => {
    const d = [...document.querySelectorAll(".el-dialog")].find(x => x.offsetParent !== null);
    if (!d) return null;
    const rows = [...d.querySelectorAll(".rv-row")];
    return {
      title: (d.querySelector(".el-dialog__title") || {}).innerText || "",
      head: (d.querySelector(".rv-bar-t") || {}).innerText.replace(/\s+/g, " ").trim(),
      score: (d.querySelector(".rv-pjscore") || {}).innerText.replace(/\s+/g, ""),
      rows: rows.length,
      firstQ: (rows[0] ? rows[0].querySelector(".rv-q") : {}).innerText?.replace(/\s+/g, " ").trim() || "",
      firstScore: (rows[0] ? rows[0].querySelector(".rv-score") : {}).innerText?.replace(/\s+/g, "") || "",
      guideRows: d.querySelectorAll(".rv-guide.say").length,
      opRows: d.querySelectorAll(".rv-guide:not(.say):not(.note)").length,
      bands: d.querySelectorAll(".rv-band").length,
      onBands: d.querySelectorAll(".rv-band.on").length,
      guide: (d.querySelector(".rv-pjguide") || {}).innerText?.replace(/\s+/g, " ") || "",
      text: d.innerText,
    };
  });
  ok("弹窗标题为「评估情况」", dlg && /评估情况/.test(dlg.title), dlg ? dlg.title : "无弹窗");
  ok("列出全部 19 题", dlg && dlg.rows === 19, dlg ? `${dlg.rows} 题` : "");
  ok("每题给出得分", dlg && /1\/1/.test(dlg.firstScore), dlg ? dlg.firstScore : "");
  ok("每题给出评估操作", dlg && dlg.opRows === 19, dlg ? `${dlg.opRows} 条` : "");
  ok("每题给出评分分档且选中项高亮", dlg && dlg.bands > 30 && dlg.onBands >= 19, dlg ? `${dlg.bands} 档 / 选中 ${dlg.onBands}` : "");
  ok("项目级依据与计分说明", dlg && /依据/.test(dlg.guide) && /计分/.test(dlg.guide) && /评估/.test(dlg.guide),
    dlg ? dlg.guide.slice(0, 30) : "");
  ok("弹窗内无「施测」字样", dlg && !/施测/.test(dlg.text));
  await page.screenshot({ path: `${OUT}/02-record-dialog.png` });
  await page.locator(".el-dialog__footer button", { hasText: "关闭" }).first().click();
  await page.waitForTimeout(500);

  /* ---------- 3. 训练方案卡片无「效果测试」 ---------- */
  await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator(".el-menu-item", { hasText: "方案管理" }).first().click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const el = document.getElementById("sec-train"); if (el) el.scrollIntoView({ block: "start" }); });
  await page.waitForTimeout(600);
  const cards = await page.evaluate(() => {
    const cs = [...document.querySelectorAll(".tp-card")];
    return {
      n: cs.length,
      play: document.querySelectorAll(".tp-play").length,
      footText: cs.map(c => (c.querySelector(".tp-foot") || {}).innerText || "").join("").trim(),
      hasText: cs.filter(c => /效果测试/.test(c.innerText)).length,
    };
  });
  ok("训练方案 24 张卡片", cards.n === 24, `${cards.n} 张`);
  ok("卡片无「效果测试」标签", cards.play === 0 && cards.hasText === 0 && cards.footText === "",
    `tp-play ${cards.play} · 含字样 ${cards.hasText}`);
  await page.screenshot({ path: `${OUT}/03-train-cards.png` });

  /* ---------- 4. CA-01 一关可完成 ---------- */
  await page.goto("http://localhost:3211/train/CA-01.html", { waitUntil: "networkidle" });
  await page.click('.chip[data-lv="1"]');
  await page.waitForTimeout(300);
  for (let k = 0; k < 4; k++) {
    if (await page.locator("#go").count()) { await page.click("#go"); await page.waitForTimeout(500); }
    if (await page.locator("#hit").count()) break;
  }
  ok("CA-01 进入刺激呈现", await page.locator("#hit").count() === 1);

  const t0 = Date.now();
  let seen = new Set(), feedbacks = [];
  while (Date.now() - t0 < 90000) {
    if (await page.locator(".settle-stars").count()) break;
    if (await page.locator("#sp [data-n]").count()) { await page.locator("#sp [data-n]").nth(1).click({ timeout: 1500 }).catch(() => {}); continue; }
    const hit = page.locator("#hit");
    if (await hit.count()) {
      const stim = (await page.locator("#sg").innerText()).trim();
      if (stim === "🐱") {
        await hit.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(120);
        const fb = await page.locator("#fb").innerText().catch(() => "");
        if (fb && !feedbacks.includes(fb.trim())) feedbacks.push(fb.trim());
      } else await page.waitForTimeout(900);
    } else await page.waitForTimeout(150);
  }
  const settle = await page.evaluate(() => ({
    stars: (document.querySelector(".settle-stars") || {}).innerText || "",
    rows: [...document.querySelectorAll(".settle-row")].map(r => r.innerText.replace(/\s+/g, " ").trim()),
    title: (document.querySelector(".title-xl") || {}).innerText || "",
    counter: (document.querySelector("#stage") || {}).innerText || "",
  }));
  const acc = (settle.rows.find(r => /正确率/.test(r)) || "").match(/(\d+)%/);
  ok("CA-01 一关可结算", !!settle.stars, settle.title || "未结算");
  ok("命中目标即时反馈", feedbacks.some(f => /命中目标/.test(f)), feedbacks.join(" / "));
  ok("正确率按命中与正确抑制计算（≥80%）", acc && +acc[1] >= 80, acc ? acc[1] + "%" : "无正确率");
  ok("判定为通过", /通过/.test(settle.title), settle.title);
  await page.screenshot({ path: `${OUT}/04-ca01-settle.png` });

  ok("页面无脚本错误", errs.length === 0, errs[0] || "");
} finally {
  await browser.close();
  purge(rid);
}

console.log(`\n${bad.length ? "✗ 未通过 " + bad.length + " 项：" + bad.join("；") : "✓ 全部通过"}`);
process.exit(bad.length ? 1 : 0);
