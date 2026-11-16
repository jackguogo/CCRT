/* seed-demo.js —— 演示数据生成器（体验版）
 * 目的：让"数据记录 / 评估数据 / 训练数据"页面呈现完整业务数据范围，而不是零星几条测试记录。
 * 覆盖：患者主档 → 评估记录（量表 + 范式明细）→ 六域报告（多次复评）→ 训练方案（进行中 / 已完成 / 已终止）
 *       → 逐次训练记录（含难度自适应升降关）→ 依从性日/周分布 → 审计日志
 * 用法：node server/seed-demo.js        （会自动备份现有数据库到 data/backups/）
 * 幂等：每次执行会清空业务表后重建，账号 admin / doctor / therapist 保留。
 */
const fs = require("fs");
const path = require("path");
const S = require("./index");   // 复用评分 / 六域画像 / 推荐引擎，保证与线上算法一致
const { db, now, scoreScale, scoreParadigm, buildRadar, buildConclusion, TRAININGS, PARADIGMS, SCALES } = S;

/* ---------------- 基础工具 ---------------- */
const DAY = 86400000;
const pad2 = (n) => String(n).padStart(2, "0");
const fmt = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
const TODAY = new Date(); TODAY.setHours(19, 30, 0, 0);
const dayAgo = (n) => new Date(TODAY.getTime() - n * DAY);

// 固定种子伪随机，保证每次生成结果可复现
let seed = 20261027;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- 备份 ---------------- */
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "hscrt01.db");
const bkDir = path.join(DATA_DIR, "backups");
fs.mkdirSync(bkDir, { recursive: true });
if (fs.existsSync(DB_FILE)) {
  const bk = path.join(bkDir, "db-before-seed-" + fmt(new Date()).replace(/[: ]/g, "-") + ".db");
  fs.copyFileSync(DB_FILE, bk);
  console.log("已备份现有数据库 →", path.basename(bk));
}

/* ---------------- 清空业务数据 ---------------- */
db.pragma("foreign_keys = OFF");
for (const t of ["assess_detail", "report", "assess_record", "train_record", "train_plan", "sys_log"]) db.prepare(`DELETE FROM ${t}`).run();
db.prepare("DELETE FROM sys_user WHERE role='patient'").run();
db.prepare("DELETE FROM patient").run();
db.prepare("UPDATE sqlite_sequence SET seq=0 WHERE name IN ('patient','assess_record','assess_detail','report','train_plan','train_record','sys_log')").run();

/* ---------------- 患者画像 ---------------- */
// severity：0 正常 / 0.35 轻度 / 0.65 中度 / 0.9 明显受损（用于生成作答与训练趋势）
const PATIENTS = [
  {
    name: "陈建国", sex: "男", birth: "1958-03-12", id_card: "330102195803120011", no: "MZ260812",
    edu: "初中", dept: "康复科", phone: "13800002211", guardian: "陈女士(女儿)",
    history: "主诉：近半年记忆力下降，偶有找词困难；高血压 10 年，规律服药。",
    severity: 0.38, adherence: 0.9, start: 56, weeks: 8, finished: false, plans: 2,
  },
  {
    name: "孙玉兰", sex: "女", birth: "1955-07-30", id_card: "330102195507300022", no: "ZY260344",
    edu: "小学", dept: "神经内科", phone: "13900008876", guardian: "孙先生(儿子)",
    history: "主诉：家属代诉反应变慢、重复提问；2 型糖尿病，血糖控制欠佳。",
    severity: 0.62, adherence: 0.52, start: 42, weeks: 8, finished: false, plans: 1,
  },
  {
    name: "周明远", sex: "男", birth: "1949-11-08", id_card: "330102194911080033", no: "MZ260915",
    edu: "大学及以上", dept: "神经内科", phone: "13700006654", guardian: "周女士(女儿)",
    history: "主诉：偶发健忘，家属担心；退休教师，日常活动与社交良好。",
    severity: 0.08, adherence: 0.75, start: 45, weeks: 6, finished: false, plans: 1,
  },
  {
    name: "李文秀", sex: "女", birth: "1962-05-21", id_card: "330102196205210044", no: "MZ260703",
    edu: "高中", dept: "康复科", phone: "13600005588", guardian: "李先生(儿子)",
    history: "主诉：脑梗死后 8 个月，注意力与执行功能下降；右侧肢体肌力 4 级。",
    severity: 0.5, adherence: 0.95, start: 96, weeks: 12, finished: true, plans: 2,
  },
  {
    name: "吴志强", sex: "男", birth: "1978-09-14", id_card: "330102197809140055", no: "MZ261021",
    edu: "大学及以上", dept: "康复科", phone: "13500007711", guardian: "—",
    history: "主诉：注意力不集中、易分心半年，工作压力大；无神经系统器质性疾病史。",
    severity: 0.22, adherence: 0.8, start: 22, weeks: 4, finished: false, plans: 1,
  },
  {
    name: "赵慧珍", sex: "女", birth: "1944-02-03", id_card: "330102194402030066", no: "ZY260508",
    edu: "文盲", dept: "老年科", phone: "13400009922", guardian: "赵先生(孙子)",
    history: "主诉：近 1 年记忆明显减退，需家属协助日常生活；文盲，量表需口头施测。",
    severity: 0.85, adherence: 0.3, start: 35, weeks: 8, finished: false, plans: 1,
  },
];

