import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r76";
fs.mkdirSync(OUT, { recursive: true });
const errors = [], fails = [];
const ck = (name, cond, extra = "") => { console.log((cond ? "✓ " : "✗ ") + name + (extra ? "  " + extra : "")); if (!cond) fails.push(name); };

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3210/admin", { waitUntil: "networkidle" });
await page.fill('input[placeholder="管理员账号"]', "admin");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-aside", { timeout: 15000 });
await page.waitForTimeout(1500);

/* ---------- 1. 评估数据查询区 ---------- */
await page.click('.el-menu-item:has-text("评估数据")');
await page.waitForTimeout(1200);
const qBox = async () => {
  const vis = await page.locator(".query-card .q-form .el-form-item").evaluateAll(
    (els) => els.filter((e) => e.offsetParent !== null).length);
  const box = await page.locator(".query-card .q-actions").boundingBox();
  const card = await page.locator(".query-card").boundingBox();
  const form = await page.locator(".query-card .q-form").boundingBox();
  return { vis, actRight: box.x + box.width, cardRight: card.x + card.width, formRight: form.x + form.width, actX: box.x };
};
let a1 = await qBox();
ck("评估查询默认折叠，仅显示 3 个条件", a1.vis === 3, "实际 " + a1.vis);
ck("查询/重置固定在卡片右侧", a1.cardRight - a1.actRight < 20, `间距 ${Math.round(a1.cardRight - a1.actRight)}px`);
ck("查询/重置位于条件区右侧", a1.actX > a1.formRight - 1, `act.x=${Math.round(a1.actX)} formRight=${Math.round(a1.formRight)}`);
await page.screenshot({ path: `${OUT}/q1-assess-collapsed.png`, clip: { x: 0, y: 40, width: 1440, height: 220 } });

await page.click('.query-card .q-toggle');
await page.waitForTimeout(500);
const a2 = await qBox();
ck("点击展开后显示全部 5 个条件", a2.vis === 5, "实际 " + a2.vis);
ck("展开后查询/重置仍固定右侧", a2.cardRight - a2.actRight < 20, `间距 ${Math.round(a2.cardRight - a2.actRight)}px`);
ck("展开按钮文案变为「收起」", (await page.locator(".query-card .q-toggle").innerText()).includes("收起"));
await page.screenshot({ path: `${OUT}/q2-assess-expanded.png`, clip: { x: 0, y: 40, width: 1440, height: 220 } });

/* 收起后隐藏条件仍在生效 → 按钮显示数量 */
await page.locator('.query-card .q-form .el-form-item:has-text("评估医生") .el-select').click();
await page.waitForTimeout(400);
await page.locator('.el-select-dropdown__item:visible').first().click();
await page.waitForTimeout(800);
await page.click('.query-card .q-toggle');
await page.waitForTimeout(500);
ck("收起后按钮提示隐藏条件数", (await page.locator(".query-card .q-toggle").innerText()).includes("展开 1"),
  (await page.locator(".query-card .q-toggle").innerText()).replace(/\n/g, " "));
await page.screenshot({ path: `${OUT}/q5-assess-hidden-count.png`, clip: { x: 0, y: 40, width: 1440, height: 200 } });
await page.click('.query-card button:has-text("重置")');
await page.waitForTimeout(800);
ck("重置后隐藏条件计数归零", (await page.locator(".query-card .q-toggle").innerText()).includes("展开"));

/* ---------- 2. 训练记录查询区 ---------- */
await page.click('.el-menu-item:has-text("训练记录")');
await page.waitForTimeout(1200);
let t1 = await qBox();
ck("训练查询默认折叠，仅显示 3 个条件", t1.vis === 3, "实际 " + t1.vis);
ck("训练查询/重置固定在右侧", t1.cardRight - t1.actRight < 20, `间距 ${Math.round(t1.cardRight - t1.actRight)}px`);
await page.screenshot({ path: `${OUT}/q3-train-collapsed.png`, clip: { x: 0, y: 40, width: 1440, height: 220 } });
await page.click('.query-card .q-toggle');
await page.waitForTimeout(500);
const t2 = await qBox();
ck("训练查询展开后显示全部 6 个条件", t2.vis === 6, "实际 " + t2.vis);
const rows = await page.locator(".query-card .q-form .el-form-item").evaluateAll(
  (els) => [...new Set(els.filter((e) => e.offsetParent !== null).map((e) => Math.round(e.getBoundingClientRect().top)))].length);
