/**
 * 第 66 轮：训练方案库 UI（数字疗法中性化）+ 点击打开效果测试
 * 校验：24 卡 / 抽象 SVG 图标 / 认知域筛选 / 卡片可点击 / iframe 可玩 /
 *       本地模拟结算生效 / 不产生 /train/result 请求 / train_record 数量不变
 * 运行：Node 22（Playwright），工作目录 = HS-CRT-01-体验版/
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const NODE20 = "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node";

const bad = [];
const ok = (t, c, extra = "") => {
  console.log(`${c ? "✓" : "✗"} ${t}${extra ? "  " + extra : ""}`);
  if (!c) bad.push(t);
};

const DB = path.resolve("data/hscrt01.db");
const trainCount = () => Number(execFileSync(NODE20, ["-e",
  `const D=require("better-sqlite3");const db=new D(${JSON.stringify(DB)},{readonly:true});process.stdout.write(String(db.prepare("SELECT COUNT(*) c FROM train_record").get().c));db.close();`
], { encoding: "utf8", cwd: process.cwd() }).trim());

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" })
}).then(r => r.json());
ok("医生端登录", login.code === 0);

const before = trainCount();
console.log(`  训练记录基线：${before}`);

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const errors = [], trainCalls = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("request", r => { if (/\/api\/v1\/train\/(start|result)/.test(r.url())) trainCalls.push(`${r.method()} ${r.url()}`); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner");
await page.click('.lb-aside .el-menu-item:has-text("方案管理")');
await page.waitForTimeout(1000);
await page.waitForSelector(".tp-card");

/* ---------- 1. 卡片网格与图标 ---------- */
const grid = await page.evaluate(() => ({
  cards: document.querySelectorAll(".tp-card").length,
  svgs: document.querySelectorAll(".tp-card .tp-ico svg.hs-ico").length,
  filters: document.querySelectorAll(".tp-filters .tp-chip").length,
  filterIcons: document.querySelectorAll(".tp-filters .tp-chip svg.hs-ico").length,
  playIcons: document.querySelectorAll(".tp-card .tp-play svg.hs-ico").length,
  emoji: [...document.querySelectorAll(".tp-card")].filter(c => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(c.innerText)).length,
  clickable: [...document.querySelectorAll(".tp-card")].every(c => c.getAttribute("role") === "button" && c.tabIndex === 0),
  names: [...document.querySelectorAll(".tp-card .tp-name")].slice(0, 3).map(n => n.innerText.trim()),
}));
ok("训练方案卡 24 张", grid.cards === 24, `实际 ${grid.cards}`);
ok("卡片图标全部为抽象 SVG", grid.svgs === 24, `${grid.svgs}/24`);
ok("筛选条 1+6 且带域图标", grid.filters === 7 && grid.filterIcons === 7, `${grid.filters} / ${grid.filterIcons}`);
ok("试玩入口图标齐全", grid.playIcons === 24, `${grid.playIcons}/24`);
ok("卡片内无 emoji（数字疗法中性化）", grid.emoji === 0);
ok("卡片可聚焦、可键盘触发", grid.clickable);
console.log("  前 3 张：", grid.names.join(" / "));

/* ---------- 2. 认知域筛选 ---------- */
await page.click('.tp-filters .tp-chip.ca');
await page.waitForTimeout(350);
const caCount = await page.locator(".tp-card").count();
ok("按「复合性注意」筛选 = 4 张", caCount === 4, `实际 ${caCount}`);
const cntTxt = await page.locator(".tp-bar .tp-count").innerText();
ok("计数随筛选同步", /显示 4 \/ 24/.test(cntTxt), cntTxt.trim());
await page.click('.tp-filters .tp-chip.all');
await page.waitForTimeout(300);
ok("「全部」恢复 24 张", (await page.locator(".tp-card").count()) === 24);

/* ---------- 3. 点击卡片打开效果测试 ---------- */
await page.locator(".tp-card").first().click();
await page.waitForSelector(".el-dialog.tp-dialog", { state: "visible" });
await page.waitForSelector("#tpFrame");
await page.waitForTimeout(1200);