/* ---------------- 评估方案 ---------------- */
const PLAN_DEFS = {
  "快速筛查方案": [["scale", "MMSE"]],
  "标准筛查方案": [["scale", "MMSE"], ["scale", "MoCA"]],
  "全面评估方案": [["scale", "MMSE"], ["scale", "MoCA"], ["paradigm", "SPAN"], ["paradigm", "TMT"], ["paradigm", "STROOP"], ["paradigm", "AVLT"], ["paradigm", "BNT"], ["paradigm", "CDT"]],
  "训练随访方案": [["scale", "MoCA"], ["paradigm", "TMT"], ["paradigm", "AVLT"]],
};

const scaleByCode = (c) => SCALES.find((s) => s.code === c);

// 按"严重度 + 复评改善量"生成量表作答
function makeAnswers(code, severity, gain) {
  const sc = scaleByCode(code);
  const p = clamp(0.96 - severity * 0.55 + gain, 0.35, 0.99); // 单题正确概率
  const ans = {};
  for (const it of sc.items) {
    const vals = (it.o || [[1, ""]]).map((o) => Number(o[0]));
    const max = Math.max(...vals);
    if (rnd() < p) ans[it.id] = max;
    else ans[it.id] = pick(vals.filter((v) => v < max).concat([0]));
  }
  return ans;
}

// 按范式 runner 生成原始数据
function makeRaw(code, severity, gain) {
  const s = clamp(severity - gain, 0.02, 0.98);
  switch (PARADIGMS.find((x) => x.code === code).runner) {
    case "span": return { fwd: Math.round(8.2 - s * 3.2), bwd: Math.round(6.6 - s * 3.1) };
    case "cpt": return { hits: Math.round(38 - s * 14), targets: 40, avgRt: Math.round(430 + s * 320) };
    case "sdmt": return { count: Math.round(46 - s * 22) };
    case "tmt": return { timeA: Math.round(42 + s * 160), timeB: Math.round(85 + s * 300), errors: Math.round(s * 4) };
    case "stroop": return {
      congCorrect: Math.round(20 - s * 4), congN: 20, incongCorrect: Math.round(20 - s * 8), incongN: 20,
      congRt: Math.round(680 + s * 220), incongRt: Math.round(860 + s * 420),
    };
    case "tol": return { solved: Math.round(8 - s * 5), total: 8, extraMoves: Math.round(s * 9), time: Math.round(160 + s * 150) };
    case "avlt": return { imm1: Math.round(9 - s * 4), immB: Math.round(8 - s * 4), delay: Math.round(8.8 - s * 5), recog: Math.round(11 - s * 3), recogAcc: Math.round(11 - s * 3) };
    case "rec": return { hits: Math.round(7.4 - s * 3), fa: Math.round(0.6 + s * 3) };
    case "bnt": return { spo: Math.round(24 - s * 13), total: 30, hinted: Math.round(s * 5), hintUsed: Math.round(s * 6) };
    case "flu": return { animal: Math.round(20 - s * 10), da: Math.round(14 - s * 7) };
    case "canvas": return { score: Math.round(9.6 - s * 4.6), max: 10, reviewed: true };
    default: return {};
  }
}

/* ---------------- 训练方案模板 ---------------- */
// 按六域严重度挑选方案：受损越重的域给越多方案
const DOM_PROGS = {};
for (const t of TRAININGS) (DOM_PROGS[t.domain] = DOM_PROGS[t.domain] || []).push(t);