ck("展开后条件按多行排布", rows >= 2, rows + " 行");
await page.screenshot({ path: `${OUT}/q4-train-expanded.png`, clip: { x: 0, y: 40, width: 1440, height: 260 } });

/* ---------- 3. 顶栏与侧栏账号区 ---------- */
const headerTxt = await page.locator(".lb-header").innerText();
ck("顶栏无「手动备份」", !headerTxt.includes("手动备份"), headerTxt.replace(/\n/g, " | "));
ck("顶栏无用户与角色信息", !headerTxt.includes("王工") && !headerTxt.includes("系统管理员"));
const userBox = await page.locator(".lb-user").boundingBox();
const asideBox = await page.locator(".lb-aside").boundingBox();
ck("账号区位于侧栏左下角", userBox.y + userBox.height > asideBox.y + asideBox.height - 90 && userBox.x < asideBox.x + 40,
  `bottomGap=${Math.round(asideBox.y + asideBox.height - (userBox.y + userBox.height))}px`);
const userName = (await page.locator(".lb-user .u .n").innerText()).trim();
const roleCount = await page.locator(".lb-user .u .r").count();
ck("账号区只显示姓名，无角色", userName === "王工" && roleCount === 0, userName + " / 角色行 " + roleCount);

/* ---------- 4. 字典管理 ---------- */
await page.click('.el-menu-item:has-text("字典管理")');
await page.waitForTimeout(1200);
const navTxt = await page.locator(".dict-nav").innerText();
ck("不再出现「两端」", !navTxt.includes("两端"), navTxt.split("\n").slice(0, 4).join(" / "));
ck("科室标注医生端·管理端", /科室[\s\S]{0,8}医生端·管理端/.test(navTxt), navTxt.split("\n").slice(0, 4).join(" / "));
ck("职称标注医生端", /职称[\s\S]{0,8}医生端/.test(navTxt));
ck("右栏不再显示引用位置", (await page.locator(".dict-meta").count()) === 0);
const headTxt = await page.locator(".list-card .head").innerText();
ck("右栏头部只剩标题与按钮", !headTxt.includes("引用位置") && !headTxt.includes("未接入") && !headTxt.includes("两端"), headTxt.replace(/\n/g, " | "));
await page.screenshot({ path: `${OUT}/d1-dict-dept.png`, clip: { x: 0, y: 40, width: 1440, height: 420 } });

await page.click('.dict-nav button:has-text("职称")');
await page.waitForTimeout(900);
ck("职称无描述性字段", (await page.locator(".dict-meta").count()) === 0);

/* 新增字典类型弹窗 */
await page.click('.dict-nav-head button:has-text("新增")');
await page.waitForTimeout(600);
const tdlg = await page.locator(".el-dialog:visible").innerText();
ck("类型弹窗为名称/标识/适用范围", ["字典名称", "标识", "适用范围"].every((k) => tdlg.includes(k)), tdlg.replace(/\n/g, " | "));
ck("类型弹窗无引用位置", !tdlg.includes("引用位置") && !tdlg.includes("未接入"));
ck("适用范围为多选复选框", (await page.locator('.el-dialog:visible .el-checkbox').count()) === 2);
ck("默认勾选医生端与管理端", (await page.locator('.el-dialog:visible .el-checkbox.is-checked').count()) === 2);
await page.screenshot({ path: `${OUT}/d3-type-new.png`, clip: { x: 340, y: 120, width: 760, height: 480 } });
await page.click('.el-dialog:visible button:has-text("取消")');
await page.waitForTimeout(400);

ck("左栏标题旁为「编辑」「新增」", (await page.locator(".dict-nav-head button").allInnerTexts()).map(t=>t.trim()).join("/") === "编辑/新增",
  (await page.locator(".dict-nav-head button").allInnerTexts()).join("/"));
ck("右栏只保留「新增字典项」", (await page.locator(".list-card .head button").allInnerTexts()).join("/").includes("新增字典项")
  && (await page.locator(".list-card .head button").count()) === 1);

/* 编辑类型弹窗（内置） */
await page.click('.dict-nav-head button:has-text("编辑")');
await page.waitForTimeout(600);
const idVals = await page.locator(".el-dialog:visible input").evaluateAll((els) => els.map((e) => e.value));
const idDisabled = await page.locator('.el-dialog:visible input').nth(1).isDisabled();
ck("编辑类型弹窗回填名称与标识", idVals[0] === "职称" && idVals[1] === "title", idVals.join(" / "));
ck("标识字段置灰不可改", idDisabled);
ck("内置类型无删除按钮", (await page.locator('.el-dialog:visible button:has-text("删除")').count()) === 0);
await page.screenshot({ path: `${OUT}/d4-type-edit.png`, clip: { x: 340, y: 120, width: 760, height: 480 } });
await page.click('.el-dialog:visible button:has-text("取消")');
await page.waitForTimeout(400);

