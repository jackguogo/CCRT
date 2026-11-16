/**
 * 第 67 轮：MMSE 按指南还原为「主试口述 + 逐题评分」
 * 校验：
 *   1) 施测页只有指导语，无麦克风 / 填空 / 图片 / 折纸 / 画布等患者交互
 *   2) 右侧主试面板给出施测操作、注意与分档评分；未评分不能进入下一题
 *   3) 19 题逐题评分 → 完成评估 → 核对全部题目与评分 → 确认生成报告
 *   4) 评分落库口径：19 条 assess_score、明细合计 = 逐题之和、报告一致
 * 运行：Node 22（Playwright），工作目录 = HS-CRT-01-体验版/
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const NODE20 = "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node";
const OUT = "docs/shots-r67";
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

const pats = (await get("/patients")).data.list || (await get("/patients")).data;
const running = new Set(((await get("/assessments")).data || []).filter(a => a.status === "进行中").map(a => a.patient_id));
const target = pats.find(p => !running.has(p.id));
if (!target) { console.log("没有可用患者"); process.exit(1); }

const mk = await post("/assessments", {
  patientId: target.id, planName: "MMSE 指南还原校验（临时）", planId: 0,
  items: [{ type: "scale", code: "MMSE", name: "简易精神状态量表（MMSE）" }], mode: "doctor",
});
if (mk.code !== 0) { console.log("创建临时评估失败", mk.message); process.exit(1); }
const rid = mk.data.recordId;
console.log(`临时评估 #${rid} · ${target.name}（p${target.id}）\n`);

const DB = path.resolve("data/hscrt01.db");
const dbOne = (sql) => execFileSync(NODE20, ["-e",
  `const D=require("better-sqlite3");const db=new D(${JSON.stringify(DB)},{readonly:true});process.stdout.write(JSON.stringify(db.prepare(${JSON.stringify(sql)}).all()));db.close();`
], { encoding: "utf8" }).trim();
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
const extra = [];

/* 逐题评分：Q01–Q10 各 1 分、Q11=3、Q12=4、Q13=2、Q14=1、Q15=1、Q16=2、Q17=1、Q18=1、Q19=2，合计 27 */
const SCORES = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 4, 2, 1, 1, 2, 1, 1, 2];