function pickPrograms(severity, n) {
  const doms = Object.keys(DOM_PROGS);
  const out = [];
  // 受损较重的域优先（用固定权重模拟"评估结论→方案推荐"）
  const order = ["学习与记忆", "执行能力", "复合性注意", "语言", "视结构-知觉能力", "社会认知"];
  for (const d of order) {
    if (out.length >= n) break;
    const list = DOM_PROGS[d];
    out.push(list[0]);
    if (severity > 0.4 && out.length < n && list[1]) out.push(list[1]);
  }
  return out.slice(0, n);
}

/* ---------------- 写入 ---------------- */
const insP = db.prepare(`INSERT INTO patient(name,sex,birth_date,id_card,outpatient_no,education,dept,phone,guardian,history,created_at)
  VALUES(@name,@sex,@birth_date,@id_card,@outpatient_no,@education,@dept,@phone,@guardian,@history,@created_at)`);
const insU = db.prepare("INSERT INTO sys_user(username,password_hash,real_name,role,ref_id,dept,created_at) VALUES(?,?,?,?,?,?,?)");
const insAR = db.prepare(`INSERT INTO assess_record(patient_id,doctor_id,plan_name,items,mode,status,started_at,finished_at)
  VALUES(?,?,?,?,?,?,?,?)`);