const dlg = await page.evaluate(() => {
  const el = document.querySelector(".el-dialog.tp-dialog");
  const badge = el && el.querySelector(".tp-badge");
  const hd = el && el.querySelector(".tp-dlg-hd");
  return {
    title: el ? (el.querySelector(".tp-dlg-t") || {}).innerText : "",
    code: el ? (el.querySelector(".tp-dlg-c") || {}).innerText : "",
    badge: badge ? badge.innerText.trim() : "",
    headIconSvg: hd ? hd.querySelectorAll(".tp-ico svg.hs-ico").length : 0,
    sideBlocks: el ? el.querySelectorAll(".tp-side .blk").length : 0,
    iframeSrc: (document.getElementById("tpFrame") || {}).src || "",
  };
});
ok("弹窗标题为该方案", /信号捕捉/.test(dlg.title || ""), dlg.title);
ok("弹窗标注方案编码 / 认知域 / 关卡数", /CA-01/.test(dlg.code) && /复合性注意/.test(dlg.code), dlg.code);
ok("数据声明「不计入训练记录」", /不计入训练记录/.test(dlg.badge), dlg.badge);
ok("弹窗头使用抽象 SVG 图标", dlg.headIconSvg === 1, `${dlg.headIconSvg}`);
ok("左侧处方信息 5 块", dlg.sideBlocks === 5, `${dlg.sideBlocks}`);
ok("iframe 指向静态训练页 preview=1", /\/train\/CA-01\.html\?preview=1$/.test(dlg.iframeSrc), dlg.iframeSrc);

/* ---------- 4. iframe 内：装饰中性化 + 可玩 ---------- */
const frameInfo = await page.evaluate(() => {
  const f = document.getElementById("tpFrame");
  const d = f.contentDocument, w = f.contentWindow;
  const cover = d.querySelector(".hd .cover");
  return {
    styleInjected: !!d.getElementById("hsPreviewCss"),
    coverSvg: cover ? cover.querySelectorAll("svg.hs-ico").length : 0,
    coverEmoji: cover ? /[\u{1F300}-\u{1FAFF}]/u.test(cover.textContent) : true,
    ftHidden: d.querySelector(".ft") ? getComputedStyle(d.querySelector(".ft")).display === "none" : false,
    ptitleHidden: d.querySelector("#ptitle") ? getComputedStyle(d.querySelector("#ptitle")).display === "none" : false,
    fetchBlocked: typeof w.fetch === "function" && w.fetch.toString().includes("效果测试模式"),
    hasLocalAPI: !!(w.API && typeof w.API.post === "function"),
    levels: d.querySelectorAll(".hd .chip[data-lv]").length,
    stageLen: (d.getElementById("stage") || {}).innerHTML?.length || 0,
  };
});
ok("试玩页注入中性化样式", frameInfo.styleInjected);
ok("装饰 emoji 已换成抽象 SVG", frameInfo.coverSvg === 1 && !frameInfo.coverEmoji);
ok("页脚 / 🎯 标题已隐藏", frameInfo.ftHidden && frameInfo.ptitleHidden);
ok("iframe 内网络请求已禁用", frameInfo.fetchBlocked);
ok("本地模拟结算 API 存在", frameInfo.hasLocalAPI);
ok("10 级关卡选择器可见", frameInfo.levels === 10, `${frameInfo.levels}`);
ok("训练舞台已渲染", frameInfo.stageLen > 100, `${frameInfo.stageLen} 字符`);

/* 两段式「开始训练」：关卡说明 → 会话入口 → 真实刺激（逐一点，确认可玩） */
const frame = page.frameLocator("#tpFrame");
await frame.locator('.hd .chip[data-lv="1"]').click();
await page.waitForTimeout(450);
const introLen = (await frame.locator("#stage").innerHTML()).length;
await frame.locator("#stage #go").click();
await page.waitForTimeout(350);
await frame.locator("#stage #go").click();
await page.waitForTimeout(1100);
const playText = await frame.locator("#stage").innerText();
const goLeft = await frame.locator("#stage #go").count();
ok("点击关卡后玩法说明已展开", introLen > 200, `${introLen} 字符`);
ok("两次开始后进入真实刺激", goLeft === 0 && /目标/.test(playText), playText.slice(0, 50).replace(/\n/g, " "));