try {
  const browser = await chromium.launch({ headless: true, executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="工号账号"]', "doctor");
  await page.fill('input[placeholder="密码"]', "hs123456");
  await page.click("button:has-text('登 录')");
  await page.waitForSelector(".lb-banner");
  await page.goto(`http://localhost:3211/doctor?run=${rid}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const box = page.locator(".el-message-box:visible").first();
  if (await box.count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }

  await page.locator("button:visible", { hasText: "开始评估" }).first().click();
  await page.waitForSelector(".quiz-mask.quiz-examiner");
  await page.waitForTimeout(500);

  /* ---------- 1. 第一题：只有指导语，无任何患者交互 ---------- */
  const q1 = await page.evaluate(() => ({
    say: (document.querySelector(".qx-say") || {}).innerText || "",
    head: (document.querySelector(".qx-phd") || {}).innerText || "",
    op: (document.querySelector(".qx-tx") || {}).innerText || "",
    bands: [...document.querySelectorAll(".qx-band")].map(b => b.innerText.replace(/\n/g, "|")),
    score: (document.querySelector(".qx-score-hd b") || {}).innerText || "",
    mic: document.querySelectorAll(".quiz-mic").length,
    input: document.querySelectorAll(".quiz-input").length,
    pics: document.querySelectorAll(".quiz-pics").length,
    paper: document.querySelectorAll(".paper-wrap").length,
    canvas: document.querySelectorAll("canvas").length,
    card: document.querySelectorAll(".quiz-card").length,
    fig: document.querySelectorAll(".quiz-fig").length,
    emoji: /[\u{1F300}-\u{1FAFF}]/u.test(document.querySelector(".quiz-mask").innerText),
  }));
  ok("进入主试施测版式", !!q1.say, q1.head.replace(/\n/g, " · "));
  ok("指导语与指南一致（今年的年份？）", q1.say.trim() === "今年的年份？", q1.say.trim());
  ok("右侧给出客观施测操作", q1.op.indexOf("只问一遍") >= 0, q1.op.slice(0, 30));
  ok("分档评分按指南给出（1 / 0）", q1.bands.length === 2 && q1.bands[0].startsWith("1|"), q1.bands.join("  "));
  ok("未评分时显示未评分", q1.score.indexOf("未评分") === 0, q1.score);
  ok("无麦克风", q1.mic === 0);
  ok("无填空输入框", q1.input === 0);
  ok("无图片刺激", q1.pics === 0 && q1.card === 0);
  ok("无折纸拖拽", q1.paper === 0);
  ok("无画布", q1.canvas === 0 && q1.fig === 0);
  ok("界面无 emoji", !q1.emoji);
  await page.screenshot({ path: `${OUT}/01-mmse-q01.png` });

  /* ---------- 2. 未评分不能进入下一题 ---------- */
  await page.click(".quiz-foot .quiz-btn.primary");
  await page.waitForTimeout(400);
  const guard = await page.evaluate(() => ({
    head: (document.querySelector(".qx-phd") || {}).innerText || "",
    toast: [...document.querySelectorAll(".el-message")].map(m => m.innerText.trim()).join(" | "),
  }));
  ok("未评分时拦下并提示", guard.head.indexOf("第 1 / 19") >= 0 && /评分/.test(guard.toast), guard.toast || "无提示");

  /* ---------- 3. 中途退出 → 继续评估：分数保留、定位到未评分题 ---------- */
  const pick = async (v) => {
    const btns = page.locator(".qx-band");
    const n = await btns.count();
    for (let i = 0; i < n; i++) {
      const t = (await btns.nth(i).locator("i").innerText()).trim();
      if (Number(t) === v) { await btns.nth(i).click(); return true; }
    }
    return false;
  };
  await pick(1);
  await page.waitForTimeout(250);
  await page.click(".quiz-quit");
  await page.waitForTimeout(400);
  await page.click(".el-message-box button:has-text('确认退出')");
  await page.waitForTimeout(1200);
  await page.locator("button:visible", { hasText: "继续评估" }).first().click();
  await page.waitForSelector(".quiz-mask.quiz-examiner");
  await page.waitForTimeout(500);
  const resume = await page.evaluate(() => (document.querySelector(".qx-phd") || {}).innerText || "");
  ok("继续评估定位到第 2 题", /第 2 \/ 19/.test(resume), resume.replace(/\n/g, " "));
  await page.click(".quiz-foot .quiz-btn:not(.primary)");
  await page.waitForTimeout(300);
  const backScore = await page.evaluate(() => (document.querySelector(".qx-score-hd b") || {}).innerText || "");
  ok("退出后已评分数保留", backScore.indexOf("1 分") === 0, backScore);
  await page.click(".quiz-foot .quiz-btn.primary");
  await page.waitForTimeout(300);

  /* ---------- 4. 逐题评分 ---------- */
  let allPicked = true;
  const shots = { 11: "02-mmse-q11.png", 13: "03-mmse-q13.png", 16: "04-mmse-q16.png", 18: "05-mmse-q18.png" };
  for (let i = 1; i < SCORES.length; i++) {
    const no = i + 1;
    if (!(await pick(SCORES[i]))) { allPicked = false; console.log(`  ! 第 ${no} 题无 ${SCORES[i]} 分档`); }
    if (shots[no]) {
      await page.waitForTimeout(200);
      const info = await page.evaluate(() => ({
        say: (document.querySelector(".qx-say") || {}).innerText || "",
        mic: document.querySelectorAll(".quiz-mic").length,
        pics: document.querySelectorAll(".quiz-pics").length,
        paper: document.querySelectorAll(".paper-wrap").length,
        fig: document.querySelectorAll(".qx-fig svg").length,
      }));
      ok(`第 ${no} 题只呈现指导语`, info.mic === 0 && info.pics === 0 && info.paper === 0, info.say.slice(0, 34).replace(/\n/g, " "));
      if (no === 18) ok("第 18 题带双五边形原图", info.fig === 1, `${info.fig} 个图形`);
      await page.screenshot({ path: `${OUT}/${shots[no]}` });
    }
    if (no < SCORES.length) {
      await page.click(".quiz-foot .quiz-btn.primary");
      await page.waitForTimeout(150);
    }
  }
  ok("19 题逐题评分完成", allPicked);
  const lastBtn = (await page.locator(".quiz-foot .quiz-btn.primary").innerText()).trim();
  ok("最后一题按钮为「完成评估」", lastBtn === "完成评估", lastBtn);

  /* ---------- 4. 完成评估 → 核对全部题目与评分 ---------- */
  await page.click(".quiz-foot .quiz-btn.primary");
  await page.waitForSelector(".qp-dialog", { state: "visible" });
  await page.waitForTimeout(400);
  const prev = await page.evaluate(() => ({
    title: (document.querySelector(".qp-dialog .el-dialog__title") || {}).innerText || "",
    rows: [...document.querySelectorAll(".qp-row")].map(r => ({
      no: (r.querySelector(".qp-no") || {}).innerText,
      s: (r.querySelector(".qp-s") || {}).innerText.replace(/\s/g, ""),
    })),
    sum: (document.querySelector(".qp-sum") || {}).innerText || "",
    total: (document.querySelector(".qp-sum b") || {}).innerText || "",
  }));
  ok("打开完成前核对弹窗", /完成评估前核对/.test(prev.title), prev.title);
  ok("核对列出全部 19 题", prev.rows.length === 19, `${prev.rows.length} 行`);
  ok("核对合计 = 27 / 30", prev.total === "27" && /30/.test(prev.sum), prev.sum.replace(/\n/g, " "));
  const got = prev.rows.map(r => Number(String(r.s).split("/")[0]));
  ok("逐题分值与所选一致", JSON.stringify(got) === JSON.stringify(SCORES), got.join(","));
  console.log("  逐题：", prev.rows.map(r => `${r.no}:${r.s}`).join(" "));
  await page.screenshot({ path: `${OUT}/06-mmse-preview.png` });

  /* ---------- 5. 返回修改 → 回到最后一题，分数保留 ---------- */
  await page.click(".qp-dialog .el-dialog__footer button:has-text('返回修改')");
  await page.waitForTimeout(500);
  const backInfo = await page.evaluate(() => ({
    on: !!document.querySelector(".quiz-mask.quiz-examiner"),
    head: (document.querySelector(".qx-phd") || {}).innerText || "",
    score: (document.querySelector(".qx-score-hd b") || {}).innerText || "",
  }));
  ok("核对后可返回修改", backInfo.on && /第 19 \/ 19/.test(backInfo.head), backInfo.head.replace(/\n/g, " "));
  ok("返回后本题分数保留", backInfo.score.indexOf("2 分") === 0, backInfo.score);
  await page.click(".quiz-foot .quiz-btn.primary");
  await page.waitForSelector(".qp-dialog", { state: "visible" });
  await page.waitForTimeout(300);

  /* ---------- 6. 确认完成 → 生成报告 ---------- */
  await page.click(".qp-dialog .el-dialog__footer button:has-text('确认完成')");
  await page.waitForTimeout(2200);
  const rep = await page.evaluate(() => ({
    view: document.body.innerText.indexOf("本报告仅供医疗专业人员参考") >= 0,
    txt: document.body.innerText.replace(/\s+/g, " ").slice(0, 400),
  }));
  ok("确认后生成并打开报告", rep.view, rep.txt.slice(0, 60));
  await page.screenshot({ path: `${OUT}/07-mmse-report.png` });
  ok("浏览器控制台无错误", errors.length === 0, errors.slice(0, 4).join(" | ") || "none");

  /* 方案项目表：主试量表的进度按已评分题数显示 */
  await page.goto(`http://localhost:3211/doctor?run=${rid}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const prog = await page.evaluate(() => {
    const el = document.querySelector(".qstat");
    return el ? el.innerText.replace(/\s+/g, " ").trim() : "";
  });
  ok("主试量表显示评分进度 19/19", /评分进度/.test(prog) && /19\/19/.test(prog), prog);

  /* ---------- 7. 评分页「保存评分」返回方案项目表 ---------- */
  // 重新挑一个没有进行中评估的患者：医生可能同时在系统里开着别的评估
  const running2 = new Set(((await get("/assessments")).data || []).filter(a => a.status === "进行中").map(a => a.patient_id));
  const t2 = pats.find(p => !running2.has(p.id)) || target;
  const mk2 = await post("/assessments", {
    patientId: t2.id, planName: "全面评估方案", planId: 0,
    items: [
      { type: "scale", code: "MMSE", name: "简易精神状态量表（MMSE）" },
      { type: "scale", code: "MoCA", name: "蒙特利尔认知评估量表（MoCA）" },
    ], mode: "doctor",
  });
  if (!mk2.data) { ok("创建第二个临时评估", false, mk2.message); throw new Error("无法创建第二个临时评估：" + mk2.message); }
  const rid2 = mk2.data.recordId;
  extra.push(rid2);
  const rv2 = (await get(`/assessments/${rid2}/review`)).data;
  const pj2 = rv2.projects.find(x => x.code === "MMSE");
  const sc2 = {};
  pj2.items.forEach(i => { sc2[i.id] = i.max; });
  await post(`/assessments/${rid2}/review-scores`, { code: "MMSE", scores: sc2 });
  await post(`/assessments/${rid2}/record-item`, { code: "MMSE" });
  await post(`/assessments/${rid2}/record-item`, { code: "MoCA" });
  await page.goto(`http://localhost:3211/doctor?run=${rid2}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.locator("button:visible", { hasText: "评分并提交" }).first().click();
  await page.waitForTimeout(1300);
  await page.locator("button:visible", { hasText: "保存评分" }).first().click();
  await page.waitForTimeout(1100);
  const backRun = await page.evaluate(() => ({
    run: !!document.querySelector(".item-card"),
    head: (document.querySelector(".ph-d") || {}).innerText || "",
    review: !!document.querySelector(".rv-page"),
  }));
  ok("保存评分后返回方案项目表", backRun.run && !backRun.review && /全面评估方案/.test(backRun.head),
    backRun.head.split("·")[0].trim() || "未返回");
  await page.screenshot({ path: `${OUT}/08-after-save.png` });

  /* ---------- 6. 落库口径 ---------- */
  const sc = JSON.parse(dbOne(`SELECT item_id,score FROM assess_score WHERE record_id=${rid} ORDER BY item_id`));
  ok("评分落库 19 条", sc.length === 19, `${sc.length} 条`);
  const sum = sc.reduce((a, r) => a + r.score, 0);
  ok("评分合计 27", sum === 27, `实际 ${sum}`);
  const det = JSON.parse(dbOne(`SELECT payload FROM assess_detail WHERE record_id=${rid} AND code='MMSE'`))[0];
  const pl = JSON.parse(det.payload);
  ok("明细按评分生成（非仅记录作答）", !pl.recordOnly, pl.recordOnly ? "recordOnly" : "scored");
  ok("明细总分 27 / 30", pl.total === 27 && pl.max === 30, `${pl.total}/${pl.max}`);
  const repRow = JSON.parse(dbOne(`SELECT chart FROM report WHERE record_id=${rid}`))[0];
  const chart = repRow ? JSON.parse(repRow.chart) : [];
  const mmseRow = chart.find(c => /MMSE/.test(c.name || ""));
  ok("报告记录 27 / 30", mmseRow && mmseRow.total === 27 && mmseRow.max === 30,
    mmseRow ? `${mmseRow.total}/${mmseRow.max} ${mmseRow.verdict || ""}` : "无该项");

  await browser.close();
} finally {
  purge(rid);
  extra.forEach(purge);
}

console.log(bad.length ? `\n✗ 失败 ${bad.length} 项：${bad.join(" / ")}` : "\n✓ 全部通过");
process.exit(bad.length ? 1 : 0);