const insAD = db.prepare(`INSERT INTO assess_detail(record_id,kind,code,name,payload,raw,reviewed,created_at) VALUES(?,?,?,?,?,?,?,?)`);
const insRP = db.prepare(`INSERT INTO report(record_id,patient_id,report_no,radar,chart,conclusion,created_at) VALUES(?,?,?,?,?,?,?)`);
const insTP = db.prepare(`INSERT INTO train_plan(patient_id,doctor_id,items,minutes,freq,weeks,locked,status,created_at,pushed_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
const insTR = db.prepare(`INSERT INTO train_record(plan_id,patient_id,program,level,duration_s,acc,avg_rt,hint_cnt,result,adjust,created_at,session_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
const insLog = db.prepare("INSERT INTO sys_log(user_id,user_name,action,detail,ip,created_at) VALUES(?,?,?,?,?,?)");

const DOCTOR_ID = 2, THERAPIST_ID = 3;
const bcrypt = require("bcryptjs");
const pwd = bcrypt.hashSync("hs123456", 10);

let stat = { patients: 0, assess: 0, details: 0, reports: 0, plans: 0, records: 0 };

for (const cfg of PATIENTS) {
  const created = dayAgo(cfg.start + 3);
  const pid = insP.run({
    name: cfg.name, sex: cfg.sex, birth_date: cfg.birth, id_card: cfg.id_card, outpatient_no: cfg.no,
    education: cfg.edu, dept: cfg.dept, phone: cfg.phone, guardian: cfg.guardian, history: cfg.history,
    created_at: fmt(created),
  }).lastInsertRowid;
  insU.run("PAT-" + cfg.no, pwd, cfg.name + "(患者)", "patient", pid, cfg.dept, fmt(created));
  stat.patients++;

  /* --- 评估：基线 / 中期 / 末期（末次仅已完成疗程者） --- */
  const timepoints = [cfg.start];
  if (cfg.weeks >= 6) timepoints.push(Math.round(cfg.start - cfg.weeks * 3.5));
  if (cfg.finished) timepoints.push(2);

  timepoints.forEach((daysAgo, idx) => {
    const gain = idx * 0.16;                        // 复评逐步改善
    const sev = clamp(cfg.severity - gain, 0.03, 0.95);
    // 复评沿用同一套项目，保证六域雷达前后可比
    const planName = "全面评估方案";
    const items = PLAN_DEFS[planName].map(([type, code]) => ({ type, code }));
    const startedAt = dayAgo(daysAgo);
    startedAt.setHours(9 + idx, 10 + ri(0, 40), 0, 0);
    const recId = insAR.run(pid, DOCTOR_ID, planName, JSON.stringify(items), "doctor", "进行中", fmt(startedAt), null).lastInsertRowid;
    stat.assess++;

    const results = [];
    let clock = new Date(startedAt.getTime());
    for (const it of items) {
      clock = new Date(clock.getTime() + ri(3, 9) * 60000);
      let payload, raw;
      if (it.type === "scale") {
        const ans = makeAnswers(it.code, sev, 0);
        payload = scoreScale(it.code, ans, { education: cfg.edu });
        raw = ans;
        insAD.run(recId, "scale", it.code, payload.name, JSON.stringify(payload), JSON.stringify(raw), 0, fmt(clock));
      } else {
        raw = makeRaw(it.code, sev, 0);
        payload = scoreParadigm(it.code, raw);
        insAD.run(recId, "paradigm", it.code, payload.name, JSON.stringify(payload), JSON.stringify(raw), payload.code === "CDT" ? 1 : 0, fmt(clock));
      }
      results.push(payload);
      stat.details++;
    }

    const radar = buildRadar(results);
    const conclusion = buildConclusion(radar, results);
    const finish = new Date(clock.getTime() + 12 * 60000);
    db.prepare("UPDATE assess_record SET status='已完成', finished_at=? WHERE id=?").run(fmt(finish), recId);
    const no = "R" + fmt(finish).slice(0, 10).replace(/-/g, "") + String(recId).padStart(4, "0");
    insRP.run(recId, pid, no, JSON.stringify(radar),
      JSON.stringify(results.map((r) => ({ name: r.name, total: r.total ?? null, max: r.max ?? null }))),
      conclusion, fmt(finish));
    stat.reports++;
    insLog.run(DOCTOR_ID, "张医生", "生成报告", `${cfg.name} ${no}`, "-", fmt(finish));
  });

  // 一条"进行中"的评估（展示评估工作台的续做态）
  if (cfg.name === "陈建国") {
    const d = dayAgo(1); d.setHours(15, 20, 0, 0);
    const items = PLAN_DEFS["标准筛查方案"].map(([type, code]) => ({ type, code }));
    const recId = insAR.run(pid, DOCTOR_ID, "标准筛查方案", JSON.stringify(items), "doctor", "进行中", fmt(d), null).lastInsertRowid;
    const ans = makeAnswers("MMSE", cfg.severity, 0.1);
    const payload = scoreScale("MMSE", ans, { education: cfg.edu });
    insAD.run(recId, "scale", "MMSE", payload.name, JSON.stringify(payload), JSON.stringify(ans), 0, fmt(new Date(d.getTime() + 22 * 60000)));
    stat.assess++; stat.details++;
  }

  /* --- 训练方案 + 逐次训练记录 --- */
  const progs = pickPrograms(cfg.severity, cfg.plans === 2 ? 3 : 2);
  const planStatus = cfg.finished ? "已完成" : (cfg.name === "赵慧珍" ? "已终止" : "进行中");
  // 进行中的方案必须落在疗程内，否则服务端启动时会按到期规则自动归档
  const planStartDays = cfg.finished ? cfg.start - 2
    : (planStatus === "进行中" ? Math.min(cfg.start - 2, Math.max(1, Math.floor(cfg.weeks * 7 * 0.6))) : cfg.start - 2);
  const items = progs.map((t) => ({ program: t.code, name: t.name, startLevel: clamp(Math.round(3 - cfg.severity * 2), 1, 4) }));
  const planCreated = dayAgo(planStartDays);
  const planPushed = planStatus === "进行中" ? fmt(planCreated) : null;
  const planFinished = planStatus === "已完成"
    ? fmt(new Date(planCreated.getTime() + cfg.weeks * 7 * 86400000)) : null;
  const planId = insTP.run(pid, DOCTOR_ID, JSON.stringify(items), 30, cfg.severity > 0.5 ? 3 : 4, cfg.weeks,
    cfg.severity > 0.6 ? 1 : 0, planStatus, fmt(planCreated), planPushed, planFinished).lastInsertRowid;
  stat.plans++;
  insLog.run(DOCTOR_ID, "张医生", "配置训练方案", `${cfg.name} ${items.map((i) => i.program).join("、")}`, "-", fmt(planCreated));

  // 第二个方案（历史方案，已终止）用于展示方案列表的完整状态
  if (cfg.plans === 2) {
    const old = dayAgo(planStartDays + 30);
    const p2 = pickPrograms(cfg.severity + 0.1, 2);
    insTP.run(pid, DOCTOR_ID, JSON.stringify(p2.map((t) => ({ program: t.code, name: t.name, startLevel: 1 }))),
      20, 3, 4, 0, "已终止", fmt(old), fmt(old), null).lastInsertRowid;
    stat.plans++;
  }

  // 逐周逐次训练
  const levels = {}; const lastRes = {}; const failStreak = {};
  for (const it of items) { levels[it.program] = it.startLevel; lastRes[it.program] = ""; failStreak[it.program] = 0; }
  const totalDays = cfg.finished ? cfg.weeks * 7 - 2 : planStartDays;
  for (let w = 0; w < cfg.weeks; w++) {
    const weekStartDays = planStartDays - w * 7;
    if (weekStartDays < 0) break;
    // 依从性：按 adherence 决定本周练几次
    const sessions = Math.max(1, Math.round(cfg.adherence * 4 + (rnd() < 0.3 ? -1 : 0)));
    const dayOffsets = [];
    for (let k = 0; k < sessions; k++) dayOffsets.push(weekStartDays - Math.round((k * 7) / sessions));
    for (const off of dayOffsets) {
      if (off < 0) continue;
      if (cfg.adherence < 0.6 && rnd() < 0.35) continue;   // 漏训
      const when = dayAgo(off);
      when.setHours(pick([9, 10, 15, 16, 19]), ri(0, 59), ri(0, 59), 0);
      for (const it of items) {
        const prog = it.program;
        const meta = TRAININGS.find((t) => t.code === prog);
        const lv = clamp(levels[prog], 1, meta.levels.length);
        // 正确率：难度自适应会把成绩压在 75–85% 区间，随周次小幅提升
        const base = 0.845 - cfg.severity * 0.1 + w * 0.008;
        const acc = clamp(base + (rnd() - 0.5) * 0.16, 0.45, 0.99);
        const hinted = rnd() < 0.12 ? 1 : 0;
        const accEff = hinted ? acc * 0.8 : acc;
        const rtLimit = meta.levels[lv - 1].rtl || 5000;
        const avgRt = Math.round(rtLimit * (0.42 + cfg.severity * 0.18) + (rnd() - 0.5) * 260);
        const pass = accEff >= 0.8 && avgRt <= rtLimit;
        const excellent = accEff >= 0.95;
        const result = pass ? (excellent ? "优秀" : "通过") : "未通过";
        let adjust = "无";
        if (!(cfg.severity > 0.6)) {   // 锁定难度者不做调整
          if (excellent && lastRes[prog] === "优秀") adjust = "跳升1关";
          else if (pass) adjust = "升1关";
          else {
            failStreak[prog] += 1;
            if (failStreak[prog] >= 3) adjust = lv > 1 ? "降1关" : "保底第1关";
          }
        } else adjust = "医生锁定";
        if (pass) failStreak[prog] = 0;
        insTR.run(planId, pid, prog, lv, ri(240, 620), Math.round(accEff * 1000) / 1000, avgRt, hinted,
          result, adjust, fmt(when), "S" + fmt(when).replace(/[-: ]/g, ""));
        stat.records++;
        // 结算后推进难度
        if (adjust === "跳升1关") levels[prog] = lv + 2;
        else if (adjust === "升1关") levels[prog] = lv + 1;
        else if (adjust === "降1关") levels[prog] = lv - 1;
        lastRes[prog] = result;
      }
    }
  }

  // 建档 / 登录类审计
  insLog.run(DOCTOR_ID, "张医生", "登记患者", `${cfg.name} / ${cfg.no}`, "-", fmt(created));
  insLog.run(4, cfg.name + "(患者)", "登录成功", "角色 patient", "-", fmt(dayAgo(ri(1, 6))));
}

/* ---------------- 系统审计补充 ---------------- */
const extraLogs = [
  [1, "王工", "登录成功", "角色 admin", "-", 1],
  [1, "王工", "手动备份", "db-2026-10-26-23-00-00.db", "-", 1],
  [1, "王工", "导出训练数据", "218 条", "-", 2],
  [1, "王工", "导出评估数据", "72 条", "-", 3],
  [3, "李治疗师", "登录成功", "角色 therapist", "-", 1],
  [3, "李治疗师", "量表提交", "简易精神状态量表（MMSE）总分 24/30", "-", 2],
  [2, "张医生", "修改用户", "#3", "-", 4],
  [1, "王工", "系统初始化", "内置账号 admin/doctor/therapist 及演示患者", "-", 30],
];
for (const [uid, un, act, det, ip, d] of extraLogs) insLog.run(uid, un, act, det, ip, fmt(dayAgo(d)));

console.log(`
演示数据生成完成：
  患者 ${stat.patients} 名 · 评估记录 ${stat.assess} 份 · 评估明细 ${stat.details} 条
  六域报告 ${stat.reports} 份 · 训练方案 ${stat.plans} 个 · 训练记录 ${stat.records} 次
  审计日志 ${db.prepare("SELECT COUNT(*) c FROM sys_log").get().c} 条
提示：账号不变 —— 医生端 doctor / 患者端 PAT-MZ260812，初始密码统一为 hs123456。
`);