/* 调用本地模拟结算，确认不触网、不写库 */
const sim = await page.evaluate(() => {
  const w = document.getElementById("tpFrame").contentWindow;
  return w.API.post("/train/result", {
    planId: 0, program: "CA-01", level: 1, durationS: 30,
    trials: [{ correct: true, rt: 800 }, { correct: true, rt: 760 }]
  }).then(r => ({ result: r.result, accPct: r.accPct, adjust: r.adjust }));
});
ok("本地模拟结算返回结果", !!sim.result && typeof sim.accPct === "number", `${sim.result} / ${sim.accPct}% / ${sim.adjust}`);

/* ---------- 5. 关闭后数据不变 ---------- */
await page.click(".el-dialog.tp-dialog .el-dialog__footer button:has-text('关闭')");
await page.waitForTimeout(500);
const after = trainCount();
ok("关闭试玩后 train_record 数量不变", after === before, `${before} → ${after}`);

/* ---------- 6. 管理端「量表与方案 → 训练方案」同步 ---------- */
const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
admin.on("pageerror", e => errors.push("admin pageerror: " + e.message));
admin.on("console", m => { if (m.type() === "error") errors.push("admin console: " + m.text()); });
admin.on("request", r => { if (/\/api\/v1\/train\/(start|result)/.test(r.url())) trainCalls.push(`admin ${r.method()} ${r.url()}`); });
await admin.goto("http://localhost:3210/admin", { waitUntil: "networkidle" });
await admin.fill('input[placeholder="管理员账号"]', "admin");
await admin.fill('input[placeholder="密码"]', "hs123456");
await admin.click("button:has-text('登 录')");
await admin.waitForTimeout(1000);
await admin.click('.lb-aside .el-menu-item:has-text("量表与方案")');
await admin.waitForTimeout(800);
await admin.click('.el-tabs__item:has-text("训练方案")');
await admin.waitForTimeout(600);
const adm = await admin.evaluate(() => ({
  cards: document.querySelectorAll(".tp-card").length,
  svgs: document.querySelectorAll(".tp-card .tp-ico svg.hs-ico").length,
  emoji: [...document.querySelectorAll(".tp-card")].filter(c => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(c.innerText)).length,
}));
ok("管理端训练方案 24 张且已换 SVG 图标", adm.cards === 24 && adm.svgs === 24, `${adm.cards}/${adm.svgs}`);
ok("管理端卡片无 emoji", adm.emoji === 0);
await admin.locator(".tp-card").first().click();
await admin.waitForSelector(".el-dialog.tp-dialog", { state: "visible" });
await admin.waitForSelector("#tpFrame");
await admin.waitForTimeout(900);
const admDlg = await admin.evaluate(() => ({
  title: (document.querySelector(".tp-dlg-t") || {}).innerText,
  badge: (document.querySelector(".tp-badge") || {}).innerText.trim(),
  src: (document.getElementById("tpFrame") || {}).src,
}));
ok("管理端可打开同一个效果测试弹窗", /信号捕捉/.test(admDlg.title || "") && /不计入训练记录/.test(admDlg.badge || ""));
ok("管理端 iframe 同样指向 preview=1", /\/train\/CA-01\.html\?preview=1$/.test(admDlg.src || ""));
await admin.close();

const finalCount = trainCount();
ok("医生端 + 管理端试玩后训练记录仍不变", finalCount === before, `${before} → ${finalCount}`);
ok("全程无 /train/start 或 /train/result 请求", trainCalls.length === 0, trainCalls.join(", ") || "none");
ok("浏览器控制台无错误", errors.length === 0, errors.slice(0, 4).join(" | ") || "none");

await browser.close();
console.log(bad.length ? `\n失败 ${bad.length} 项：${bad.join("、")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