/* 字典项弹窗 */
await page.click('.dict-nav button:has-text("科室")');
await page.waitForTimeout(900);
await page.click('.list-card .head button:has-text("新增字典项")');
await page.waitForTimeout(600);
const idlg = await page.locator(".el-dialog:visible").innerText();
ck("字典项弹窗无生效位置", !idlg.includes("生效位置") && !idlg.includes("未接入"), idlg.replace(/\n/g, " | "));
await page.screenshot({ path: `${OUT}/d5-item-new.png`, clip: { x: 340, y: 120, width: 760, height: 480 } });
await page.click('.el-dialog:visible button:has-text("取消")');
await page.waitForTimeout(400);

/* ---------- 4. 新增字典类型 → 加项 → 可见 → 清理（端到端） ---------- */
await page.click('.dict-nav-head button:has-text("新增")');
await page.waitForTimeout(500);
await page.fill('.el-dialog:visible input[placeholder="如 康复评定类型"]', "评定类型");
await page.fill('.el-dialog:visible input[placeholder="小写字母开头，如 rehab_type"]', "qa_type");
await page.locator('.el-dialog:visible .el-checkbox:has-text("管理端")').click();
await page.click('.el-dialog:visible button:has-text("确认")');
await page.waitForTimeout(1200);
const navAfter = await page.locator(".dict-nav").innerText();
ck("新增类型出现在左栏并标注医生端", navAfter.includes("评定类型") && /评定类型[\s\S]{0,8}医生端/.test(navAfter), navAfter.split("\n").slice(-4).join(" / "));
ck("取消勾选后只保留医生端", !/评定类型[\s\S]{0,10}管理端/.test(navAfter));
ck("新增类型自动选中", (await page.locator(".list-card .head .t").innerText()).includes("评定类型"));

await page.click('.list-card .head button:has-text("新增字典项")');
await page.waitForTimeout(500);
await page.fill('.el-dialog:visible input[placeholder="如 神经内科"]', "运动功能评定");
await page.click('.el-dialog:visible button:has-text("确认")');
await page.waitForTimeout(1200);
const rowsTxt = await page.locator(".list-card .el-table").innerText();
ck("新增字典项写入成功", rowsTxt.includes("运动功能评定"), rowsTxt.split("\n").slice(0, 6).join(" | "));
ck("左栏项数同步为 1", /评定类型[\s\S]{0,12}1/.test(await page.locator(".dict-nav").innerText()));
await page.screenshot({ path: `${OUT}/d6-custom-type.png`, clip: { x: 0, y: 40, width: 1440, height: 380 } });

/* 清理：删项 → 删类型 */
page.on("dialog", (d) => d.accept());
await page.locator('.list-card .el-table button:has-text("删除")').first().click();
await page.waitForTimeout(600);
await page.click('.list-card .el-table button:has-text("删除")').catch(() => {});
await page.waitForTimeout(400);
const okBtn = page.locator('.el-message-box button:has-text("确定"), .el-message-box button:has-text("OK")');
if (await okBtn.count()) { await okBtn.first().click(); await page.waitForTimeout(900); }
await page.click('.dict-nav-head button:has-text("编辑")');
await page.waitForTimeout(600);
const delBtn = page.locator('.el-dialog:visible button:has-text("删除")');
ck("自定义类型可删除", (await delBtn.count()) === 1);
await delBtn.click();
await page.waitForTimeout(500);
if (await okBtn.count()) { await okBtn.first().click(); await page.waitForTimeout(1000); }
const navFinal = await page.locator(".dict-nav").innerText();
ck("删除类型后左栏恢复 6 类", !navFinal.includes("评定类型") && (await page.locator(".dict-nav > button").count()) === 6, navFinal.replace(/\n/g, " "));

ck("页面无脚本错误", errors.length === 0, errors.slice(0, 3).join(" ; "));
console.log(fails.length ? "\n✗ 失败 " + fails.length + " 项：" + fails.join("、") : "\n✓ 全部通过");
await browser.close();
process.exit(fails.length ? 1 : 0);
