/**
 * 第 70 轮：评分页改为「整体评分 + 项目折叠」
 * 校验：
 *   1) 评分页无 4 步流程条、无逐项评分提示条
 *   2) 项目默认全部收起，名称栏显示该项目得分
 *   3) 点名称栏展开题目与分数，再点收起
 *   4) 页头按钮为「返回」，点击回到评估项目表可继续施测
 *   5) 吸底条不再显示合计，提交按钮文案为「确认提交」
 * 运行：Node 22（Playwright），工作目录 = HS-CRT-01-体验版/
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const NODE20 = "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node";
const OUT = "docs/shots-r70";
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

const openReviewUI = async (page) => {
  await page.goto(`http://localhost:3211/doctor?run=${rid}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1100);
  const box = page.locator(".el-message-box:visible").first();
  if (await box.count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
  await page.locator("button:visible", { hasText: "评分并提交" }).first().click();
  await page.waitForTimeout(1200);
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", e => errs.push(String(e)));

try {
  /* 只施测 MMSE，MoCA 留作「未完成项目」 */
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
  await openReviewUI(page);
  await page.screenshot({ path: `${OUT}/01-review-collapsed.png` });

  /* 1. 流程条与提示条已移除，页头按钮为「返回」 */
  const shell = await page.evaluate(() => ({
    review: !!document.querySelector(".rv-page"),
    flow: document.querySelectorAll(".flow-path").length,
    tip: !!document.querySelector(".rv-tip"),
    back: [...document.querySelectorAll(".ph-a button")].map(b => b.innerText.trim()),
    sub: (document.querySelector(".ph-d") || {}).innerText || "",
  }));
  ok("进入评分页", shell.review);
  ok("无 4 步流程条", shell.flow === 0, `flow-path ${shell.flow} 个`);
  ok("无逐项评分提示条", !shell.tip);
  ok("页头按钮为「返回」", shell.back.length === 1 && shell.back[0] === "返回", shell.back.join(" / "));
  ok("页头项目数按方案计（含未施测）", /共\s*2\s*项/.test(shell.sub.replace(/\s+/g, " ")), shell.sub.replace(/\s+/g, " "));

  /* 2. 项目默认收起，名称栏显示得分 */
  const bars = await page.evaluate(() => [...document.querySelectorAll(".rv-card")].map(c => {
    const bar = c.querySelector(".rv-bar");
    const body = c.querySelector(".rv-body");
    return {
      code: (c.querySelector(".rv-bar-t") || {}).innerText || "",
      score: (c.querySelector(".rv-pjscore") || {}).innerText || "",
      todo: !!c.querySelector(".rv-todo"),
      expanded: bar ? bar.getAttribute("aria-expanded") : null,
      bodyVisible: body ? body.offsetParent !== null : null,
    };
  }));
  ok("方案项目全部列出（2 项）", bars.length === 2, bars.map(b => b.code.split(" ")[0]).join(" + "));
  ok("未评估项目带「未评估」标记", bars.filter(b => b.todo).length === 1 && /MoCA/.test(bars.find(b => b.todo).code),
    bars.filter(b => b.todo).map(b => b.code.split(" ")[0]).join(" "));
  ok("项目默认收起", bars.every(b => b.expanded === "false" && b.bodyVisible === false),
    bars.map(b => `${b.code.split(" ")[0]}:${b.expanded}/${b.bodyVisible}`).join(" "));
  ok("名称栏显示项目得分", bars.every(b => /\d+\s*\/\s*\d+/.test(b.score.replace(/\s+/g, " "))),
    bars.map(b => b.code.split(" ")[0] + " " + b.score.replace(/\s+/g, "")).join(" · "));

  /* 3. 点名称栏展开 → 再点收起 */
  await page.locator(".rv-card .rv-bar").first().click();
  await page.waitForTimeout(420);
  const opened = await page.evaluate(() => {
    const c = document.querySelector(".rv-card");
    return {
      expanded: c.querySelector(".rv-bar").getAttribute("aria-expanded"),
      rows: c.querySelectorAll(".rv-row").length,
      bands: c.querySelectorAll(".rv-band").length,
      bodyVisible: c.querySelector(".rv-body").offsetParent !== null,
    };
  });
  ok("点击名称栏展开题目与分数", opened.expanded === "true" && opened.bodyVisible === true);
  ok("展开后列出全部 19 题", opened.rows === 19, `${opened.rows} 题`);
  ok("展开后可见评分分档", opened.bands > 0, `${opened.bands} 个分档`);
  await page.screenshot({ path: `${OUT}/02-review-expanded.png` });

  await page.locator(".rv-card .rv-bar").first().click();
  await page.waitForTimeout(420);
  const closed = await page.evaluate(() => {
    const c = document.querySelector(".rv-card");
    return { expanded: c.querySelector(".rv-bar").getAttribute("aria-expanded"), bodyVisible: c.querySelector(".rv-body").offsetParent !== null };
  });
  ok("再次点击收起", closed.expanded === "false" && closed.bodyVisible === false);

  /* 4. 吸底条：无合计、按钮为「保存评分」「确认提交」，未完成项时禁用 */
  const foot = await page.evaluate(() => {
    const f = document.querySelector(".rv-foot");
    return {
      text: f ? f.innerText.replace(/\s+/g, " ").trim() : "",
      btns: f ? [...f.querySelectorAll("button")].map(b => b.innerText.trim()) : [],
      disabled: f ? [...f.querySelectorAll("button")].map(b => b.disabled) : [],
    };
  });
  ok("吸底条不再显示合计", !/合计/.test(foot.text) && !/\d+\s*\/\s*\d+\s*分/.test(foot.text), foot.text || "（空）");
  ok("按钮为「保存评分」「确认提交」",
    foot.btns.length === 2 && foot.btns[0] === "保存评分" && foot.btns[1] === "确认提交", foot.btns.join(" / "));
  ok("有未完成项目时提示并禁用提交", /还有 1 项未完成评估/.test(foot.text) && foot.disabled[1] === true, foot.text);

  /* 5. 「返回」回到评估项目表，可继续施测未完成项目 */
  await page.locator(".ph-a button", { hasText: "返回" }).first().click();
  await page.waitForTimeout(1100);
  const back = await page.evaluate(() => ({
    run: !!document.querySelector(".item-card"),
    review: !!document.querySelector(".rv-page"),
    head: (document.querySelector(".ph-d") || {}).innerText || "",
    acts: [...document.querySelectorAll(".item-card")].map(c => ({
      name: ((c.querySelector(".head .t") || {}).innerText || "").split("\n")[0].trim(),
      act: ((c.querySelector(".head button") || {}).innerText || "").trim(),
    })),
  }));
  ok("「返回」回到评估项目表", back.run && !back.review && /全面评估方案/.test(back.head),
    back.head.split("·")[0].trim() || "未返回");
  const moca = back.acts.find(a => /MoCA/.test(a.name));
  ok("未完成项目可继续施测", !!moca && /开始评估|继续评估/.test(moca.act), moca ? `${moca.name.split(" ")[0]} → ${moca.act}` : "未找到 MoCA");
  await page.screenshot({ path: `${OUT}/03-after-back.png` });

  /* 6. 补齐 MoCA 后再进评分页：两项目均列出、提交可点 */
  await post(`/assessments/${rid}/record-item`, { code: "MoCA" });
  await openReviewUI(page);
  const full = await page.evaluate(() => {
    const f = document.querySelector(".rv-foot");
    return {
      bars: document.querySelectorAll(".rv-card").length,
      collapsed: [...document.querySelectorAll(".rv-card .rv-bar")].every(b => b.getAttribute("aria-expanded") === "false"),
      btns: f ? [...f.querySelectorAll("button")].map(b => ({ t: b.innerText.trim(), d: b.disabled })) : [],
      text: f ? f.innerText.replace(/\s+/g, " ").trim() : "",
    };
  });
  ok("两项目均列出且默认收起", full.bars === 2 && full.collapsed, `${full.bars} 项`);
  ok("全部施测完成后「确认提交」可点", full.btns[1] && full.btns[1].t === "确认提交" && !full.btns[1].d, full.text);
  await page.screenshot({ path: `${OUT}/04-review-all-done.png` });

  ok("页面无脚本错误", errs.length === 0, errs[0] || "");
} finally {
  await browser.close();
  purge(rid);
}

console.log(`\n${bad.length ? "✗ 未通过 " + bad.length + " 项：" + bad.join("；") : "✓ 全部通过"}`);
process.exit(bad.length ? 1 : 0);
