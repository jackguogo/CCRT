// index.js —— 认知功能障碍评估与训练软件（HS-CRT-01）体验版服务端
// 架构对应《详细技术方案》(LBYH-TDD-003)：B/S、RESTful /api/v1、JWT+RBAC、审计、备份
// 体验版以 SQLite 落地（表结构与 MySQL 版一致），生产版按技术方案切换 MySQL 8.0。
const path = require("path");
const fs = require("fs");
const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { SCALES, PARADIGMS, TRAININGS, MENUS, ROLES, RECOMMEND, PENDING_CODES } = require("./seed-data");
const { SCALE_GUIDE, PARADIGM_GUIDE } = require("./guide-data");
const { paradigmIndicators, itemMaxOf, maxOfItem } = require("./paradigm-metrics");
const { chartOfRecord } = require("./report-chart");
const { buildDetailFromScores, paradigmDomainScore, paradigmMetrics, ageFrom } = require("./detail-builder");

// 训练方案的「训练项」：每次训练包含的训练项目数，系统默认 3，可设 3–24
const TRAIN_ITEMS_MIN = 3, TRAIN_ITEMS_MAX = 24, TRAIN_ITEMS_DEFAULT = 3;

// 所有账号（管理 / 医生 / 治疗师 / 患者 / 家属）的统一初始密码
const INITIAL_PWD = "hs123456";

// 三端端口见文件末尾 ENTRIES（管理端 3100 / 医生端 3101 / 患者端 3102，可用 PORT_* 环境变量覆盖）
const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(path.join(DATA_DIR, "backups"), { recursive: true });
const DB_FILE = path.join(DATA_DIR, "hscrt01.db");
const JWT_SECRET = (() => {
  const f = path.join(DATA_DIR, "secret.key");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
  const s = require("crypto").randomBytes(48).toString("hex");
  fs.writeFileSync(f, s);
  return s;
})();

/* ---------------- 数据库 ---------------- */
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS sys_user(
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, real_name TEXT NOT NULL, role TEXT NOT NULL,
  dept TEXT DEFAULT '', phone TEXT DEFAULT '', status INTEGER DEFAULT 1, ref_id INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')), is_deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sys_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT, action TEXT,
  detail TEXT, ip TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS patient(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sex TEXT NOT NULL, birth_date TEXT NOT NULL,
  id_card TEXT DEFAULT '', outpatient_no TEXT UNIQUE, inpatient_no TEXT DEFAULT '', education TEXT NOT NULL,
  dept TEXT DEFAULT '', phone TEXT DEFAULT '', guardian TEXT DEFAULT '', history TEXT DEFAULT '',
  status INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')), is_deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS assess_record(
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL, doctor_id INTEGER,
  plan_name TEXT DEFAULT '', items TEXT DEFAULT '[]', mode TEXT DEFAULT 'doctor',
  status TEXT DEFAULT '进行中', started_at TEXT DEFAULT (datetime('now','localtime')),
  finished_at TEXT, cancel_reason TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS assess_detail(
  id INTEGER PRIMARY KEY AUTOINCREMENT, record_id INTEGER NOT NULL, kind TEXT NOT NULL, code TEXT NOT NULL,
  name TEXT NOT NULL, payload TEXT DEFAULT '{}', raw TEXT DEFAULT '{}', media TEXT DEFAULT '',
  reviewed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS report(
  id INTEGER PRIMARY KEY AUTOINCREMENT, record_id INTEGER UNIQUE NOT NULL, patient_id INTEGER NOT NULL,
  report_no TEXT NOT NULL, radar TEXT DEFAULT '{}', chart TEXT DEFAULT '[]', conclusion TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS train_plan(
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL, doctor_id INTEGER,
  items TEXT NOT NULL, minutes INTEGER DEFAULT 30, freq INTEGER DEFAULT 3, weeks INTEGER DEFAULT 12,
  locked INTEGER DEFAULT 0, status TEXT DEFAULT '进行中',
  created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS train_record(
  id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
  program TEXT NOT NULL, level INTEGER NOT NULL, duration_s INTEGER DEFAULT 0, acc REAL DEFAULT 0,
  avg_rt INTEGER DEFAULT 0, hint_cnt INTEGER DEFAULT 0, result TEXT DEFAULT '', adjust TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS plan_lib(
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'assess',
  category TEXT NOT NULL DEFAULT 'custom', name TEXT NOT NULL, desc TEXT DEFAULT '',
  items TEXT DEFAULT '[]', minutes INTEGER DEFAULT 30, is_builtin INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1, created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS idx_ar_patient ON assess_record(patient_id);
CREATE INDEX IF NOT EXISTS idx_ad_record ON assess_detail(record_id);
CREATE INDEX IF NOT EXISTS idx_tr_patient ON train_record(patient_id);
-- 患者逐题作答记录（施测阶段保存，判分后汇总为 assess_detail）
CREATE TABLE IF NOT EXISTS assess_answer(
  id INTEGER PRIMARY KEY AUTOINCREMENT, record_id INTEGER NOT NULL, code TEXT NOT NULL,
  item_id TEXT NOT NULL, value TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_aa ON assess_answer(record_id, code, item_id);
-- 审核阶段逐题评分（医护人员核对作答后给分，作为生成报告的依据）
CREATE TABLE IF NOT EXISTS assess_score(
  id INTEGER PRIMARY KEY AUTOINCREMENT, record_id INTEGER NOT NULL, code TEXT NOT NULL,
  item_id TEXT NOT NULL, score REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now','localtime')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_as ON assess_score(record_id, code, item_id);
-- 业务字典：科室、学历、职称、患者来源、评估类型、终止原因（管理端维护，医生端/患者端取数）
CREATE TABLE IF NOT EXISTS sys_dict(
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, code TEXT NOT NULL,
  label TEXT NOT NULL, sort INTEGER DEFAULT 0, status INTEGER DEFAULT 1,
  remark TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_dict ON sys_dict(type, code);
CREATE INDEX IF NOT EXISTS idx_dict_type ON sys_dict(type, status, sort);
-- 字典类型：标识每类字典的适用范围（管理端/医生端）与引用位置
CREATE TABLE IF NOT EXISTS sys_dict_type(
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  scope TEXT DEFAULT 'both', refs TEXT DEFAULT '[]', builtin INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1, sort INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')));
-- 一次性登录票据：医务人员生成二维码，患者扫码免密进入患者端（家庭训练场景）
CREATE TABLE IF NOT EXISTS login_ticket(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL, used_at TEXT, created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')));
-- 项目配置：量表 / 范式 / 训练方案的启用状态与可调参数（不新增条目，仅调整产品内置资产）
CREATE TABLE IF NOT EXISTS catalog_item(
  kind TEXT NOT NULL, code TEXT NOT NULL, enabled INTEGER DEFAULT 1,
  params TEXT DEFAULT '{}', updated_at TEXT DEFAULT (datetime('now','localtime')),
  updated_by TEXT DEFAULT '', PRIMARY KEY(kind, code));
-- 短信验证码（家庭登录）：仅存最近一次，5 分钟有效
CREATE TABLE IF NOT EXISTS sms_code(
  phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at TEXT NOT NULL,
  tries INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')));
`);

/* ---------------- 项目配置（产品内置资产） ---------------- */
const CATALOG_KINDS = [
  { kind: "scale", name: "量表评估" },
  { kind: "paradigm", name: "范式评估" },
  { kind: "training", name: "训练方案" },
];
{
  const ins = db.prepare("INSERT OR IGNORE INTO catalog_item(kind,code,enabled,params) VALUES(?,?,1,?)");
  for (const s of SCALES) ins.run("scale", s.code, JSON.stringify({ minutes: s.minutes || 10 }));
  for (const p of PARADIGMS) ins.run("paradigm", p.code, JSON.stringify({ minutes: p.minutes || 10 }));
  for (const t of TRAININGS) ins.run("training", t.code, JSON.stringify({ startLevel: 1, minutes: 30, freq: 3, weeks: 12 }));
}
const catalogOf = (kind) => Object.fromEntries(
  db.prepare("SELECT code,enabled,params FROM catalog_item WHERE kind=?").all(kind)
    .map(r => [r.code, { enabled: !!r.enabled, params: JSON.parse(r.params || "{}") }])
);

/* ---------------- 业务字典 ---------------- */
// 字典类型：scope 标适用范围，refs 标引用位置（哪一端的哪个查询/选择条件真正读取它）
// refs 为空 = 该类型尚未接入任何查询或选择条件，改项不会在任何下拉里出现
const DICT_TYPES = [
  { type: "dept", name: "科室", scope: "both", refs: [
    "医生端 · 患者建档-科室", "医生端 · 患者列表-科室筛选",
    "管理端 · 医生管理-科室筛选", "管理端 · 患者管理-科室筛选",
    "管理端 · 评估数据-科室筛选", "管理端 · 训练记录-科室筛选"] },
  { type: "education", name: "学历", scope: "doctor", refs: ["医生端 · 患者建档-教育程度"] },
  { type: "title", name: "职称", scope: "doctor", refs: [] },
  { type: "source", name: "患者来源", scope: "doctor", refs: [] },
  { type: "assess_type", name: "评估类型", scope: "both", refs: [] },
  { type: "stop_reason", name: "终止原因", scope: "doctor", refs: ["医生端 · 评估作废-作废原因"] },
];
const DICT_SEED = {
  dept: ["神经内科", "康复医学科", "精神心理科", "老年病科", "记忆门诊", "全科医学科"],
  education: ["文盲", "小学", "初中", "高中", "大学及以上"],
  title: ["主任医师", "副主任医师", "主治医师", "住院医师", "治疗师", "护师"],
  source: ["门诊", "住院", "社区筛查", "转诊", "体检"],
  assess_type: ["量表评估", "范式评估"],
  stop_reason: ["疗程结束", "患者要求", "病情变化", "依从性差", "转诊", "其他"],
};
{
  const ins = db.prepare("INSERT OR IGNORE INTO sys_dict(type,code,label,sort) VALUES(?,?,?,?)");
  for (const [type, labels] of Object.entries(DICT_SEED)) {
    labels.forEach((label, i) => ins.run(type, "D" + String(i + 1).padStart(2, "0"), label, (i + 1) * 10));
  }
  // 存量数据里出现过、但不在初始清单中的科室，补进字典，避免医生端筛选漏项
  for (const r of db.prepare("SELECT DISTINCT dept FROM patient WHERE dept<>'' AND is_deleted=0").all()) {
    if (!db.prepare("SELECT 1 FROM sys_dict WHERE type='dept' AND label=?").get(r.dept))
      db.prepare("INSERT INTO sys_dict(type,code,label,sort) VALUES('dept',?,?,999)").run("X" + Date.now() % 100000, r.dept);
  }
  // 类型元数据：内置类型按上面的 scope/refs 落库；名称与适用范围可改，标识不可改
  const insType = db.prepare("INSERT OR IGNORE INTO sys_dict_type(type,name,scope,refs,builtin,sort) VALUES(?,?,?,?,1,?)");
  DICT_TYPES.forEach((t, i) => insType.run(t.type, t.name, t.scope === "both" ? "doctor,admin" : t.scope,
    JSON.stringify(t.refs), (i + 1) * 10));
  db.exec("UPDATE sys_dict_type SET scope='doctor,admin' WHERE scope='both'");
}
const dictList = (type, all) => db.prepare(
  `SELECT id,type,code,label,sort,status,remark FROM sys_dict WHERE type=? ${all ? "" : "AND status=1"} ORDER BY sort,id`
).all(type);
const dictTypes = () => db.prepare(
  "SELECT id,type,name,scope,refs,builtin,status,sort FROM sys_dict_type ORDER BY sort,id"
).all().map(t => ({
  ...t,
  scopes: parseScopes(t.scope),
  refs: (() => { try { return JSON.parse(t.refs || "[]"); } catch (e) { return []; } })(),
}));
const dictTypeRow = (type) => db.prepare("SELECT * FROM sys_dict_type WHERE type=?").get(type);
const SCOPE_KEYS = ["doctor", "admin"];
const parseScopes = (v) => {
  if (!v) return [];
  if (v === "both") return ["doctor", "admin"];
  const arr = String(v).split(",").map(s => s.trim());
  return SCOPE_KEYS.filter(k => arr.includes(k));
};
const joinScopes = (arr) => SCOPE_KEYS.filter(k => Array.isArray(arr) && arr.includes(k)).join(",");

// 轻量迁移：评估记录关联方案库（用于「方案正在评估使用中」校验）
{
  const cols = db.prepare("PRAGMA table_info(assess_record)").all().map(c => c.name);
  if (!cols.includes("plan_id")) db.exec("ALTER TABLE assess_record ADD COLUMN plan_id INTEGER DEFAULT 0");
  if (!cols.includes("reviewed_at")) db.exec("ALTER TABLE assess_record ADD COLUMN reviewed_at TEXT");
  if (!cols.includes("reviewer")) db.exec("ALTER TABLE assess_record ADD COLUMN reviewer TEXT DEFAULT ''");
  // 早期记录只存了 plan_name，按名称回填 plan_id（仅名称唯一匹配时）
  const uniq = db.prepare(`SELECT name, MIN(id) pid FROM plan_lib WHERE kind='assess'
    GROUP BY name HAVING COUNT(*)=1`).all();
  const setPid = db.prepare("UPDATE assess_record SET plan_id=? WHERE plan_id=0 AND plan_name=?");
  uniq.forEach(u => setPid.run(u.pid, u.name));
}

// 轻量迁移：账号增加「医院名称」与「创建人」（管理端账号列表需要展示归属与操作人）
{
  const cols = db.prepare("PRAGMA table_info(sys_user)").all().map(c => c.name);
  if (!cols.includes("hospital")) db.exec("ALTER TABLE sys_user ADD COLUMN hospital TEXT DEFAULT ''");
  if (!cols.includes("created_by")) db.exec("ALTER TABLE sys_user ADD COLUMN created_by TEXT DEFAULT ''");
}

/* 角色定义表：预置角色 + 可维护的权限项（管理端「系统设置 → 角色管理」） */
db.exec(`CREATE TABLE IF NOT EXISTS sys_role(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rkey TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  status INTEGER DEFAULT 1, perms TEXT DEFAULT '[]',
  operator TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')))`);
{
  const ins = db.prepare("INSERT OR IGNORE INTO sys_role(rkey,name,status,perms,operator) VALUES(?,?,?,?,?)");
  for (const r of ROLES) ins.run(r.key, r.name, 1, JSON.stringify(r.perms), "系统内置");
}

// 轻量迁移：训练方案新增「训练项」属性（每次训练包含的训练项目数，默认 3，可设 3–24）
{
  const cols = db.prepare("PRAGMA table_info(train_plan)").all().map(c => c.name);
  if (!cols.includes("items_count")) {
    db.exec("ALTER TABLE train_plan ADD COLUMN items_count INTEGER DEFAULT 3");
    // 历史方案按 items 实际条数回填
    for (const r of db.prepare("SELECT id,items FROM train_plan").all()) {
      let n = 3;
      try { n = (JSON.parse(r.items || "[]") || []).length || 3; } catch (e) { n = 3; }
      db.prepare("UPDATE train_plan SET items_count=? WHERE id=?").run(n, r.id);
    }
  }
}

// 轻量迁移：训练方案状态字段
{
  const cols = db.prepare("PRAGMA table_info(train_plan)").all().map(c => c.name);
  if (!cols.includes("pushed_at")) db.exec("ALTER TABLE train_plan ADD COLUMN pushed_at TEXT");
  if (!cols.includes("finished_at")) db.exec("ALTER TABLE train_plan ADD COLUMN finished_at TEXT");
}
// 评估记录状态收敛为「进行中 / 已完成 / 已作废」：评分并入评估过程，历史「审核中」并入「进行中」
try {
  const n = db.prepare("UPDATE assess_record SET status='进行中' WHERE status='审核中'").run().changes;
  if (n) console.log(`迁移：${n} 条「审核中」评估并入「进行中」`);
} catch (e) { console.error("assess status migrate:", e.message); }
// 训练方案生成即进行中：历史「待推送」并入「进行中」并补 pushed_at
try {
  const n = db.prepare("UPDATE train_plan SET status='进行中', pushed_at=COALESCE(pushed_at,created_at) WHERE status='待推送'").run().changes;
  if (n) console.log(`迁移：${n} 条「待推送」方案并入「进行中」`);
} catch (e) { console.error("plan status migrate:", e.message); }
// 一个患者同一时刻只允许一个进行中的方案，DB 层兜底
try {
  db.exec("DROP INDEX IF EXISTS ux_train_plan_active");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_train_plan_active ON train_plan(patient_id) WHERE status='进行中'");
} catch (e) { console.error("ux_train_plan_active:", e.message); }
// 训练记录增加「场次」标识：一次训练里连续完成多个项目共用一个 session_id，
// 频次依从性按场次统计（否则一次做 3 项会被算成 3 次，每周 4 次的门槛失真）
{
  const cols = db.prepare("PRAGMA table_info(train_record)").all().map(c => c.name);
  if (!cols.includes("session_id")) db.exec("ALTER TABLE train_record ADD COLUMN session_id TEXT");
  // 历史数据：演示数据同一场次的时间戳完全相同，按 created_at 回填
  const n = db.prepare("UPDATE train_record SET session_id=created_at WHERE session_id IS NULL OR TRIM(session_id)=''").run().changes;
  if (n) console.log(`迁移：${n} 条训练记录按时间戳回填 session_id`);
  db.exec("CREATE INDEX IF NOT EXISTS ix_train_record_session ON train_record(patient_id, session_id)");
}
// 同一场次的判定间隔（分钟）：与上一条记录的间隔在此之内视为同一次训练
const SESSION_GAP_MIN = 60;

// 统一使用本地时间字符串（与 SQLite datetime('now','localtime') 口径一致）
const now = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
// 只取日期部分 YYYY-MM-DD（本地时区），用于疗程到期计算
const dayOf = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const log = (user, action, detail = "") => {
  try {
    db.prepare("INSERT INTO sys_log(user_id,user_name,action,detail,ip) VALUES(?,?,?,?,?)")
      .run(user ? user.id : 0, user ? (user.name || user.real_name || "系统") : "系统", action, detail, "-");
  } catch (e) { console.error("log:", e.message); }
};

/* 疗程到期自动归档：进行中方案起算日 + weeks×7 天，到期即置为「已完成」
 * 起算日优先取 pushed_at，历史数据缺失时回退 created_at。
 * finished_at 记为疗程最后一天 23:59:59（不是归档时刻），否则多个方案的完成时间会挤在同一秒。
 * 在读取类接口前调用，保证列表、患者端任务、数据记录看到的是同一份状态。 */
function sweepExpiredPlans() {
  const rows = db.prepare("SELECT id, weeks, pushed_at, created_at FROM train_plan WHERE status='进行中'").all();
  if (!rows.length) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upd = db.prepare("UPDATE train_plan SET status='已完成', finished_at=? WHERE id=?");
  let n = 0;
  for (const r of rows) {
    const start = String(r.pushed_at || r.created_at || "").slice(0, 10);
    if (!start) continue;
    const end = new Date(start + "T00:00:00");
    if (isNaN(end.getTime())) continue;
    end.setDate(end.getDate() + (r.weeks || 12) * 7);
    if (today >= end) {
      const last = new Date(end.getTime() - 86400000);
      upd.run(dayOf(last) + " 23:59:59", r.id);
      n++;
    }
  }
  if (n) console.log(`疗程到期归档：${n} 个训练方案转为已完成`);
  return n;
}

/* ---------------- 初始化种子 ---------------- */
function seed() {
  const has = db.prepare("SELECT COUNT(*) c FROM sys_user").get().c;
  if (has) return;
  const insU = db.prepare("INSERT INTO sys_user(username,password_hash,real_name,role,dept) VALUES(?,?,?,?,?)");
  const pwd = bcrypt.hashSync(INITIAL_PWD, 10);
  insU.run("admin", pwd, "王工", "admin", "信息科");
  insU.run("doctor", pwd, "张医生", "doctor", "康复科");
  insU.run("therapist", pwd, "李治疗师", "therapist", "康复科");
  const insP = db.prepare(`INSERT INTO patient(name,sex,birth_date,id_card,outpatient_no,education,dept,phone,guardian,history)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  const p1 = insP.run("陈建国", "男", "1958-03-12", "330102195803120000", "MZ260812", "初中", "康复科", "13800002211", "陈女士(女儿)", "主诉：近半年记忆力下降，偶有找词困难。").lastInsertRowid;
  const p2 = insP.run("孙玉兰", "女", "1955-07-30", "330102195507300000", "ZY260344", "小学", "神经内科", "13900008876", "孙先生(儿子)", "主诉：家属代诉反应变慢，复评随访。").lastInsertRowid;
  const insUP = db.prepare("INSERT INTO sys_user(username,password_hash,real_name,role,ref_id,dept) VALUES(?,?,?,?,?,?)");
  const patPwd = bcrypt.hashSync(INITIAL_PWD, 10);
  insUP.run("PAT-MZ260812", patPwd, "陈建国(患者)", "patient", p1, "康复科");
  insUP.run("PAT-ZY260344", patPwd, "孙玉兰(患者)", "patient", p2, "神经内科");
  log(null, "系统初始化", `内置账号 admin/doctor/therapist 及演示患者，统一初始密码 ${INITIAL_PWD}`);
}
seed();

/* ---------------- 方案库：评估方案（标准 / 自定义） ----------------
   方案管理是评估、训练方案的统一出口：评估功能发起评估时直接读取本表，
   训练功能配置患者方案时读取 TRAININGS 训练方案库。

   内置（标准）方案按「先量表、后范式」的临床习惯编排，只用已开放项目（见 PENDING_CODES）：
     · 筛查类：MMSE 单项 / MMSE + MoCA —— 只看整体认知，几分钟出结果
     · 标准评估：MoCA + 6 项范式 —— 认知域定位（注意、执行、语言、视空间）
     · 全面评估：MMSE + MoCA + 6 项范式 —— 双量表交叉，记忆/定向更细 */
const ASSESS_PLANS = (() => {
  const S = (code) => ({ type: "scale", code });
  const P = (code) => ({ type: "paradigm", code });
  const BATTERY = [P("SPAN"), P("SDMT"), P("TMT"), P("STROOP"), P("BNT"), P("CDT")];
  return [
    { name: "快速筛查方案", desc: "初诊快速筛查：MMSE 单项，约 10 分钟", items: [S("MMSE")], minutes: 10 },
    { name: "标准筛查方案", desc: "门诊常规筛查：MMSE + MoCA，约 20 分钟", items: [S("MMSE"), S("MoCA")], minutes: 20 },
    { name: "全面评估方案", desc: "六域全面评估：MMSE + MoCA 双量表，配 6 项范式（记忆由量表延迟回忆条目覆盖），约 55 分钟",
      items: [S("MMSE"), S("MoCA"), ...BATTERY], minutes: 55 },
    { name: "标准评估方案", desc: "临床常用「量表 + 范式」组合：MoCA 整体筛查，配数字广度、符号数字、连线、色词、命名、画钟 6 项范式，覆盖注意、执行、语言、视空间，约 45 分钟",
      items: [S("MoCA"), ...BATTERY], minutes: 45 },
  ];
})();

function seedPlanLib() {
  const c = db.prepare("SELECT COUNT(*) c FROM plan_lib").get().c;
  if (c) return;
  const ins = db.prepare(`INSERT INTO plan_lib(kind,category,name,desc,items,minutes,is_builtin,created_by)
    VALUES(?,?,?,?,?,?,?,?)`);
  ASSESS_PLANS.forEach(p => ins.run("assess", "standard", p.name, p.desc, JSON.stringify(p.items), p.minutes, 1, "系统内置"));
  ins.run("assess", "custom", "执行功能专项", "自定义示例：连线 + 色词干扰 + 伦敦塔，聚焦执行功能",
    JSON.stringify([{ type: "paradigm", code: "TMT" }, { type: "paradigm", code: "STROOP" }, { type: "paradigm", code: "TOL" }]), 30, 0, "张医生");
  log(null, "初始化方案库", "4 个标准评估方案 + 1 个自定义方案");
}
seedPlanLib();

/* 内置方案随版本升级同步：只覆盖标准方案的条目/说明/时长，不动自定义方案 */
function syncBuiltinPlans() {
  const upd = db.prepare(`UPDATE plan_lib SET items=?,desc=?,minutes=?,updated_at=datetime('now','localtime')
    WHERE kind='assess' AND is_builtin=1 AND name=? AND items<>?`);
  let n = 0;
  for (const p of ASSESS_PLANS) {
    const js = JSON.stringify(p.items);
    n += upd.run(js, p.desc, p.minutes, p.name, js).changes;
  }
  if (n) log(null, "更新内置评估方案", `${n} 个标准方案已按当前口径同步`);
  return n;
}
// 方案时长 = 各项目时长之和（量表原文为「8–10」这类区间，取首个数），向上取 5 分钟
function planMinutes(items) {
  const sum = items.reduce((a, it) => {
    const src = it.type === "scale" ? SCALES.find(s => s.code === it.code) : PARADIGMS.find(p => p.code === it.code);
    const m = String((src && src.minutes) || "").match(/\d+/);
    return a + (m ? Number(m[0]) : 0);
  }, 0);
  return Math.max(5, Math.ceil(sum / 5) * 5);
}
/* 存量方案里若含待开放项目，把该条目摘掉（医生已无法再勾选），时长按剩余项目重算 */
function stripPendingFromPlans() {
  const rows = db.prepare("SELECT id, items FROM plan_lib WHERE kind='assess'").all();
  const upd = db.prepare("UPDATE plan_lib SET items=?,minutes=?,updated_at=datetime('now','localtime') WHERE id=?");
  let n = 0;
  for (const r of rows) {
    let items;
    try { items = JSON.parse(r.items || "[]"); } catch (e) { continue; }
    const keep = items.filter(it => !PENDING_CODES.includes(it.code));
    if (keep.length === items.length || !keep.length) continue;
    upd.run(JSON.stringify(keep), planMinutes(keep), r.id);
    n++;
  }
  if (n) log(null, "清理方案待开放项目", `${n} 个评估方案已移除未开放条目`);
  return n;
}
syncBuiltinPlans();
stripPendingFromPlans();

/* ---------------- 认证与RBAC ---------------- */
const rolePerms = (role) => {
  if (role === "patient" || role === "family") return [];
  // 以角色表为准（管理端可维护）；停用的角色不再获得任何权限
  try {
    const r = db.prepare("SELECT perms,status FROM sys_role WHERE rkey=?").get(role);
    if (r) return r.status ? (JSON.parse(r.perms || "[]") || []) : [];
  } catch (e) { /* 表尚未建立时回退到内置定义 */ }
  const f = ROLES.find(x => x.key === role);
  return f ? f.perms : [];
};
// 患者端账号：本人与家属代操作账号
const isPatientSide = (role) => role === "patient" || role === "family";
const auth = (req, res, next) => {
  const tk = (req.headers.authorization || "").replace("Bearer ", "");
  try {
    req.user = jwt.verify(tk, JWT_SECRET);
    // 每次按当前角色定义重算，角色权限变更后无需重新登录
    req.user.perms = rolePerms(req.user.role);
    next();
  } catch (e) {
    res.status(401).json({ code: 401, message: "未登录或会话已过期", data: null });
  }
};
const perm = (key) => (req, res, next) => {
  if (req.user.role === "admin" || (req.user.perms || []).includes(key)) next();
  else res.status(403).json({ code: 403, message: "无权限：" + key, data: null });
};
const ok = (res, data = null, message = "success") => res.json({ code: 0, message, data });
const bad = (res, code, message) => res.status(code).json({ code, message, data: null });

/* ---------------- 引擎：量表计分 ---------------- */
const scaleByCode = (c) => SCALES.find(s => s.code === c);
function scoreScale(code, answers, patient) {
  const sc = scaleByCode(code);
  if (!sc) throw new Error("未知量表 " + code);
  let total = 0, byGroup = {};
  for (const it of sc.items) {
    const v = answers[it.id] ?? 0;
    total += Number(v) || 0;
    byGroup[it.g] = (byGroup[it.g] || 0) + (Number(v) || 0);
  }
  let adjust = 0;
  if (sc.adjust && sc.adjust.type === "education_le12_add1") {
    const eduYears = { "文盲": 0, "小学": 6, "初中": 9, "高中": 12, "大学及以上": 16 }[patient.education] ?? 9;
    if (eduYears <= 12) adjust = 1;
  }
  total = Math.min(total + adjust, sc.total); // 教育调整后不超过满分
  // 参考范围判定（非诊断性表述）
  let verdict = "供医师判读";
  if (sc.cutoff) {
    if (sc.cutoff.edu) {
      const cut = (sc.cutoff.edu.find(e => patient.education && patient.education.startsWith(e[0])) || sc.cutoff.edu[sc.cutoff.edu.length - 1])[1];
      verdict = (sc.direction === "higher_better" ? total < cut : total > cut) ? `低于参考范围（分界 ${cut} 分）` : `处于参考范围内（分界 ${cut} 分）`;
    } else if (sc.cutoff.fixed != null) {
      const cut = sc.cutoff.fixed;
      verdict = (sc.direction === "higher_better" ? total < cut : total > cut) ? `低于参考范围（分界 ${cut} 分）` : `处于参考范围内（分界 ${cut} 分）`;
    }
  }
  return { kind: "scale", code, name: sc.name, total, max: sc.total, adjust, byGroup, verdict, direction: sc.direction };
}

/* ---------------- 引擎：范式评分 ---------------- */
// raw: 各 runner 上报的原始数据；返回指标与六域画像贡献
function scoreParadigm(code, raw) {
  const p = PARADIGMS.find(x => x.code === code);
  if (!p) throw new Error("未知范式 " + code);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pct = (v) => Math.round(clamp(v, 0, 100));
  let metrics = {}, domainScore = null, domain = p.domain;
  switch (p.runner) {
    case "span": {
      metrics = { 顺背广度: raw.fwd, 倒背广度: raw.bwd };
      domainScore = pct(((raw.fwd || 0) / 9) * 55 + ((raw.bwd || 0) / 8) * 45);
      break;
    }
    case "cpt": {
      const acc = pct((raw.hits / (raw.targets || 1)) * 100), miss = pct(100 - acc);
      metrics = { 正确率: acc + "%", 漏报率: miss + "%", 平均反应时: Math.round(raw.avgRt || 0) + "ms" };
      domainScore = pct(acc * 0.7 + (raw.avgRt ? clamp(100 - (raw.avgRt - 400) / 8, 0, 100) : 60) * 0.3);
      break;
    }
    case "sdmt": {
      // 90 秒正确数 / 错误数 / 完成量（练习行不计分；满分按记录单 110，实际表 105 格）
      const c = clamp(Number(raw.count) || 0, 0, 110);
      const w = clamp(Number(raw.wrong) || 0, 0, 110);
      const filled = raw.filled != null ? clamp(Number(raw.filled) || 0, 0, 105) : Math.min(105, c + w);
      metrics = { 正确数: c + " 个", 错误数: w + " 个", 完成量: filled + " 个", 用时: (Number(raw.duration) || 90) + " 秒" };
      domainScore = pct(clamp((c / 105) * 100, 0, 100));
      break;
    }
    case "tmt": {
      const ref = { A: 45, B: 90 };
      const sA = clamp((ref.A * 1.8 / Math.max(raw.timeA, 10)) * 100, 0, 100);
      const sB = raw.timeB ? clamp((ref.B * 1.8 / Math.max(raw.timeB, 10)) * 100, 0, 100) : null;
      metrics = { "A完成时间": Math.round(raw.timeA) + "s", "B完成时间": raw.timeB ? Math.round(raw.timeB) + "s" : "未完成", 错误数: raw.errors || 0 };
      domainScore = pct(sB == null ? sA : sA * 0.4 + sB * 0.6);
      break;
    }
    case "stroop": {
      const accI = pct((raw.congCorrect / (raw.congN || 1)) * 100), accN = pct((raw.incongCorrect / (raw.incongN || 1)) * 100);
      metrics = { "一致正确率": accI + "%", "不一致正确率": accN + "%", 干扰量: Math.round((raw.incongRt || 0) - (raw.congRt || 0)) + "ms" };
      domainScore = pct(accI * 0.3 + accN * 0.7);
      break;
    }
    case "tol": {
      metrics = { 达标题数: raw.solved + "/" + raw.total, 平均步数超出: raw.extraMoves, 总用时: Math.round(raw.time) + "s" };
      domainScore = pct((raw.solved / (raw.total || 1)) * 100);
      break;
    }
    case "avlt": {
      metrics = { 第1次即刻回忆: raw.imm1 + "/12", 干扰后回忆: raw.immB + "/12", 延迟回忆: raw.delay + "/12", 再认正确: raw.recog };
      domainScore = pct((raw.delay / 12) * 70 + (raw.recogAcc / 12) * 30);
      break;
    }
    case "rec": {
      const d = clamp(((raw.hits / 8) - (raw.fa / 8)) * 100, 0, 100);
      metrics = { 命中数: raw.hits + "/8", 虚报数: raw.fa + "/8", 辨别力: Math.round(d) };
      domainScore = pct(d);
      break;
    }
    case "bnt": {
      metrics = { 自发命名数: raw.spo + "/" + raw.total, 提示后命名数: raw.hinted, 提示使用: raw.hintUsed };
      domainScore = pct(((raw.spo + raw.hinted * 0.5) / (raw.total || 1)) * 100);
      break;
    }
    case "flu": {
      metrics = { 动物词数: raw.animal, "“大”字词数": raw.da };
      domainScore = pct(clamp(raw.animal * 5, 0, 100) * 0.5 + clamp(raw.da * 5, 0, 100) * 0.5);
      break;
    }
    case "canvas": {
      metrics = { "要素得分": raw.score + "/" + (raw.max || 10), 复核: raw.reviewed ? "医生已复核" : "待医生复核" };
      domainScore = pct((raw.score / (raw.max || 10)) * 100);
      break;
    }
    default: { metrics = raw; domainScore = 60; }
  }
  return { kind: "paradigm", code, name: p.name, domain, metrics, domainScore, verdict: "供医师判读" };
}

/* 范式题目化计分：answers = { 题目ID: 得分 }，按题目分组汇总为指标 */
function scoreParadigmByItems(code, answers, patient, answerMap) {
  const p = PARADIGMS.find(x => x.code === code);
  if (!p || !p.items) return null;
  let total = 0, max = 0, byGroup = {}, byGroupMax = {};
  const scores = {};
  for (const it of p.items) {
    if (it.demo) continue;
    const v = Number(answers[it.id]) || 0;
    const m = it.scoring === "item"
      ? (it.max || 0)
      : (it.parts || []).reduce((a, pt) => a + (pt.max != null ? pt.max : 1), 0);
    scores[it.id] = Math.max(0, Math.min(m, v));
    total += scores[it.id]; max += m;
    byGroup[it.g] = (byGroup[it.g] || 0) + scores[it.id];
    byGroupMax[it.g] = (byGroupMax[it.g] || 0) + m;
  }
  const baseScore = max ? Math.max(0, Math.min(100, Math.round((total / max) * 100))) : 0;
  const domainScore = paradigmDomainScore(code, baseScore, patient, answerMap || {});
  const ind = paradigmIndicators(code, p, scores, answerMap || {}, {
    total, max, education: patient ? patient.education : "", age: ageFrom(patient && patient.birth_date),
  });
  const metrics = paradigmMetrics(code, ind, byGroup);
  return {
    kind: "paradigm", code, name: p.name, domain: p.domain,
    total, max, metrics, byGroup, byGroupMax, domainScore, ind,
    verdict: "供医师判读", reviewed: true,
  };
}

/* ---------------- 引擎：审核阶段逐题评分 ----------------
   施测阶段只记录作答；审核阶段由医护人员逐题核对作答并给分，
   带标准答案的填空/连线单元给出自动建议分（可被覆盖），其余单元交由人工判定。 */
/* 时间定向的期望值必须以「施测当天」为准：跨天（甚至隔日）审核时若按审核当天计算，
   会把患者当时的正确回答误判为错误。base 传入 assess_record.started_at。 */
const expectVals = (base) => {
  const d = base ? new Date(String(base).replace(" ", "T")) : new Date();
  const t = isNaN(d.getTime()) ? new Date() : d;
  const m = t.getMonth() + 1;
  return {
    "@year": String(t.getFullYear()), "@month": String(m), "@day": String(t.getDate()),
    "@weekday": ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][t.getDay()],
    "@season": (m <= 2 || m === 12) ? "冬季" : m <= 5 ? "春季" : m <= 8 ? "夏季" : "秋季",
  };
};
const normAns = (v) => String(v == null ? "" : v).trim().toLowerCase()
  .replace(/\s+/g, "").replace(/[年月日号层楼个第]/g, "").replace(/^0+(?=\d)/, "");
/* 口语变体归一：临床上「秋」「秋天」均应判为「秋季」，「周三」「礼拜三」均应判为「星期三」，
   否则自动建议分会把正确回答误判为 0 分（医生虽可覆盖，但不应默认给错）。 */
const aliasAns = (s) => {
  let x = String(s || "");
  x = x.replace(/^(周|礼拜)/, "星期");            // 周三 / 礼拜三 → 星期三
  x = x.replace(/^([春夏秋冬])(天)?$/, "$1季");   // 秋 / 秋天 → 秋季
  return x;
};
const cmpExpect = (val, expect, base) => {
  const e = expectVals(base)[expect] || expect;
  const a = aliasAns(normAns(val)), b = aliasAns(normAns(e));
  if (!a || !b) return false;
  return a === b || (Number(a) > 0 && Number(a) === Number(b));
};
// 自动建议分：只预判有标准答案的填空/连线/选择单元，口述/手写/操作类一律 0 分交人工判定
// base = 施测时间（assess_record.started_at），用于时间定向题的期望值
function autoItemScore(it, ans, base) {
  if (it.scoring === "item") return 0;
  const parts = it.parts || [];
  const got = (ans && Array.isArray(ans.parts)) ? ans.parts : [];
  let s = 0;
  parts.forEach((p, i) => {
    if (p.mode !== "fill" && p.mode !== "order" && p.mode !== "choice") return;
    if (p.expect && cmpExpect(got[i], p.expect, base)) s += (p.max != null ? p.max : 1);
  });
  return Math.min(s, itemMaxOf(it));
}

/* 明细构建 / 域得分 / 项目指标的实现在 server/detail-builder.js：
   提交评分、历史报告重算、演示数据修复共用同一份，避免第二套口径。 */

/* 认知域画像：只统计实测域（有范式结果）；未测域不入画像、不进结论 */
function buildRadar(results) {
  const doms = ["复合性注意", "执行能力", "学习与记忆", "语言", "视结构-知觉能力", "社会认知"];
  const map = { "注意": "复合性注意", "执行": "执行能力", "记忆": "学习与记忆", "语言": "语言", "视空间": "视结构-知觉能力" };
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  const acc = {};
  for (const r of results) {
    if (r.kind === "paradigm" && r.domainScore != null) {
      const d = map[r.domain] || r.domain;
      (acc[d] = acc[d] || []).push(clamp(r.domainScore));
    }
  }
  const radar = {};
  for (const d of doms) {
    if (d === "社会认知") continue;                      // 无标准范式，最后按实测域推算
    if (acc[d] && acc[d].length) radar[d] = clamp(acc[d].reduce((a, b) => a + b) / acc[d].length);
  }
  const measured = doms.filter(d => d !== "社会认知" && radar[d] != null);
  if (measured.length) radar["社会认知"] = Math.round(measured.reduce((a, d) => a + radar[d], 0) / measured.length);
  return measured.length ? radar : null;               // 一个域都没测 → 不生成画像
}

function domainLevel(v) { return v >= 75 ? "正常" : v >= 55 ? "轻度受损" : "明显受损"; }

/* 各项目完成情况（chart）统一由 server/report-chart.js 生成：
   量表 → 得分/满分/参考分界；范式 → 该范式实际计分维度 + 过程指标。
   这里不再保留第二套实现，避免两处口径漂移。 */

function buildConclusion(radar, results) {
  const TAIL = "本报告仅供医疗专业人员参考，不能单独作为诊断依据。建议由医师结合临床进行解读。";
  if (!radar || !Object.keys(radar).length) {
    return ["各项评估已完成。", "本次评估未包含认知域范式，不生成认知域结论。", TAIL].join("\n");
  }
  const ORDER = ["复合性注意", "执行能力", "学习与记忆", "语言", "视结构-知觉能力", "社会认知"];
  const keys = ORDER.filter((k) => radar[k] != null)
    .concat(Object.keys(radar).filter((k) => !ORDER.includes(k)));
  const weak = keys.filter((k) => radar[k] < 55);
  const mid = keys.filter((k) => radar[k] >= 55 && radar[k] < 75);
  const lines = ["各项评估已完成。"];
  if (!weak.length && !mid.length) lines.push("各认知域结果处于参考范围内。");
  weak.forEach((k) => lines.push(`【${k}】结果低于参考范围；`));
  mid.forEach((k) => lines.push(`【${k}】处于临界水平，建议关注；`));
  lines.push(TAIL);
  return lines.join("\n");
}

/* ---------------- 引擎：训练自适应（PRD 表7-1 统一规则） ---------------- */
function judgeLevel(trials, levelParams) {
  const valid = trials.length || 1;
  const hinted = trials.filter(t => t.hinted).length;
  const accRaw = trials.filter(t => t.correct).length / valid;
  const acc = hinted ? accRaw * 0.8 : accRaw;               // 使用提示的关卡按80%折算
  const avgRt = Math.round(trials.reduce((a, t) => a + (t.rt || 0), 0) / valid);
  const rtLimit = (levelParams && levelParams.rtl) ? levelParams.rtl : 5000;
  const pass = acc >= 0.80 && avgRt <= rtLimit;
  const excellent = acc >= 0.95 && trials.every(t => !t.miss);
  return { acc: Math.round(acc * 1000) / 1000, accPct: Math.round(acc * 100), avgRt, hinted, pass, excellent };
}

/* ---------------- 引擎：训练推荐（SRS FR-D-09） ---------------- */
function recommend(patientId) {
  const rep = db.prepare(`SELECT r.* FROM report r WHERE r.patient_id=? ORDER BY r.id DESC LIMIT 1`).get(patientId);
  if (!rep) return { ok: false, message: "该患者尚无评估报告，请先完成评估（不允许无依据开方）" };
  const radar = JSON.parse(rep.radar);
  if (!radar) return { ok: false, message: "该患者最近一次评估仅记录作答、未评分，无认知域画像，暂无法自动推荐训练方案" };
  const p = db.prepare("SELECT * FROM patient WHERE id=?").get(patientId);
  const age = p ? Math.floor((Date.now() - new Date(p.birth_date)) / 31557600000) : 60;
  const plans = [];
  const dom2progs = {};
  for (const t of TRAININGS) (dom2progs[t.domain] = dom2progs[t.domain] || []).push(t);
  for (const [dom, v] of Object.entries(radar)) {
    const lvl = domainLevel(v);
    const rule = RECOMMEND[lvl === "正常" ? "normal" : lvl === "轻度受损" ? "mild" : "marked"];
    let start = rule.start;
    if (lvl !== "正常") {
      const mocaRow = db.prepare(`SELECT d.payload FROM assess_detail d JOIN assess_record r ON r.id=d.record_id
        WHERE r.patient_id=? AND d.code='MoCA' ORDER BY d.id DESC LIMIT 1`).get(patientId);
      const mocaTotal = mocaRow ? (JSON.parse(mocaRow.payload).total ?? 30) : 30;
      if (mocaTotal < RECOMMEND.mocaLow) start = Math.max(1, start - 1);
    }
    if (age < 18) start = 1;
    const progs = (dom2progs[dom] || []).slice(0, rule.plans);
    for (const pr of progs) plans.push({ domain: dom, level: lvl, program: pr.code, name: pr.name, start, archetype: pr.archetype });
  }
  // 评估项目明细：供训练方案页左侧展示「患者评估项目的具体结果」
  const results = db.prepare("SELECT code,payload FROM assess_detail WHERE record_id=? ORDER BY id").all(rep.record_id).map(x => {
    const d = JSON.parse(x.payload);
    return {
      code: x.code, name: d.name || x.code, kind: d.kind || "scale",
      domain: d.domain || "", total: d.total == null ? null : d.total, max: d.max || null,
      score: d.domainScore != null ? d.domainScore : (d.max ? Math.round((d.total / d.max) * 100) : null),
    };
  });
  /* 与报告页同一事实源：按当前范式定义现算，不做百分制或跨范式换算 */
  let chart = [];
  try { chart = chartOfRecord(db, rep.record_id, p); } catch (e) { chart = []; }
  return {
    ok: true, radar, plans, results, chart,
    reportNo: rep.report_no || "", at: rep.created_at || "",
    minutes: RECOMMEND.sessionMinutes, freq: 3, weeks: 12,
  };
}

/* ---------------- API 路由 ---------------- */
const app = express();
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => { console.log(req.method, req.url); next(); });

// 认证
app.post("/api/v1/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare("SELECT * FROM sys_user WHERE username=? AND is_deleted=0").get(String(username || "").trim());
  if (!u || !bcrypt.compareSync(String(password || ""), u.password_hash)) {
    log(u, "登录失败", "用户名或密码错误");
    return bad(res, 400, "用户名或密码错误（连续5次将锁定10分钟）");
  }
  if (!u.status) return bad(res, 403, "账号已停用，请联系管理员");
  const tk = jwt.sign({ id: u.id, username: u.username, name: u.real_name, role: u.role, refId: u.ref_id, perms: rolePerms(u.role) }, JWT_SECRET, { expiresIn: "8h" });
  log(u, "登录成功", "角色 " + u.role);
  ok(res, { token: tk, user: { id: u.id, username: u.username, name: u.real_name, role: u.role, refId: u.ref_id } });
});
app.get("/api/v1/auth/profile", auth, (req, res) => ok(res, req.user));
app.post("/api/v1/auth/password", auth, (req, res) => {
  const { old: op, np } = req.body || {};
  const u = db.prepare("SELECT * FROM sys_user WHERE id=?").get(req.user.id);
  if (!bcrypt.compareSync(op || "", u.password_hash)) return bad(res, 400, "原密码不正确");
  if (!/^[A-Za-z0-9]{6,16}$/.test(np || "")) return bad(res, 400, "新密码须为6-16位字母或数字组合");
  db.prepare("UPDATE sys_user SET password_hash=? WHERE id=?").run(bcrypt.hashSync(np, 10), u.id);
  log(u, "修改密码", "");
  ok(res);
});

/* ---------------- 患者登录信息（家庭训练场景） ---------------- */
// 二维码固定指向患者端登录页：患者扫码后输入任务账号 + 初始密码登录，
// 二维码本身不承载一次性票据，不存在过期问题，也无需反复生成。
// （ticket-login 接口保留，用于已发出的旧登录码：5 分钟内有效、仅可使用一次）
app.post("/api/v1/patients/:id/ticket", auth, perm("doc:patient"), (req, res) => {
  const p = patientRow(req.params.id);
  if (!p) return bad(res, 404, "患者不存在");
  const u = db.prepare("SELECT * FROM sys_user WHERE role='patient' AND ref_id=? AND is_deleted=0").get(p.id);
  if (!u) return bad(res, 400, "该患者尚无任务账号");
  if (!u.status) return bad(res, 400, "该患者账号已停用，请先在患者管理中启用");
  const host = String(req.headers.host || "localhost").split(":")[0];
  const port = ENTRIES.find(e => e.key === "patient").port;
  log(req.user, "查看患者登录信息", p.name + " / " + u.username);
  ok(res, {
    url: `http://${host}:${port}/patient`,
    account: u.username,
    password: INITIAL_PWD,
  });
});
app.post("/api/v1/auth/ticket-login", (req, res) => {
  const { ticket } = req.body || {};
  if (!ticket) return bad(res, 400, "登录码无效");
  const row = db.prepare("SELECT * FROM login_ticket WHERE ticket=?").get(String(ticket));
  if (!row) return bad(res, 400, "登录码无效，请向医务人员重新获取");
  if (row.used_at) return bad(res, 400, "登录码已使用，请向医务人员重新获取");
  const expired = db.prepare("SELECT datetime('now','localtime') > ? e").get(row.expires_at).e;
  if (expired) return bad(res, 400, "登录码已过期，请向医务人员重新获取");
  const u = db.prepare("SELECT * FROM sys_user WHERE id=? AND is_deleted=0").get(row.user_id);
  if (!u) return bad(res, 400, "账号不存在");
  if (!u.status) return bad(res, 403, "账号已停用，请联系医务人员");
  db.prepare("UPDATE login_ticket SET used_at=datetime('now','localtime') WHERE id=?").run(row.id);
  const tk = jwt.sign({ id: u.id, username: u.username, name: u.real_name, role: u.role, refId: u.ref_id, perms: rolePerms(u.role) }, JWT_SECRET, { expiresIn: "8h" });
  log(u, "扫码登录", "一次性登录码");
  ok(res, { token: tk, user: { id: u.id, username: u.username, name: u.real_name, role: u.role, refId: u.ref_id } });
});

/* ---------------- 手机号登录（家庭训练主路径） ---------------- */
const SMS_TTL_MINUTES = 5;
const normPhone = (v) => String(v || "").replace(/[^\d]/g, "").replace(/^86(?=\d{11}$)/, "");
// 患者端账号（本人 + 家属）按手机号匹配；患者账号回落到患者档案里的联系电话
const accountsByPhone = (phone) => db.prepare(`SELECT u.id,u.username,u.real_name,u.role,u.ref_id,
    COALESCE(p.name,u.real_name) name, p.outpatient_no
  FROM sys_user u LEFT JOIN patient p ON p.id=u.ref_id
  WHERE u.is_deleted=0 AND u.status=1 AND u.role IN ('patient','family')
    AND (u.phone=? OR (u.role='patient' AND p.phone=?))
  ORDER BY u.role='patient' DESC, u.id`).all(phone, phone);

app.post("/api/v1/auth/sms-code", (req, res) => {
  const body = req.body || {};
  const phone = normPhone(body.phone);
  const bind = !!body.bind;   // 绑定手机号场景：号码尚未登记也允许发码
  if (!/^1\d{10}$/.test(phone)) return bad(res, 400, "请输入 11 位手机号");
  if (!bind && !accountsByPhone(phone).length) return bad(res, 400, "该手机号尚未登记，请联系医务人员");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.prepare(`INSERT INTO sms_code(phone,code,expires_at,tries,created_at)
    VALUES(?,?,datetime('now','localtime','+${SMS_TTL_MINUTES} minutes'),0,datetime('now','localtime'))
    ON CONFLICT(phone) DO UPDATE SET code=excluded.code,expires_at=excluded.expires_at,tries=0,
      created_at=excluded.created_at`).run(phone, code);
  // 体验版无短信网关：直接回传验证码并在界面提示；正式版对接医院短信平台后置空
  const demo = process.env.SMS_GATEWAY !== "on";
  ok(res, { phone, demo, code: demo ? code : undefined, minutes: SMS_TTL_MINUTES },
    demo ? "体验版验证码已生成" : "验证码已发送");
});
app.post("/api/v1/auth/sms-login", (req, res) => {
  const { code, userId } = req.body || {};
  const phone = normPhone((req.body || {}).phone);
  if (!/^1\d{10}$/.test(phone)) return bad(res, 400, "请输入 11 位手机号");
  const row = db.prepare("SELECT * FROM sms_code WHERE phone=?").get(phone);
  if (!row) return bad(res, 400, "请先获取验证码");
  if (db.prepare("SELECT datetime('now','localtime') > ? e").get(row.expires_at).e)
    return bad(res, 400, "验证码已过期，请重新获取");
  if (row.tries >= 5) return bad(res, 400, "验证码错误次数过多，请重新获取");
  if (String(code || "") !== row.code) {
    db.prepare("UPDATE sms_code SET tries=tries+1 WHERE phone=?").run(phone);
    return bad(res, 400, "验证码不正确");
  }
  const hits = accountsByPhone(phone);
  if (!hits.length) return bad(res, 400, "该手机号尚未登记，请联系医务人员");
  if (!userId && hits.length > 1)
    return ok(res, { needPick: true, candidates: hits.map(h => ({ id: h.id, name: h.name, role: h.role, outpatient_no: h.outpatient_no })) });
  const u = hits.find(h => h.id === +userId) || hits[0];
  db.prepare("DELETE FROM sms_code WHERE phone=?").run(phone);
  const tk = jwt.sign({ id: u.id, username: u.username, name: u.real_name, role: u.role, refId: u.ref_id, perms: rolePerms(u.role) }, JWT_SECRET, { expiresIn: "30d" });
  log(u, "手机号登录", phone.slice(0, 3) + "****" + phone.slice(-4));
  ok(res, { token: tk, user: { id: u.id, username: u.username, name: u.real_name, role: u.role, refId: u.ref_id } });
});
// 登录后绑定手机号：首次到院扫码/账号登录后补绑，之后在家用手机号登录
app.post("/api/v1/my/bind-phone", auth, (req, res) => {
  if (!isPatientSide(req.user.role)) return bad(res, 403, "仅患者账号");
  const { code } = req.body || {};
  const phone = normPhone((req.body || {}).phone);
  if (!/^1\d{10}$/.test(phone)) return bad(res, 400, "请输入 11 位手机号");
  const row = db.prepare("SELECT * FROM sms_code WHERE phone=?").get(phone);
  if (!row || String(code || "") !== row.code) return bad(res, 400, "验证码不正确");
  if (db.prepare("SELECT datetime('now','localtime') > ? e").get(row.expires_at).e)
    return bad(res, 400, "验证码已过期，请重新获取");
  db.prepare("UPDATE sys_user SET phone=? WHERE id=?").run(phone, req.user.id);
  db.prepare("DELETE FROM sms_code WHERE phone=?").run(phone);
  log(req.user, "绑定手机号", phone.slice(0, 3) + "****" + phone.slice(-4));
  ok(res, null, "已绑定，下次可用手机号登录");
});

/* ---------------- 业务字典 ---------------- */
// 登录用户可读：医生端、患者端下拉框统一取数；管理端传 all=1 时含停用项
app.get("/api/v1/dict", auth, (req, res) => ok(res, dictTypes().filter(t => t.status).map(t => ({ type: t.type, name: t.name, scopes: t.scopes }))));
app.get("/api/v1/dict/:type", auth, (req, res) => {
  const all = req.query.all === "1" && req.user.role === "admin";
  ok(res, dictList(req.params.type, all));
});
// 管理端维护
app.get("/api/v1/admin/dict", auth, perm("admin:config"), (req, res) => {
  const types = dictTypes();
  const type = req.query.type || (types[0] ? types[0].type : "");
  ok(res, {
    types, rows: dictList(type, true),
    counts: Object.fromEntries(types.map(t =>
      [t.type, db.prepare("SELECT COUNT(*) c FROM sys_dict WHERE type=?").get(t.type).c])),
  });
});
// 字典类型：新增 / 编辑 / 删除（内置类型不可删，有字典项的类型不可删）
app.post("/api/v1/admin/dict-type", auth, perm("admin:config"), (req, res) => {
  const { type, name, scopes = [], refs = [] } = req.body || {};
  const key = String(type || "").trim();
  if (!/^[a-z][a-z0-9_]{1,29}$/.test(key)) return bad(res, 400, "标识需以小写字母开头，仅含小写字母、数字、下划线");
  if (!String(name || "").trim()) return bad(res, 400, "字典名称不能为空");
  const scope = joinScopes(scopes);
  if (!scope) return bad(res, 400, "请至少勾选一个适用范围");
  if (dictTypeRow(key)) return bad(res, 400, "该标识已被占用");
  if (db.prepare("SELECT 1 FROM sys_dict WHERE type=?").get(key)) return bad(res, 400, "该标识已被占用");
  const maxSort = db.prepare("SELECT COALESCE(MAX(sort),0) m FROM sys_dict_type").get().m;
  db.prepare("INSERT INTO sys_dict_type(type,name,scope,refs,builtin,sort) VALUES(?,?,?,?,0,?)")
    .run(key, String(name).trim(), scope,
      JSON.stringify(Array.isArray(refs) ? refs : []), maxSort + 10);
  log(req.user, "新增字典类型", key + " / " + name);
  ok(res, { type: key }, "已新增");
});
app.put("/api/v1/admin/dict-type/:id", auth, perm("admin:config"), (req, res) => {
  const row = db.prepare("SELECT * FROM sys_dict_type WHERE id=?").get(req.params.id);
  if (!row) return bad(res, 404, "字典类型不存在");
  const { name, scopes } = req.body || {};
  if (name !== undefined && !String(name).trim()) return bad(res, 400, "字典名称不能为空");
  const scope = scopes === undefined ? null : joinScopes(scopes);
  if (scopes !== undefined && !scope) return bad(res, 400, "请至少勾选一个适用范围");
  db.prepare(`UPDATE sys_dict_type SET name=COALESCE(?,name),scope=COALESCE(?,scope),
    updated_at=datetime('now','localtime') WHERE id=?`)
    .run(name ? String(name).trim() : null, scope, row.id);
  log(req.user, "修改字典类型", row.type + " / " + (name || row.name));
  ok(res, null, "已保存");
});
app.delete("/api/v1/admin/dict-type/:id", auth, perm("admin:config"), (req, res) => {
  const row = db.prepare("SELECT * FROM sys_dict_type WHERE id=?").get(req.params.id);
  if (!row) return bad(res, 404, "字典类型不存在");
  if (row.builtin) return bad(res, 400, "内置字典类型不可删除");
  const n = db.prepare("SELECT COUNT(*) c FROM sys_dict WHERE type=?").get(row.type).c;
  if (n) return bad(res, 400, `该类型下还有 ${n} 个字典项，请先删除字典项`);
  db.prepare("DELETE FROM sys_dict_type WHERE id=?").run(row.id);
  log(req.user, "删除字典类型", row.type + " / " + row.name);
  ok(res, null, "已删除");
});
app.post("/api/v1/admin/dict", auth, perm("admin:config"), (req, res) => {
  const { type, label, sort = 100, remark = "" } = req.body || {};
  if (!dictTypeRow(type)) return bad(res, 400, "字典类型不存在");
  if (!String(label || "").trim()) return bad(res, 400, "字典项名称不能为空");
  if (db.prepare("SELECT 1 FROM sys_dict WHERE type=? AND label=?").get(type, String(label).trim()))
    return bad(res, 400, "同名项已存在");
  const r = db.prepare("INSERT INTO sys_dict(type,code,label,sort,remark) VALUES(?,?,?,?,?)")
    .run(type, "N" + Date.now().toString().slice(-8), String(label).trim(), +sort || 100, remark);
  log(req.user, "新增字典项", type + " / " + label);
  ok(res, { id: r.lastInsertRowid }, "已新增");
});
app.put("/api/v1/admin/dict/:id", auth, perm("admin:config"), (req, res) => {
  const row = db.prepare("SELECT * FROM sys_dict WHERE id=?").get(req.params.id);
  if (!row) return bad(res, 404, "字典项不存在");
  const { label, sort, status, remark } = req.body || {};
  if (label && String(label).trim() !== row.label &&
      db.prepare("SELECT 1 FROM sys_dict WHERE type=? AND label=?").get(row.type, String(label).trim()))
    return bad(res, 400, "同名项已存在");
  db.prepare(`UPDATE sys_dict SET label=COALESCE(?,label),sort=COALESCE(?,sort),
    status=COALESCE(?,status),remark=COALESCE(?,remark),updated_at=datetime('now','localtime') WHERE id=?`)
    .run(label ? String(label).trim() : null, sort, status, remark, row.id);
  log(req.user, "修改字典项", row.type + " / " + (label || row.label));
  ok(res);
});
app.delete("/api/v1/admin/dict/:id", auth, perm("admin:config"), (req, res) => {
  const row = db.prepare("SELECT * FROM sys_dict WHERE id=?").get(req.params.id);
  if (!row) return bad(res, 404, "字典项不存在");
  // 已被业务数据引用的字典项不做物理删除，改为停用，避免历史记录失去显示名
  const usedOf = {
    dept: ["SELECT COUNT(*) c FROM patient WHERE dept=? AND is_deleted=0", "名患者"],
    education: ["SELECT COUNT(*) c FROM patient WHERE education=? AND is_deleted=0", "名患者"],
    stop_reason: ["SELECT COUNT(*) c FROM assess_record WHERE cancel_reason=?", "次评估"],
  };
  const used = usedOf[row.type]
    ? db.prepare(usedOf[row.type][0]).get(row.label).c
    : 0;
  if (used) {
    db.prepare("UPDATE sys_dict SET status=0,updated_at=datetime('now','localtime') WHERE id=?").run(row.id);
    log(req.user, "停用字典项", row.type + " / " + row.label);
    return ok(res, null, `该项已被 ${used} ${usedOf[row.type][1]}使用，已改为停用，历史记录不受影响`);
  }
  db.prepare("DELETE FROM sys_dict WHERE id=?").run(row.id);
  log(req.user, "删除字典项", row.type + " / " + row.label);
  ok(res, null, "已删除");
});

// 用户管理（管理端）
app.get("/api/v1/users", auth, perm("admin:user"), (req, res) => {
  const kw = `%${req.query.kw || ""}%`;
  const dept = req.query.dept || "";
  const hospital = req.query.hospital || "";
  const status = req.query.status === undefined || req.query.status === "" ? null : +req.query.status;
  const role = req.query.role || "";
  const scope = req.query.scope || "";           // staff=仅医生与治疗师；sys=角色表内的员工账号（不含家属）
  let where = "role!='patient' AND is_deleted=0 AND (real_name LIKE ? OR username LIKE ? OR phone LIKE ?)";
  const args = [kw, kw, kw];
  if (dept) { where += " AND dept=?"; args.push(dept); }
  if (hospital) { where += " AND hospital=?"; args.push(hospital); }
  if (status !== null) { where += " AND status=?"; args.push(status); }
  if (role) { where += " AND role=?"; args.push(role); }
  if (scope === "staff") where += " AND role IN ('doctor','therapist')";
  if (scope === "sys") where += " AND role IN (SELECT rkey FROM sys_role)";
  const total = db.prepare(`SELECT COUNT(*) c FROM sys_user WHERE ${where}`).get(...args).c;
  const limit = Math.min(+req.query.limit || 200, 500);
  const offset = Math.max(+req.query.offset || 0, 0);
  ok(res, {
    total,
    rows: db.prepare(`SELECT id,username,real_name,role,dept,hospital,phone,status,created_by,created_at
      FROM sys_user WHERE ${where} ORDER BY id LIMIT ? OFFSET ?`).all(...args, limit, offset),
  });
});
app.post("/api/v1/users", auth, perm("admin:user"), (req, res) => {
  const { username, real_name, role, dept = "", hospital = "", phone = "" } = req.body || {};
  if (!username || !real_name || !role) return bad(res, 400, "工号、姓名、角色为必填");
  if (db.prepare("SELECT 1 FROM sys_user WHERE username=?").get(username)) return bad(res, 400, "工号已存在");
  if (!db.prepare("SELECT 1 FROM sys_role WHERE rkey=? AND status=1").get(role)) return bad(res, 400, "角色不存在或已停用");
  const r = db.prepare("INSERT INTO sys_user(username,password_hash,real_name,role,dept,hospital,phone,created_by) VALUES(?,?,?,?,?,?,?,?)")
    .run(username, bcrypt.hashSync(INITIAL_PWD, 10), real_name, role, dept, hospital, phone, (req.user.real_name || req.user.username || ""));
  log(req.user, "新增账号", `${username}(${role})`);
  ok(res, { id: r.lastInsertRowid }, "新增成功");
});
app.put("/api/v1/users/:id", auth, perm("admin:user"), (req, res) => {
  const { real_name, role, dept, hospital, phone, status } = req.body || {};
  db.prepare("UPDATE sys_user SET real_name=COALESCE(?,real_name),role=COALESCE(?,role),dept=COALESCE(?,dept),hospital=COALESCE(?,hospital),phone=COALESCE(?,phone),status=COALESCE(?,status) WHERE id=? AND role!='patient'")
    .run(real_name, role, dept, hospital, phone, status, req.params.id);
  log(req.user, "修改账号", "#" + req.params.id);
  ok(res);
});
app.post("/api/v1/users/:id/reset-password", auth, perm("admin:user"), (req, res) => {
  db.prepare("UPDATE sys_user SET password_hash=? WHERE id=?").run(bcrypt.hashSync(INITIAL_PWD, 10), req.params.id);
  log(req.user, "重置密码", "#" + req.params.id);
  ok(res, null, "已重置为初始密码 " + INITIAL_PWD);
});

/* ---------------- 角色管理（系统设置） ---------------- */
// 权限项按端分组，供角色编辑弹窗的权限树使用
const PERM_TREE = () => [
  { key: "admin", name: "管理端", children: MENUS.filter(m => m.end === "admin").map(m => ({ key: m.key, name: m.name })) },
  { key: "doctor", name: "医生端", children: MENUS.filter(m => m.end === "doctor").map(m => ({ key: m.key, name: m.name })) },
];
const parsePerms = (s) => { try { return JSON.parse(s || "[]") || []; } catch (e) { return []; } };

app.get("/api/v1/admin/roles", auth, perm("admin:user"), (req, res) => {
  const used = {};
  db.prepare("SELECT role,COUNT(*) n FROM sys_user WHERE is_deleted=0 GROUP BY role").all().forEach(r => used[r.role] = r.n);
  const rows = db.prepare("SELECT id,rkey,name,status,perms,operator,created_at,updated_at FROM sys_role ORDER BY id").all()
    .map(r => ({ ...r, perms: parsePerms(r.perms), userCount: used[r.rkey] || 0, builtin: ROLES.some(x => x.key === r.rkey) }));
  ok(res, { rows, tree: PERM_TREE() });
});
app.post("/api/v1/admin/roles", auth, perm("admin:user"), (req, res) => {
  const { name, status = 1, perms = [] } = req.body || {};
  if (!name || !String(name).trim()) return bad(res, 400, "角色名称为必填");
  const rkey = "r" + Date.now().toString(36);
  db.prepare("INSERT INTO sys_role(rkey,name,status,perms,operator) VALUES(?,?,?,?,?)")
    .run(rkey, String(name).trim(), status ? 1 : 0, JSON.stringify(perms), req.user.real_name || req.user.username || "");
  log(req.user, "新增角色", String(name).trim());
  ok(res, { rkey }, "已新增");
});
app.put("/api/v1/admin/roles/:id", auth, perm("admin:user"), (req, res) => {
  const r = db.prepare("SELECT * FROM sys_role WHERE id=?").get(req.params.id);
  if (!r) return bad(res, 404, "角色不存在");
  const { name, status, perms } = req.body || {};
  // 系统管理员角色的权限不允许收缩，避免把自己锁在门外
  const nextPerms = r.rkey === "admin" ? parsePerms(r.perms) : (perms ? JSON.stringify(perms) : r.perms);
  db.prepare("UPDATE sys_role SET name=COALESCE(?,name),status=COALESCE(?,status),perms=?,updated_at=datetime('now','localtime') WHERE id=?")
    .run(name ? String(name).trim() : null, status === undefined ? null : (status ? 1 : 0), nextPerms, req.params.id);
  log(req.user, "修改角色", r.name);
  ok(res, null, "已保存");
});
app.delete("/api/v1/admin/roles/:id", auth, perm("admin:user"), (req, res) => {
  const r = db.prepare("SELECT * FROM sys_role WHERE id=?").get(req.params.id);
  if (!r) return bad(res, 404, "角色不存在");
  if (ROLES.some(x => x.key === r.rkey)) return bad(res, 400, "内置角色不可删除");
  const n = db.prepare("SELECT COUNT(*) c FROM sys_user WHERE role=? AND is_deleted=0").get(r.rkey).c;
  if (n) return bad(res, 400, `该角色下仍有 ${n} 个账号，请先调整账号角色`);
  db.prepare("DELETE FROM sys_role WHERE id=?").run(req.params.id);
  log(req.user, "删除角色", r.name);
  ok(res, null, "已删除");
});
// 角色下拉：仅启用角色
app.get("/api/v1/admin/role-options", auth, perm("admin:user"), (req, res) =>
  ok(res, db.prepare("SELECT rkey key,name FROM sys_role WHERE status=1 ORDER BY id").all()));

// 患者账号清单（管理端可维护账号状态与密码；临床档案仍由医生端维护 FR-A-02）
app.get("/api/v1/admin/patient-accounts", auth, perm("admin:user"), (req, res) => {
  const kw = `%${req.query.kw || ""}%`;
  const dept = req.query.dept || "";
  const status = req.query.status === undefined || req.query.status === "" ? null : +req.query.status;
  let where = "u.role='patient' AND u.is_deleted=0 AND (p.name LIKE ? OR p.outpatient_no LIKE ? OR p.phone LIKE ?)";
  const args = [kw, kw, kw];
  if (dept) { where += " AND p.dept=?"; args.push(dept); }
  if (status !== null) { where += " AND u.status=?"; args.push(status); }
  ok(res, db.prepare(`SELECT u.id,u.username,u.status,u.created_at,p.name,p.sex,p.birth_date,p.education,
      p.outpatient_no,p.dept,p.phone,p.guardian,p.id pid,
      (SELECT COUNT(*) FROM train_record t WHERE t.patient_id=p.id) train_count,
      (SELECT COUNT(*) FROM report r WHERE r.patient_id=p.id) report_count,
      (SELECT MAX(t.created_at) FROM train_record t WHERE t.patient_id=p.id) last_train
    FROM sys_user u LEFT JOIN patient p ON p.id=u.ref_id
    WHERE ${where} ORDER BY u.id DESC`).all(...args));
});
app.put("/api/v1/admin/patient-accounts/:id", auth, perm("admin:user"), (req, res) => {
  const u = db.prepare("SELECT * FROM sys_user WHERE id=? AND role='patient'").get(req.params.id);
  if (!u) return bad(res, 404, "患者账号不存在");
  const { status } = req.body || {};
  if (status === undefined) return bad(res, 400, "缺少状态参数");
  db.prepare("UPDATE sys_user SET status=? WHERE id=?").run(+status ? 1 : 0, u.id);
  log(req.user, +status ? "启用患者账号" : "停用患者账号", u.username);
  ok(res, null, +status ? "已启用" : "已停用");
});
app.post("/api/v1/admin/patient-accounts/:id/reset-password", auth, perm("admin:user"), (req, res) => {
  const u = db.prepare("SELECT * FROM sys_user WHERE id=? AND role='patient'").get(req.params.id);
  if (!u) return bad(res, 404, "患者账号不存在");
  db.prepare("UPDATE sys_user SET password_hash=? WHERE id=?").run(bcrypt.hashSync(INITIAL_PWD, 10), u.id);
  log(req.user, "重置患者密码", u.username);
  ok(res, null, "已重置为初始密码 " + INITIAL_PWD);
});

// 患者管理
const patientRow = (id) => db.prepare("SELECT * FROM patient WHERE id=? AND is_deleted=0").get(id);
// 患者账号可读取本人档案（数据隔离：仅限 refId 一致，SEC-02）；家属账号绑定同一患者
const canReadPatient = (user, id) => isPatientSide(user.role) ? user.refId === +id : (user.role === "admin" || (user.perms || []).includes("doc:patient"));
app.get("/api/v1/patients", auth, perm("doc:patient"), (req, res) => {
  sweepExpiredPlans();
  const kw = `%${req.query.kw || ""}%`;
  ok(res, db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM train_plan tp WHERE tp.patient_id = p.id AND tp.status = '进行中') AS active_plans,
      (SELECT tp.weeks FROM train_plan tp WHERE tp.patient_id = p.id AND tp.status = '进行中' ORDER BY tp.id DESC LIMIT 1) AS active_weeks,
      (SELECT CAST(julianday('now','localtime') - julianday(COALESCE(tp.pushed_at, tp.created_at)) AS INTEGER)
         FROM train_plan tp WHERE tp.patient_id = p.id AND tp.status = '进行中' ORDER BY tp.id DESC LIMIT 1) AS active_days,
      (SELECT COUNT(*) FROM report r WHERE r.patient_id = p.id) AS report_count,
      (SELECT COUNT(*) FROM train_record tr WHERE tr.patient_id = p.id) AS train_count,
      (SELECT COUNT(DISTINCT tr.session_id) FROM train_record tr WHERE tr.patient_id = p.id) AS train_sessions,
      (SELECT COUNT(*) FROM assess_record a WHERE a.patient_id = p.id AND a.status = '已完成') AS assess_done,
      CASE WHEN EXISTS(SELECT 1 FROM assess_record a WHERE a.patient_id = p.id AND a.status = '进行中') THEN '进行中'
           WHEN EXISTS(SELECT 1 FROM assess_record a WHERE a.patient_id = p.id AND a.status = '已完成') THEN '已完成'
           ELSE '-' END AS assess_status,
      CASE WHEN EXISTS(SELECT 1 FROM train_plan tp WHERE tp.patient_id = p.id AND tp.status = '进行中') THEN '进行中'
           WHEN EXISTS(SELECT 1 FROM train_plan tp WHERE tp.patient_id = p.id AND tp.status = '已完成') THEN '已完成'
           WHEN EXISTS(SELECT 1 FROM train_plan tp WHERE tp.patient_id = p.id AND tp.status = '已终止') THEN '已终止'
           WHEN EXISTS(SELECT 1 FROM train_record tr WHERE tr.patient_id = p.id) THEN '已完成'
           ELSE '-' END AS train_status
    FROM patient p WHERE p.is_deleted=0 AND (p.name LIKE ? OR p.outpatient_no LIKE ? OR p.phone LIKE ?) ORDER BY p.id DESC`).all(kw, kw, kw));
});
app.post("/api/v1/patients", auth, perm("doc:patient"), (req, res) => {
  const p = req.body || {};
  for (const k of ["name", "sex", "birth_date", "education"]) if (!p[k]) return bad(res, 400, "必填项缺失：" + k);
  if (p.id_card && db.prepare("SELECT 1 FROM patient WHERE id_card=? AND is_deleted=0").get(p.id_card)) return bad(res, 400, "该证件号已建档，禁止重复建档");
  const r = db.prepare(`INSERT INTO patient(name,sex,birth_date,id_card,outpatient_no,education,dept,phone,guardian,history)
    VALUES(@name,@sex,@birth_date,@id_card,@outpatient_no,@education,@dept,@phone,@guardian,@history)`).run(p);
  const no = p.outpatient_no || ("MZ" + String(260000 + r.lastInsertRowid));
  db.prepare("UPDATE patient SET outpatient_no=? WHERE id=?").run(no, r.lastInsertRowid);
  if (!db.prepare("SELECT 1 FROM sys_user WHERE username=?").get("PAT-" + no))
    db.prepare("INSERT INTO sys_user(username,password_hash,real_name,role,ref_id,dept) VALUES(?,?,?,?,?,?)")
      .run("PAT-" + no, bcrypt.hashSync(INITIAL_PWD, 10), p.name + "(患者)", "patient", r.lastInsertRowid, p.dept || "");
  log(req.user, "登记患者", `${p.name} / ${no}`);
  ok(res, { id: r.lastInsertRowid, outpatient_no: no }, "登记成功；患者端账号：PAT-" + no + "，初始密码 " + INITIAL_PWD);
});

/* 家属代操作账号：一个患者可绑定多个家属，家属登录后仅能操作该患者的训练任务 */
app.get("/api/v1/patients/:id/family", auth, perm("doc:patient"), (req, res) => {
  ok(res, db.prepare(`SELECT id,username,real_name,phone,dept relation,status,created_at
    FROM sys_user WHERE role='family' AND ref_id=? AND is_deleted=0 ORDER BY id`).all(+req.params.id));
});
app.post("/api/v1/patients/:id/family", auth, perm("doc:patient"), (req, res) => {
  const p = patientRow(req.params.id);
  if (!p) return bad(res, 404, "患者不存在");
  const { real_name, phone = "", relation = "" } = req.body || {};
  if (!String(real_name || "").trim()) return bad(res, 400, "请填写家属姓名");
  let base = "FAM-" + p.outpatient_no, username = base, i = 1;
  while (db.prepare("SELECT 1 FROM sys_user WHERE username=?").get(username)) username = base + "-" + (++i);
  const r = db.prepare(`INSERT INTO sys_user(username,password_hash,real_name,role,ref_id,phone,dept)
    VALUES(?,?,?,?,?,?,?)`)
    .run(username, bcrypt.hashSync(INITIAL_PWD, 10), String(real_name).trim(), "family", p.id, phone, relation);
  log(req.user, "新增家属账号", p.name + " / " + real_name);
  ok(res, { id: r.lastInsertRowid, username }, "已创建；账号 " + username + "，初始密码 " + INITIAL_PWD);
});
app.put("/api/v1/family/:id", auth, perm("doc:patient"), (req, res) => {
  const u = db.prepare("SELECT * FROM sys_user WHERE id=? AND role='family'").get(req.params.id);
  if (!u) return bad(res, 404, "家属账号不存在");
  const { status, phone, relation } = req.body || {};
  db.prepare("UPDATE sys_user SET status=COALESCE(?,status),phone=COALESCE(?,phone),dept=COALESCE(?,dept) WHERE id=?")
    .run(status, phone, relation, u.id);
  log(req.user, "修改家属账号", u.username);
  ok(res);
});
app.post("/api/v1/family/:id/reset-password", auth, perm("doc:patient"), (req, res) => {
  const u = db.prepare("SELECT * FROM sys_user WHERE id=? AND role='family'").get(req.params.id);
  if (!u) return bad(res, 404, "家属账号不存在");
  db.prepare("UPDATE sys_user SET password_hash=? WHERE id=?").run(bcrypt.hashSync(INITIAL_PWD, 10), u.id);
  log(req.user, "重置家属密码", u.username);
  ok(res, null, "已重置为初始密码 " + INITIAL_PWD);
});
app.delete("/api/v1/family/:id", auth, perm("doc:patient"), (req, res) => {
  const u = db.prepare("SELECT * FROM sys_user WHERE id=? AND role='family'").get(req.params.id);
  if (!u) return bad(res, 404, "家属账号不存在");
  db.prepare("UPDATE sys_user SET is_deleted=1,status=0 WHERE id=?").run(u.id);
  log(req.user, "解除家属绑定", u.username);
  ok(res, null, "已解除绑定");
});
app.get("/api/v1/patients/:id", auth, (req, res) => {
  if (!canReadPatient(req.user, req.params.id)) return bad(res, 403, "无权限：仅可查看本人档案");
  const p = patientRow(req.params.id);
  if (!p) return bad(res, 404, "患者不存在");
  const age = Math.floor((Date.now() - new Date(p.birth_date)) / 31557600000);
  // 已作废不计入临床记录：详情页评估记录表与历次编号都不含作废记录（审计在「评估情况表」已作废 tab）
  const assess = db.prepare(`SELECT r.id,r.plan_name,r.status,r.started_at,r.finished_at,r.patient_id,
      (SELECT rp.id FROM report rp WHERE rp.record_id=r.id) report_id,
      (SELECT rp.report_no FROM report rp WHERE rp.record_id=r.id) report_no
    FROM assess_record r WHERE r.patient_id=? AND r.status<>'已作废' ORDER BY r.id DESC`).all(p.id);
  const plans = db.prepare("SELECT * FROM train_plan WHERE patient_id=? ORDER BY id DESC").all(p.id)
    .map(pl => ({ ...pl, items: JSON.parse(pl.items || "[]") }));
  const reports = db.prepare("SELECT id,record_id,report_no,created_at FROM report WHERE patient_id=? ORDER BY id DESC").all(p.id);
  const trains = db.prepare(`SELECT program, COUNT(*) cnt, ROUND(AVG(acc)*100) acc, MAX(created_at) last_at FROM train_record
    WHERE patient_id=? GROUP BY program`).all(p.id);
  // 训练记录：最近 10 条（开始时间由结算时间 − 用时倒推），全量走「数据记录」
  const progMeta = {}; for (const t of TRAININGS) progMeta[t.code] = t;
  const trainRecords = db.prepare(`SELECT id,program,level,duration_s,acc,result,created_at FROM train_record
    WHERE patient_id=? ORDER BY id DESC LIMIT 10`).all(p.id).map(r => ({
      id: r.id, program: r.program, name: (progMeta[r.program] || {}).name || r.program,
      level: r.level, duration_s: r.duration_s, acc: Math.round((r.acc || 0) * 100),
      result: r.result, started_at: shiftTime(r.created_at, -(r.duration_s || 0)), finished_at: r.created_at,
    }));
  const trainTotal = db.prepare("SELECT COUNT(*) c FROM train_record WHERE patient_id=?").get(p.id).c;
  ok(res, { ...p, age, assess, plans, reports, trains, train_records: trainRecords, train_total: trainTotal });
});

/* 时间平移：把「YYYY-MM-DD HH:mm:ss」按秒偏移（负数向前），用于由结算时间倒推开始时间 */
function shiftTime(ts, sec) {
  const d = new Date(String(ts || "").replace(" ", "T"));
  if (isNaN(d.getTime())) return ts || "";
  d.setSeconds(d.getSeconds() + (sec || 0));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 资产库
// 条目作答单元归一化：没有 parts 的条目按量表默认作答方式生成单一单元
// judge=口述/动作由医生判定(1分) · fill=患者填空(1分) · draw=患者手写绘制(1分) · number=医生录入数值(0~max分)
function partModeOf(it, sc) {
  if (it.draw) return "draw";
  if (it.type === "number") return "number";
  if (it.expect) return "fill";
  return sc.answerMode || "judge";
}
function withParts(sc) {
  if (!sc.items) return sc;
  return {
    ...sc,
    items: sc.items.map(it => it.parts ? it : {
      ...it,
      parts: [{ l: "", mode: partModeOf(it, sc), expect: it.expect || null, max: it.max || null }],
    }),
  };
}
app.get("/api/v1/banks", auth, (req, res) => {
  const cs = catalogOf("scale"), cp = catalogOf("paradigm"), ct = catalogOf("training");
  const pend = (code) => PENDING_CODES.includes(code);   // 待开放：置灰不可选
  ok(res, {
    scales: SCALES.map(s => ({ ...withParts(s), guide: SCALE_GUIDE[s.code] || null, enabled: (cs[s.code] || {}).enabled !== false, pending: pend(s.code), params: (cs[s.code] || {}).params || {} })),
    paradigms: PARADIGMS.map(p => ({ ...withParts(p), guide: PARADIGM_GUIDE[p.code] || null, enabled: (cp[p.code] || {}).enabled !== false, pending: pend(p.code), params: (cp[p.code] || {}).params || {} })),
    trainings: TRAININGS.map(t => ({
      code: t.code, domain: t.domain, name: t.name, archetype: t.archetype, desc: t.desc, levelCount: t.levels.length, levels: t.levels,
      enabled: (ct[t.code] || {}).enabled !== false, params: (ct[t.code] || {}).params || {},
    })),
    menus: MENUS, roles: ROLES,
  });
});

/* ---------------- 项目配置：量表 / 范式 / 训练方案 ---------------- */
app.get("/api/v1/admin/catalog", auth, perm("admin:config"), (req, res) => {
  const kind = req.query.kind || "scale";
  if (!CATALOG_KINDS.some(k => k.kind === kind)) return bad(res, 400, "类型不存在");
  const src = kind === "scale" ? SCALES : kind === "paradigm" ? PARADIGMS : TRAININGS;
  const st = catalogOf(kind);
  const rows = src.map(x => ({
    code: x.code, name: x.name, domain: x.domain || "", minutes: x.minutes || 0,
    levelCount: x.levels ? x.levels.length : 0, metrics: x.metrics || [],
    enabled: (st[x.code] || {}).enabled !== false,
    params: (st[x.code] || {}).params || {},
  }));
  ok(res, { kinds: CATALOG_KINDS, kind, rows });
});
app.put("/api/v1/admin/catalog/:kind/:code", auth, perm("admin:config"), (req, res) => {
  const { kind, code } = req.params;
  if (!CATALOG_KINDS.some(k => k.kind === kind)) return bad(res, 400, "类型不存在");
  const exists = db.prepare("SELECT 1 FROM catalog_item WHERE kind=? AND code=?").get(kind, code);
  if (!exists) return bad(res, 404, "项目不存在");
  const { enabled, params } = req.body || {};
  db.prepare(`UPDATE catalog_item SET enabled=COALESCE(?,enabled),params=COALESCE(?,params),
    updated_at=datetime('now','localtime'),updated_by=? WHERE kind=? AND code=?`)
    .run(enabled === undefined ? null : (enabled ? 1 : 0), params ? JSON.stringify(params) : null,
      req.user.name || req.user.username, kind, code);
  log(req.user, "修改项目配置", kind + " / " + code);
  ok(res);
});

/* ---------------- 方案管理：评估方案库（标准 / 自定义） ---------------- */
// 方案是否正被「进行中」的评估使用（按 plan_id，兼容早期仅存 plan_name 的记录）
function planInUse(plan) {
  if (!plan) return false;
  const hit = db.prepare(`SELECT COUNT(*) c FROM assess_record
    WHERE status='进行中' AND (plan_id=? OR (plan_id=0 AND plan_name=?))`).get(plan.id, plan.name).c;
  return hit > 0;
}
app.get("/api/v1/plan-lib", auth, (req, res) => {
  const kind = req.query.kind || "assess";
  const rows = db.prepare("SELECT * FROM plan_lib WHERE status=1 AND kind=? ORDER BY is_builtin DESC, id").all(kind)
    .map(r => ({ ...r, items: JSON.parse(r.items || "[]"), in_use: planInUse(r) }));
  ok(res, rows);
});
app.post("/api/v1/plan-lib", auth, perm("doc:assess"), (req, res) => {
  const { kind = "assess", category = "custom", name, desc = "", items = [], minutes = 30 } = req.body || {};
  if (!name || !String(name).trim()) return bad(res, 400, "方案名称不能为空");
  if (!items.length) return bad(res, 400, "请至少选择一个评估项目");
  const cat = category === "standard" ? "standard" : "custom";
  const r = db.prepare(`INSERT INTO plan_lib(kind,category,name,desc,items,minutes,is_builtin,created_by)
    VALUES(?,?,?,?,?,?,0,?)`)
    .run(kind, cat, String(name).trim(), desc, JSON.stringify(items), minutes, req.user.name || req.user.real_name || "");
  log(req.user, cat === "standard" ? "新增标准评估方案" : "新增自定义方案", `${name}（${items.length} 项）`);
  ok(res, { id: r.lastInsertRowid }, "方案已保存");
});
app.put("/api/v1/plan-lib/:id", auth, perm("doc:assess"), (req, res) => {
  const row = db.prepare("SELECT * FROM plan_lib WHERE id=?").get(req.params.id);
  if (!row) return bad(res, 404, "方案不存在");
  if (planInUse(row)) return bad(res, 409, `${row.name} 评估进行中，不可修改；请完成评估后再操作！`);
  const { name, desc, items, minutes, category } = req.body || {};
  if (!name || !String(name).trim()) return bad(res, 400, "方案名称不能为空");
  if (!items || !items.length) return bad(res, 400, "请至少选择一个评估项目");
  const cat = category === "standard" ? "standard" : (category === "custom" ? "custom" : row.category);
  db.prepare("UPDATE plan_lib SET name=?,desc=?,items=?,minutes=?,category=?,updated_at=? WHERE id=?")
    .run(String(name).trim(), desc != null ? desc : row.desc, JSON.stringify(items),
      minutes != null ? minutes : row.minutes, cat, now(), row.id);
  log(req.user, cat === "standard" ? "修改标准评估方案" : "修改自定义方案", `${name}（${items.length} 项）`);
  ok(res, { id: row.id }, "方案已更新");
});
app.delete("/api/v1/plan-lib/:id", auth, perm("doc:assess"), (req, res) => {
  const row = db.prepare("SELECT * FROM plan_lib WHERE id=?").get(req.params.id);
  if (!row) return bad(res, 404, "方案不存在");
  if (planInUse(row)) return bad(res, 409, `${row.name} 评估进行中，不可删除；请完成评估后再操作！`);
  db.prepare("DELETE FROM plan_lib WHERE id=?").run(row.id);
  log(req.user, row.category === "standard" ? "删除标准评估方案" : "删除自定义方案", row.name);
  ok(res, null, "方案已删除");
});

// 评估流程
// 评估项目规范化：去掉重复代码、剔除题库中不存在的项目，保证「记录里的项目」与所选方案完全一致
function normalizeItems(raw) {
  const seen = new Set(), out = [];
  for (const it of Array.isArray(raw) ? raw : []) {
    const code = it && it.code;
    if (!code || seen.has(code)) continue;
    const type = it.type === "scale" || it.type === "paradigm" ? it.type : (scaleByCode(code) ? "scale" : "paradigm");
    const exists = type === "scale" ? !!scaleByCode(code) : !!PARADIGMS.find(p => p.code === code);
    if (!exists) continue;
    seen.add(code);
    out.push({ type, code });
  }
  return out;
}

app.post("/api/v1/assessments", auth, perm("doc:assess"), (req, res) => {
  const { patientId, planName = "自定义评估方案", planId = 0 } = req.body || {};
  const items = normalizeItems(req.body && req.body.items);
  if (!patientId || !items.length) return bad(res, 400, "缺少患者或评估项目");
  // 同一患者同时只允许一条未提交的评估；提交生成报告后方可再次发起
  const running = db.prepare("SELECT id,status FROM assess_record WHERE patient_id=? AND status='进行中'").get(patientId);
  if (running) return bad(res, 409, "该患者已有评估正在进行中，请提交或作废后再发起");
  const r = db.prepare("INSERT INTO assess_record(patient_id,doctor_id,plan_name,plan_id,items,mode) VALUES(?,?,?,?,?,?)")
    .run(patientId, req.user.id, planName, planId || 0, JSON.stringify(items), req.body.mode || "doctor");
  log(req.user, "发起评估", `患者#${patientId} ${planName}（核对通过）`);
  ok(res, { recordId: r.lastInsertRowid });
});
app.get("/api/v1/assessments", auth, perm("doc:assess"), (req, res) => {
  const st = req.query.status || "";
  const rows = db.prepare(`SELECT r.id,r.patient_id,r.plan_name,r.items,r.status,r.started_at,r.finished_at,r.cancel_reason,p.name,p.outpatient_no,
      (SELECT COUNT(*) FROM assess_detail d WHERE d.record_id=r.id) done,
      (SELECT COUNT(*) FROM report rp WHERE rp.record_id=r.id) has_report
    FROM assess_record r JOIN patient p ON p.id=r.patient_id
    ${st ? "WHERE r.status=?" : ""} ORDER BY r.id DESC LIMIT 100`).all(...(st ? [st] : []));
  ok(res, rows.map(r => ({ ...r, total: JSON.parse(r.items || "[]").length, items: undefined })));
});
app.get("/api/v1/assessments/:id", auth, (req, res) => {
  const r = db.prepare("SELECT * FROM assess_record WHERE id=?").get(req.params.id);
  if (!r) return bad(res, 404, "记录不存在");
  ok(res, {
    ...r,
    details: db.prepare("SELECT * FROM assess_detail WHERE record_id=? ORDER BY id").all(r.id),
    answered: db.prepare("SELECT code, COUNT(*) c FROM assess_answer WHERE record_id=? GROUP BY code").all(r.id),
    // 已评分题数：主试口述量表（MMSE）不产生作答记录，续测判断要据此
    scored: db.prepare("SELECT code, COUNT(*) c FROM assess_score WHERE record_id=? GROUP BY code").all(r.id),
  });
});
// 量表作答提交（医生端或患者端）
app.post("/api/v1/assessments/:id/scale", auth, (req, res) => {
  const rec = db.prepare("SELECT * FROM assess_record WHERE id=?").get(req.params.id);
  if (!rec) return bad(res, 404, "评估记录不存在");
  const { code, answers } = req.body || {};
  const p = patientRow(rec.patient_id);
  const scored = scoreScale(code, answers || {}, p);
  const sc = scaleByCode(code);
  const ex = db.prepare("SELECT id FROM assess_detail WHERE record_id=? AND code=?").get(rec.id, code);
  if (ex) db.prepare("UPDATE assess_detail SET payload=?, raw=?, reviewed=0 WHERE id=?")
    .run(JSON.stringify(scored), JSON.stringify(answers || {}), ex.id);
  else db.prepare("INSERT INTO assess_detail(record_id,kind,code,name,payload,raw) VALUES(?,?,?,?,?,?)")
    .run(rec.id, "scale", code, sc.name, JSON.stringify(scored), JSON.stringify(answers || {}));
  log(req.user, "量表提交", `${sc.name} 总分${scored.total}/${scored.max}`);
  ok(res, scored);
});
// 画钟/临摹 医生复核打分
app.post("/api/v1/assessments/:id/review", auth, perm("doc:assess"), (req, res) => {
  const { detailId, score, max = 10 } = req.body || {};
  const d = db.prepare("SELECT * FROM assess_detail WHERE id=?").get(detailId);
  if (!d) return bad(res, 404, "明细不存在");
  const scored = scoreParadigm(d.code, { score, max, reviewed: true });
  db.prepare("UPDATE assess_detail SET payload=?, raw=?, reviewed=1 WHERE id=?").run(JSON.stringify(scored), JSON.stringify({ score, max }), detailId);
  log(req.user, "复核评分", `${d.name} ${score}/${max}`);
  ok(res, scored);
});
// 范式原始数据提交（医生端按指导语施测后录入 / 患者端 runner 上报）
app.post("/api/v1/assessments/:id/paradigm", auth, (req, res) => {
  const rec = db.prepare("SELECT * FROM assess_record WHERE id=?").get(req.params.id);
  if (!rec) return bad(res, 404, "评估记录不存在");
  if (rec.status === "已作废") return bad(res, 400, "该评估已作废，不能再记录施测结果");
  const { code, raw, answers, answerMap } = req.body || {};
  const byItems = answers ? scoreParadigmByItems(code, answers, patientRow(rec.patient_id), answerMap) : null;
  const scored = byItems || scoreParadigm(code, raw || {});
  /* 题目化与原始指标可能同时提交（如 SDMT：正确数走题目，错误数/完成量走 raw），合并留存 */
  const stored = Object.assign({}, answers || {}, raw || {});
  /* SDMT：题目化只算正确数，错误数/完成量/判读按 raw 追加进指标 */
  if (code === "SDMT" && raw && typeof raw === "object") {
    const rd = req.body.raw || {};
    const w = Math.max(0, Math.min(110, Number(rd.wrong) || 0));
    const c = Number(scored.total != null ? scored.total : rd.count) || 0;
    const filled = rd.filled != null ? Math.max(0, Math.min(105, Number(rd.filled) || 0)) : Math.min(105, c + w);
    scored.metrics = Object.assign({}, scored.metrics || {}, {
      错误数: w + " 个", 完成量: filled + " 个", 用时: (Number(rd.duration) || 90) + " 秒",
    });
    if (Array.isArray(scored.ind)) {
      scored.ind = scored.ind.filter(x => !["错误数", "完成量", "参考判读"].includes(x.k));
      scored.ind.push({ k: "错误数", v: w + " 个" });
      scored.ind.push({ k: "完成量", v: filled + " 个" });
      scored.ind.push({
        k: "参考判读",
        v: c > 21 ? "正确数 > 21，处于正常范围" : "正确数 ≤ 21，低于参考范围",
      });
    }
  }
  const ex = db.prepare("SELECT id FROM assess_detail WHERE record_id=? AND code=?").get(rec.id, code);
  if (ex) db.prepare("UPDATE assess_detail SET payload=?, raw=? WHERE id=?")
    .run(JSON.stringify(scored), JSON.stringify(stored), ex.id);
  else db.prepare("INSERT INTO assess_detail(record_id,kind,code,name,payload,raw) VALUES(?,?,?,?,?,?)")
    .run(rec.id, "paradigm", code, scored.name, JSON.stringify(scored), JSON.stringify(stored));
  log(req.user, "范式施测", `${scored.name}`);
  ok(res, scored);
});
// 患者逐题作答：施测阶段保存原始作答（不涉及计分）
app.post("/api/v1/assessments/:id/answers", auth, perm("doc:assess"), (req, res) => {
  const rec = db.prepare("SELECT * FROM assess_record WHERE id=?").get(req.params.id);
  if (!rec) return bad(res, 404, "评估记录不存在");
  if (rec.status === "已作废") return bad(res, 400, "该评估已作废，不能再保存作答");
  const { code, answers = {}, reset = false } = req.body || {};
  if (!code) return bad(res, 400, "缺少项目编码");
  const up = db.prepare(`INSERT INTO assess_answer(record_id,code,item_id,value,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(record_id,code,item_id) DO UPDATE SET value=excluded.value, created_at=excluded.created_at`);
  const tx = db.transaction(() => {
    if (reset) db.prepare("DELETE FROM assess_answer WHERE record_id=? AND code=?").run(rec.id, code);
    for (const [iid, v] of Object.entries(answers)) up.run(rec.id, code, iid, JSON.stringify(v), now());
  });
  tx();
  ok(res, { saved: Object.keys(answers).length });
});
app.get("/api/v1/assessments/:id/answers", auth, (req, res) => {
  const rows = db.prepare("SELECT item_id,value FROM assess_answer WHERE record_id=? AND code=? ORDER BY id")
    .all(req.params.id, req.query.code || "");
  const out = {};
  for (const r of rows) { try { out[r.item_id] = JSON.parse(r.value || "{}"); } catch (e) { out[r.item_id] = {}; } }
  ok(res, out);
});
// 完成单个评估项目：只记录作答，不计分
app.post("/api/v1/assessments/:id/record-item", auth, perm("doc:assess"), (req, res) => {
  const rec = db.prepare("SELECT * FROM assess_record WHERE id=?").get(req.params.id);
  if (!rec) return bad(res, 404, "评估记录不存在");
  if (rec.status === "已作废") return bad(res, 400, "该评估已作废，不能再完成项目");
  const { code } = req.body || {};
  if (!code) return bad(res, 400, "缺少项目编码");
  const sc = scaleByCode(code), pa = PARADIGMS.find(p => p.code === code);
  const meta = sc || pa;
  if (!meta) return bad(res, 404, "评估项目不存在");
  const kind = sc ? "scale" : "paradigm";
  const cnt = db.prepare("SELECT COUNT(*) c FROM assess_answer WHERE record_id=? AND code=?").get(rec.id, code).c;
  // 主试逐题评分后，明细按评分结果生成；未评分项目仍如实记为「仅记录作答」
  const scoreRows = db.prepare("SELECT item_id,score FROM assess_score WHERE record_id=? AND code=?").all(rec.id, code);
  let payload = null;
  if (scoreRows.length) {
    const scores = {};
    scoreRows.forEach(r => { scores[r.item_id] = r.score; });
    const answers = {};
    db.prepare("SELECT item_id,value FROM assess_answer WHERE record_id=? AND code=?").all(rec.id, code)
      .forEach(r => { try { answers[r.item_id] = JSON.parse(r.value || "{}"); } catch (e) { } });
    payload = buildDetailFromScores(code, patientRow(rec.patient_id), scores, answers);
  }
  if (!payload) {
    payload = {
      kind, code, name: meta.name, recordOnly: true,
      answered: cnt, total: null, max: null, metrics: {}, byGroup: {},
      verdict: "仅记录作答，未评分",
    };
  }
  const ex = db.prepare("SELECT id FROM assess_detail WHERE record_id=? AND code=?").get(rec.id, code);
  if (ex) db.prepare("UPDATE assess_detail SET payload=?, raw=? WHERE id=?").run(JSON.stringify(payload), "{}", ex.id);
  else db.prepare("INSERT INTO assess_detail(record_id,kind,code,name,payload,raw) VALUES(?,?,?,?,?,?)")
    .run(rec.id, kind, code, meta.name, JSON.stringify(payload), "{}");
  log(req.user, "完成评估项目", payload.recordOnly
    ? `${meta.name}（记录 ${cnt} 条作答，未评分）`
    : `${meta.name}（${payload.total} / ${payload.max} 分）`);
  // 全部项目施测完成后不再单独流转「审核中」：评分是评估过程的一部分，
  // 由医生在评估页逐项打分后统一「确认提交」，提交时才置为「已完成」并生成报告。
  const planItems = JSON.parse(rec.items || "[]");
  const doneCodes = new Set(db.prepare("SELECT code FROM assess_detail WHERE record_id=?").all(rec.id).map(x => x.code));
  const allDone = planItems.length > 0 && planItems.every(it => doneCodes.has(it.code));
  ok(res, { ...payload, recordStatus: rec.status, allDone });
});
// ============ 审核环节：医护人员核对作答并评分 ============
// 读取待审核项目（题干 + 患者作答 + 满分 + 已存评分/自动建议分）
app.get("/api/v1/assessments/:id/review", auth, perm("doc:assess"), (req, res) => {
  const rec = db.prepare("SELECT * FROM assess_record WHERE id=?").get(req.params.id);
  if (!rec) return bad(res, 404, "评估记录不存在");
  const p = patientRow(rec.patient_id);
  const planItems = JSON.parse(rec.items || "[]");
  const saved = {};
  db.prepare("SELECT code,item_id,score FROM assess_score WHERE record_id=?").all(rec.id)
    .forEach(s => saved[s.code + "|" + s.item_id] = s.score);
  const projects = [];
  // 已施测项目：有 assess_detail 记录即视为完成（未完成项目也会列出来，但标记未施测）
  const doneCodes = new Set(db.prepare("SELECT code FROM assess_detail WHERE record_id=?").all(rec.id).map(x => x.code));
  for (const it of planItems) {
    const sc = scaleByCode(it.code), pa = PARADIGMS.find(x => x.code === it.code);
    const meta = sc || pa;
    if (!meta || !meta.items) continue;
    // 施测指导（指导语 / 客观操作 / 评分分档），评分页据此逐题呈现判分依据
    const guide = sc ? (SCALE_GUIDE[it.code] || null) : (PARADIGM_GUIDE[it.code] || null);
    const answers = {};
    db.prepare("SELECT item_id,value FROM assess_answer WHERE record_id=? AND code=?").all(rec.id, it.code)
      .forEach(r => { try { answers[r.item_id] = JSON.parse(r.value || "{}"); } catch (e) { } });
    const rows = meta.items.map(m => {
      const a = answers[m.id] || null;
      const auto = autoItemScore(m, a, rec.started_at);
      const sv = saved[it.code + "|" + m.id];
      const g = (guide && guide.items && guide.items[m.id]) || null;
      const fixedMax = m.demo ? 0 : itemMaxOf(m);
      const max = m.demo ? 0 : maxOfItem(m, answers);
      // 满分随评分法变化的项目（画钟）：固定分档（0–10 要素）不再适用，改用数值录入
      const bands = max !== fixedMax ? [] : ((g && g.bands) || []);
      return {
        id: m.id, g: m.g, t: m.t, demo: !!m.demo,
        max,
        parts: (m.parts || []).map((pt, i) => ({
          l: pt.l, u: pt.u, mode: pt.mode,
          val: (a && Array.isArray(a.parts)) ? a.parts[i] : null,
        })),
        spoken: (a && a.spoken) || 0,
        speech: (a && a.speech) || "",
        // 施测指导：p=指导语原文 o=客观施测操作 units=作答单元 bands=评分分档 n=评分要点
        p: (g && g.p) || m.t, o: (g && g.o) || "", units: (g && g.units) || [],
        digits: (g && g.digits) || "", recall: (g && g.recall) || null,
        bands, n: (a && a.cdtScaleName) ? ("按「" + a.cdtScaleName + "」逐项勾选计分" + (a.cdtRule ? "；" + a.cdtRule : "")) : ((g && g.n) || ""),
        auto,
        score: sv !== undefined ? sv : auto,
        // 是否已由医生实际评分（区别于自动建议分），施测端据此决定是否预填
        scored: sv !== undefined,
      };
    });
    projects.push({
      code: it.code, name: meta.name, kind: sc ? "scale" : "paradigm",
      domain: sc ? "" : (pa.domain || ""),
      examinerOnly: !!(meta && meta.examinerOnly),
      // 是否已完成施测：未完成的项目在评分页提示「未施测」，且不允许提交
      recorded: doneCodes.has(it.code),
      guide: guide ? {
        source: guide.source || "", materials: guide.materials || "", setup: guide.setup || "",
        prompt: guide.prompt || "", score: guide.score || "", notes: guide.notes || [],
        steps: guide.steps || [], fields: guide.fields || [],
      } : null,
      total: rows.reduce((a, r) => a + (Number(r.score) || 0), 0),
      max: rows.reduce((a, r) => a + r.max, 0),
      items: rows,
    });
  }
  ok(res, {
    record: rec,
    patient: { id: p.id, name: p.name, education: p.education, birth_date: p.birth_date },
    projects,
  });
});
// 保存逐项评分（草稿，可反复修改）
app.post("/api/v1/assessments/:id/review-scores", auth, perm("doc:assess"), (req, res) => {
  const rec = db.prepare("SELECT * FROM assess_record WHERE id=?").get(req.params.id);
  if (!rec) return bad(res, 404, "评估记录不存在");
  if (rec.status === "已完成") return bad(res, 400, "该评估已提交，评分不可再修改");
  if (rec.status === "已作废") return bad(res, 400, "该评估已作废，不能再评分");
  const { code, scores = {} } = req.body || {};
  if (!code) return bad(res, 400, "缺少项目编码");
  const up = db.prepare(`INSERT INTO assess_score(record_id,code,item_id,score,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(record_id,code,item_id) DO UPDATE SET score=excluded.score, updated_at=excluded.updated_at`);
  const tx = db.transaction(() => {
    for (const [iid, v] of Object.entries(scores)) up.run(rec.id, code, iid, Number(v) || 0, now());
  });
  tx();
  ok(res, { saved: Object.keys(scores).length });
});
// 确认提交：按评分汇总各项目结果 → 生成报告 → 记录转为「已完成」
function completeReview(req, res) {
  const rec = db.prepare("SELECT * FROM assess_record WHERE id=?").get(req.params.id);
  if (!rec) return bad(res, 404, "评估记录不存在");
  if (rec.status === "已完成") return bad(res, 400, "该评估已提交，无需重复提交");
  if (rec.status === "已作废") return bad(res, 400, "该评估已作废，不能提交");
  const p = patientRow(rec.patient_id);
  const planItems = JSON.parse(rec.items || "[]");
  const details = db.prepare("SELECT * FROM assess_detail WHERE record_id=?").all(rec.id);
  const doneCodes = new Set(details.map(d => d.code));
  const pending = planItems.filter(it => !doneCodes.has(it.code));
  if (pending.length) return bad(res, 400, `尚有 ${pending.length} 个项目未完成施测，无法提交`);
  const saved = {};
  db.prepare("SELECT code,item_id,score FROM assess_score WHERE record_id=?").all(rec.id)
    .forEach(s => saved[s.code + "|" + s.item_id] = s.score);
  const reviewer = req.user.name || req.user.username || "医护人员";
  let rid, reportNo;
  const tx = db.transaction(() => {
    const results = [];
    for (const it of planItems) {
      const sc = scaleByCode(it.code), pa = PARADIGMS.find(x => x.code === it.code);
      const meta = sc || pa;
      if (!meta || !meta.items) continue;
      const answers = {};
      db.prepare("SELECT item_id,value FROM assess_answer WHERE record_id=? AND code=?").all(rec.id, it.code)
        .forEach(r => { try { answers[r.item_id] = JSON.parse(r.value || "{}"); } catch (e) { } });
      const scores = {};
      meta.items.forEach(m => {
        const sv = saved[it.code + "|" + m.id];
        scores[m.id] = sv !== undefined ? sv : autoItemScore(m, answers[m.id], rec.started_at);
      });
      const payload = buildDetailFromScores(it.code, p, scores, answers);
      if (!payload) continue;
      const ex = db.prepare("SELECT id FROM assess_detail WHERE record_id=? AND code=?").get(rec.id, it.code);
      const raw = JSON.stringify({ scores, reviewed: true, reviewer });
      if (ex) db.prepare("UPDATE assess_detail SET payload=?, raw=?, reviewed=1 WHERE id=?").run(JSON.stringify(payload), raw, ex.id);
      else db.prepare("INSERT INTO assess_detail(record_id,kind,code,name,payload,raw,reviewed) VALUES(?,?,?,?,?,?,1)")
        .run(rec.id, payload.kind, it.code, payload.name, JSON.stringify(payload), raw);
      results.push(payload);
    }
    const radar = buildRadar(results);
    const conclusion = buildConclusion(radar, results);
    reportNo = "R" + now().slice(0, 10).replace(/-/g, "") + String(rec.id).padStart(4, "0");
    const chart = chartOfRecord(db, rec.id, p);
    const ex = db.prepare("SELECT id FROM report WHERE record_id=?").get(rec.id);
    if (ex) {
      db.prepare("UPDATE report SET radar=?,chart=?,conclusion=?,created_at=? WHERE id=?")
        .run(JSON.stringify(radar), JSON.stringify(chart), conclusion, now(), ex.id);
      rid = ex.id;
    } else {
      rid = db.prepare("INSERT INTO report(record_id,patient_id,report_no,radar,chart,conclusion) VALUES(?,?,?,?,?,?)")
        .run(rec.id, rec.patient_id, reportNo, JSON.stringify(radar), JSON.stringify(chart), conclusion).lastInsertRowid;
    }
    db.prepare("UPDATE assess_record SET status='已完成', finished_at=?, reviewed_at=?, reviewer=? WHERE id=?")
      .run(now(), now(), reviewer, rec.id);
  });
  tx();
  log(req.user, "提交评估", `记录#${rec.id} 生成报告 ${reportNo}`);
  ok(res, { reportId: rid, reportNo, reviewer });
}
app.post("/api/v1/assessments/:id/complete-review", auth, perm("doc:assess"), completeReview);
// 兼容旧路径：/finish 与「确认提交」等价
app.post("/api/v1/assessments/:id/finish", auth, perm("doc:assess"), completeReview);
// 作废：医生中途放弃本次评估时使用，释放「同患者只允许 1 条进行中」的名额
app.post("/api/v1/assessments/:id/cancel", auth, perm("doc:assess"), (req, res) => {
  const rec = db.prepare("SELECT * FROM assess_record WHERE id=?").get(req.params.id);
  if (!rec) return bad(res, 404, "评估记录不存在");
  if (rec.status === "已完成") return bad(res, 400, "该评估已提交并生成报告，不能作废");
  if (rec.status === "已作废") return bad(res, 400, "该评估已作废，无需重复操作");
  const reason = String((req.body && req.body.reason) || "").trim();
  if (!reason) return bad(res, 400, "请填写作废原因");
  db.prepare("UPDATE assess_record SET status='已作废', finished_at=?, cancel_reason=? WHERE id=?")
    .run(now(), reason, rec.id);
  log(req.user, "作废评估", `记录#${rec.id} ${rec.plan_name}：${reason}`);
  ok(res, { recordId: rec.id, status: "已作废" });
});
app.get("/api/v1/reports", auth, (req, res) => {
  const pid = req.query.patientId;
  ok(res, db.prepare("SELECT * FROM report WHERE patient_id=? ORDER BY id DESC").all(pid));
});
app.get("/api/v1/reports/:id", auth, (req, res) => {
  const r = db.prepare("SELECT * FROM report WHERE id=?").get(req.params.id);
  if (!r) return bad(res, 404, "报告不存在");
  const p = patientRow(r.patient_id);
  /* 「各项目完成情况」按当前范式定义现算：施测/评分口径调整后，历史报告同步跟上，
     不再显示早已不存在的旧指标名。算出来与库里快照不一致时顺手写回（导出/打印同源）。 */
  let chart = [];
  try { chart = chartOfRecord(db, r.record_id, p); } catch (e) { chart = []; }
  try {
    if (chart.length && JSON.stringify(chart) !== r.chart) {
      db.prepare("UPDATE report SET chart=? WHERE id=?").run(JSON.stringify(chart), r.id);
    }
  } catch (e) { /* 回写失败不影响读取 */ }
  ok(res, { ...r, radar: JSON.parse(r.radar), chart, patient: p });
});

// 训练方案与推荐
app.get("/api/v1/recommendations", auth, perm("doc:train"), (req, res) => ok(res, recommend(+req.query.patientId)));

// 在管方案：进行中。同一患者同一时刻只允许一个，换方案须先终止
const activePlanOf = (pid, exceptId = 0) => db.prepare(
  "SELECT * FROM train_plan WHERE patient_id=? AND status='进行中' AND id<>? ORDER BY id DESC LIMIT 1"
).get(pid, exceptId);
const activePlanTip = (pl) => `该患者已有进行中的训练方案 #${pl.id}，请先终止后再新建`;

app.post("/api/v1/prescriptions", auth, perm("doc:train"), (req, res) => {
  const { patientId, items, minutes = 30, freq = 3, weeks = 12, locked = 0 } = req.body || {};
  if (!patientId || !items || !items.length) return bad(res, 400, "缺少患者或训练方案");
  // 训练项：每次训练包含的训练项目数，默认 3，可选 3–24；以实际清单条数为准
  const itemsCount = items.length;
  if (itemsCount < TRAIN_ITEMS_MIN || itemsCount > TRAIN_ITEMS_MAX) {
    return bad(res, 400, `训练项须为 ${TRAIN_ITEMS_MIN}–${TRAIN_ITEMS_MAX} 项，当前 ${itemsCount} 项`);
  }
  // 训练前置条件：必须已完成评估（评估 → 训练闭环）
  const assessed = db.prepare("SELECT COUNT(*) c FROM assess_record WHERE patient_id=? AND status='已完成'").get(patientId).c;
  if (!assessed) return bad(res, 400, "该患者尚未完成评估，完成评估后才能配置训练方案");
  sweepExpiredPlans();
  // 在管唯一：生成即进入疗程，已有进行中的方案时不允许再建
  const act = activePlanOf(patientId);
  if (act) return bad(res, 409, activePlanTip(act));
  // 生成即进行中：患者端立即可见，疗程自生成日起算，到期自动归档
  let r;
  try {
    r = db.prepare("INSERT INTO train_plan(patient_id,doctor_id,items,items_count,minutes,freq,weeks,locked,status,pushed_at) VALUES(?,?,?,?,?,?,?,?,'进行中',?)")
      .run(patientId, req.user.id, JSON.stringify(items), itemsCount, minutes, freq, weeks, locked ? 1 : 0, now());
  } catch (e) {
    if (String(e.message).indexOf("UNIQUE") >= 0) return bad(res, 409, "该患者已有进行中的训练方案，请先终止后再新建");
    throw e;
  }
  log(req.user, "生成训练方案", `患者#${patientId} ${items.map(i => i.program).join("、")}（训练项 ${itemsCount}）`);
  ok(res, { planId: r.lastInsertRowid, status: "进行中", itemsCount });
});
app.get("/api/v1/prescriptions", auth, (req, res) => {
  sweepExpiredPlans();
  const rows = db.prepare("SELECT * FROM train_plan WHERE patient_id=? ORDER BY id DESC").all(req.query.patientId);
  ok(res, rows.map(r => ({ ...r, items: JSON.parse(r.items) })));
});
// 状态变更只保留「终止」：完成由疗程到期自动归档，不接受手动完成
app.put("/api/v1/prescriptions/:id/status", auth, perm("doc:train"), (req, res) => {
  const status = (req.body || {}).status;
  const pl = db.prepare("SELECT * FROM train_plan WHERE id=?").get(req.params.id);
  if (!pl) return bad(res, 404, "方案不存在");
  if (status !== "已终止") return bad(res, 400, `训练方案仅支持终止，完成由疗程到期自动归档（当前状态：${pl.status}）`);
  if (pl.status !== "进行中") return bad(res, 400, `方案当前状态为「${pl.status}」，不能终止`);
  db.prepare("UPDATE train_plan SET status='已终止', finished_at=? WHERE id=?").run(now(), pl.id);
  log(req.user, "终止训练方案", `患者#${pl.patient_id} 方案#${pl.id}`);
  ok(res, { planId: pl.id, status });
});

// 训练执行（患者端）：开始/逐关结算
const progByCode = (c) => TRAININGS.find(t => t.code === c);
app.post("/api/v1/train/start", auth, (req, res) => {
  const { planId, program } = req.body || {};
  const plan = db.prepare("SELECT * FROM train_plan WHERE id=?").get(planId);
  if (!plan) return bad(res, 404, "训练方案不存在");
  if (req.user.role === "patient" && req.user.refId !== plan.patient_id) return bad(res, 403, "无权限：该方案不属于当前患者");
  if (plan.status !== "进行中") return bad(res, 400, `该训练方案${plan.status === "已完成" ? "已到期结束" : "已终止"}，无法继续训练`);
  const items = JSON.parse(plan.items);
  const it = items.find(i => i.program === program);
  if (!it) return bad(res, 400, "该方案不在当前训练方案中");
  const last = db.prepare("SELECT * FROM train_record WHERE plan_id=? AND program=? ORDER BY id DESC LIMIT 1").get(planId, program);
  let level = last ? last.level : (it.startLevel || 1);
  const adjust = last ? last.adjust : "";
  if (!plan.locked) {
    if (adjust === "跳升1关") level += 2;
    else if (adjust === "升1关") level += 1;
    else if (adjust === "降1关") level -= 1;
  }
  const pr = progByCode(program);
  level = Math.max(1, Math.min(pr.levels.length, level));
  const streak = db.prepare(`SELECT COUNT(*) c FROM train_record WHERE plan_id=? AND program=? AND result='未通过'
    AND id > (SELECT COALESCE(MAX(id),0) FROM train_record WHERE plan_id=? AND program=? AND result!='未通过')`)
    .get(planId, program, planId, program).c;
  ok(res, { program: pr.code, name: pr.name, domain: pr.domain, archetype: pr.archetype, desc: pr.desc, level, params: pr.levels[level - 1], locked: !!plan.locked, failStreak: streak });
});
app.post("/api/v1/train/result", auth, (req, res) => {
  const { planId, program, level, durationS = 0, trials = [] } = req.body || {};
  const plan = db.prepare("SELECT * FROM train_plan WHERE id=?").get(planId);
  if (!plan) return bad(res, 404, "训练方案不存在");
  if (req.user.role === "patient" && req.user.refId !== plan.patient_id) return bad(res, 403, "无权限：该方案不属于当前患者");
  if (plan.status !== "进行中") return bad(res, 400, `该训练方案${plan.status === "已完成" ? "已到期结束" : "已终止"}，本次训练不计入记录`);
  const pr = progByCode(program);
  if (!pr) return bad(res, 404, "训练项目不存在");
  // 关卡越界一律夹到合法区间，避免 judgeLevel 拿到 undefined 关卡配置
  const lv = Math.max(1, Math.min(pr.levels.length, Number(level) || 1));
  const jp = judgeLevel(trials, pr.levels[lv - 1]);
  let result = jp.pass ? (jp.excellent ? "优秀" : "通过") : "未通过";
  let adjust = "无";
  if (!plan.locked) {
    const prev = db.prepare("SELECT result FROM train_record WHERE plan_id=? AND program=? ORDER BY id DESC LIMIT 1").get(planId, program);
    if (result === "优秀" && prev && prev.result === "优秀") adjust = "跳升1关";
    else if (result !== "未通过") adjust = "升1关";
    else {
      const streak = db.prepare(`SELECT COUNT(*) c FROM train_record WHERE plan_id=? AND program=? AND result='未通过'
        AND id > (SELECT COALESCE(MAX(id),0) FROM train_record WHERE plan_id=? AND program=? AND result!='未通过')`)
        .get(planId, program, planId, program).c + 1;
      if (streak >= 3) adjust = lv > 1 ? "降1关" : "保底第1关";
    }
  } else adjust = "医生锁定";
  // 场次：与上一条记录间隔 ≤ SESSION_GAP_MIN 分钟视为同一次训练（连续做多个项目算 1 次）
  const lastRec = db.prepare("SELECT session_id, created_at FROM train_record WHERE patient_id=? ORDER BY id DESC LIMIT 1").get(plan.patient_id);
  const ts = now();
  const gapMin = lastRec ? Math.abs(new Date(ts.replace(" ", "T")) - new Date(String(lastRec.created_at).replace(" ", "T"))) / 60000 : Infinity;
  const sessionId = lastRec && lastRec.session_id && gapMin <= SESSION_GAP_MIN
    ? lastRec.session_id
    : "S" + ts.replace(/[-: ]/g, "") + require("crypto").randomBytes(3).toString("hex");
  db.prepare("INSERT INTO train_record(plan_id,patient_id,program,level,duration_s,acc,avg_rt,hint_cnt,result,adjust,session_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(planId, plan.patient_id, program, lv, durationS, jp.acc, jp.avgRt, jp.hinted, result, adjust, sessionId);
  log(req.user, "训练结算", `${program} L${lv} ${result} ${jp.accPct}%`);
  ok(res, { ...jp, result, adjust });
});

// 统计
// 医生端工作台：完成量（人次 = 记录条数）
app.get("/api/v1/stats/summary", auth, (req, res) => {
  const c = (sql) => db.prepare(sql).get().c;
  ok(res, {
    patients: c("SELECT COUNT(*) c FROM patient WHERE is_deleted=0"),
    assessDone: c("SELECT COUNT(*) c FROM assess_record WHERE status='已完成'"),
    // 训练次数 = 一次训练（同一时间结算的多个项目算 1 次），与数据记录页口径一致
    trainDone: c("SELECT COUNT(DISTINCT patient_id || session_id) c FROM train_record"),
  });
});
app.get("/api/v1/stats/trend", auth, (req, res) => {
  const rows = db.prepare("SELECT program,level,acc,avg_rt,created_at FROM train_record WHERE patient_id=? ORDER BY id").all(req.query.patientId);
  const reports = db.prepare("SELECT id,report_no,radar,created_at FROM report WHERE patient_id=? ORDER BY id").all(req.query.patientId);
  ok(res, { records: rows, reports: reports.map(r => ({ ...r, radar: JSON.parse(r.radar) })) });
});
app.get("/api/v1/stats/compliance", auth, (req, res) => {
  const plan = db.prepare("SELECT * FROM train_plan WHERE patient_id=? ORDER BY id DESC LIMIT 1").get(req.query.patientId);
  const days = db.prepare("SELECT DATE(created_at) d, SUM(duration_s) s FROM train_record WHERE patient_id=? GROUP BY DATE(created_at) ORDER BY d").all(req.query.patientId);
  ok(res, { plan: plan ? { ...plan, items: JSON.parse(plan.items) } : null, days });
});

/* 数据记录工作台：单患者全量业务数据（评估 / 训练 / 依从性 / 复评）
 * 供医生端"数据记录"页使用，一次请求取齐，避免页面多次往返。
 * 训练数据按「训练方案」分组下发：每个方案自带项目趋势、认知域分布、周执行与日历日汇总。 */
app.get("/api/v1/stats/patient/:id", auth, perm("doc:record"), (req, res) => {
  sweepExpiredPlans();
  const p = patientRow(req.params.id);
  if (!p) return bad(res, 404, "患者不存在");
  const pid = p.id;
  const age = Math.floor((Date.now() - new Date(p.birth_date)) / 31557600000);
  const progMeta = {};
  for (const t of TRAININGS) progMeta[t.code] = t;
  const meta = (code) => progMeta[code] || { name: code, domain: "其他" };
  // 本地日期字符串（不用 toISOString，避免 UTC 偏移导致跨日）
  const ymd = (dt) => dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  const mondayOf = (dstr) => {
    const d = new Date(dstr + "T00:00:00");
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  };

  // —— 训练总览（次数按「一次训练」计：同一时间结算的多个项目算 1 次）
  const base = db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT session_id) sess, COALESCE(SUM(duration_s),0) s, COUNT(DISTINCT DATE(created_at)) d,
      COALESCE(AVG(acc),0) a, SUM(CASE WHEN result!='未通过' THEN 1 ELSE 0 END) pass,
      MIN(created_at) first_at, MAX(created_at) last_at
    FROM train_record WHERE patient_id=?`).get(pid);
  const summary = {
    sessions: base.sess,
    items: base.n,
    minutes: Math.round(base.s / 60),
    days: base.d,
    avgAcc: Math.round(base.a * 100),
    passRate: base.n ? Math.round((base.pass / base.n) * 100) : 0,
    firstAt: base.first_at || "", lastAt: base.last_at || "",
  };

  // —— 训练方案（按方案分组：项目趋势 / 认知域 / 周执行 / 日历）
  const plans = db.prepare("SELECT * FROM train_plan WHERE patient_id=? ORDER BY created_at DESC, id DESC").all(pid).map(pl => {
    const items = JSON.parse(pl.items || "[]");
    const recs = db.prepare("SELECT program,level,acc,duration_s,created_at,session_id FROM train_record WHERE plan_id=? ORDER BY id").all(pl.id);

    // 按项目聚合 + 逐次成绩序列
    const pm = {};
    const dayMap = {};
    const sessSet = new Set();
    for (const r of recs) {
      const m = pm[r.program] || (pm[r.program] = { program: r.program, sessions: 0, accSum: 0, minutes: 0, maxLevel: 0, curLevel: 0, lastAt: "", points: [] });
      m.sessions++; m.accSum += r.acc; m.minutes += Math.round(r.duration_s / 60);
      m.maxLevel = Math.max(m.maxLevel, r.level); m.curLevel = r.level; m.lastAt = r.created_at;
      m.points.push({ d: r.created_at.slice(5, 10), acc: Math.round(r.acc * 100), level: r.level });
      sessSet.add(r.session_id || r.created_at);
      const k = r.created_at.slice(0, 10);
      const dd = dayMap[k] || (dayMap[k] = { d: k, stamps: new Set(), minutes: 0 });
      dd.stamps.add(r.created_at); dd.minutes += Math.round(r.duration_s / 60);
    }
    const progs = Object.values(pm).map(m => ({
      program: m.program, name: meta(m.program).name, domain: meta(m.program).domain,
      sessions: m.sessions, minutes: m.minutes, avgAcc: m.sessions ? Math.round((m.accSum / m.sessions) * 100) : 0,
      maxLevel: m.maxLevel, curLevel: m.curLevel, lastAt: m.lastAt, trend: m.points,
    })).sort((a, b) => b.sessions - a.sessions);

    // 认知域分布
    const dm = {};
    for (const g of progs) {
      const d = dm[g.domain] || (dm[g.domain] = { domain: g.domain, sessions: 0, accSum: 0, programs: 0, maxLevel: 0 });
      d.sessions += g.sessions; d.accSum += g.avgAcc * g.sessions; d.programs++;
      d.maxLevel = Math.max(d.maxLevel, g.maxLevel);
    }
    const domains = Object.values(dm)
      .map(d => ({ domain: d.domain, sessions: d.sessions, programs: d.programs, avgAcc: d.sessions ? Math.round(d.accSum / d.sessions) : 0, maxLevel: d.maxLevel }))
      .sort((a, b) => b.sessions - a.sessions);

    const daily = Object.values(dayMap).sort((a, b) => a.d.localeCompare(b.d))
      .map(d => ({ d: d.d, sessions: d.stamps.size, minutes: d.minutes }));

    // 方案周期：起点取「推送/创建时间」与首次训练的较早者，终点按周数推算
    const anchor = (pl.pushed_at || pl.created_at || "").slice(0, 10);
    const firstRec = recs.length ? recs[0].created_at.slice(0, 10) : "";
    const startAt = firstRec && anchor && firstRec < anchor ? firstRec : (anchor || firstRec);
    const weeks = Math.max(1, pl.weeks || 12);
    const startMon = mondayOf(startAt || ymd(new Date()));
    const target = Math.max(1, pl.freq || 1);   // 每周应训练次数（一次训练含全部训练项）

    // 周执行：按方案周期逐周铺满（含未训练的周，便于看出中断）
    const weekMap = {};
    for (const d of daily) {
      const k = ymd(mondayOf(d.d));
      const w = weekMap[k] || (weekMap[k] = { sessions: 0, minutes: 0 });
      w.sessions += d.sessions; w.minutes += d.minutes;
    }
    const weekly = [];
    for (let i = 0; i < weeks; i++) {
      const k = ymd(new Date(startMon.getTime() + i * 7 * 86400000));
      const w = weekMap[k] || { sessions: 0, minutes: 0 };
      weekly.push({ week: k, sessions: w.sessions, minutes: w.minutes, target, rate: Math.min(100, Math.round((w.sessions / target) * 100)) });
    }
    const endAt = ymd(new Date(startMon.getTime() + weeks * 7 * 86400000 - 86400000));
    const expectSessions = Math.max(1, weeks * (pl.freq || 1));

    return {
      ...pl, items, itemsCount: items.length, startAt, endAt, weeks,
      progs, domains, daily, weekly, target,
      doneSessions: sessSet.size, expectSessions,
      progress: Math.min(100, Math.round((sessSet.size / expectSessions) * 100)),
      lastAt: recs.length ? recs[recs.length - 1].created_at : "",
    };
  });

  // —— 评估记录（含完成度与报告）：已作废不计入临床记录，不参与历次编号
  const assess = db.prepare(`SELECT r.id,r.plan_name,r.status,r.started_at,r.finished_at,r.items,
      (SELECT COUNT(*) FROM assess_detail d WHERE d.record_id=r.id) done,
      (SELECT rp.id FROM report rp WHERE rp.record_id=r.id) report_id,
      (SELECT rp.report_no FROM report rp WHERE rp.record_id=r.id) report_no
    FROM assess_record r WHERE r.patient_id=? AND r.status<>'已作废' ORDER BY r.id DESC`).all(pid)
    .map(r => ({ ...r, total: JSON.parse(r.items || "[]").length, items: undefined }));

  // —— 复评报告（六域雷达序列，用于前后对比）
  const reports = db.prepare("SELECT id,report_no,radar,created_at FROM report WHERE patient_id=? ORDER BY id").all(pid)
    .map(r => ({ id: r.id, report_no: r.report_no, created_at: r.created_at, radar: JSON.parse(r.radar || "{}") }));

  // —— 训练明细（分页 + 方案 / 项目筛选）
  const limit = Math.min(+req.query.limit || 15, 100);
  const offset = Math.max(+req.query.offset || 0, 0);
  const prog = req.query.program || "";
  const planId = +req.query.planId || 0;
  let w = "WHERE patient_id=?";
  const wArgs = [pid];
  if (planId) { w += " AND plan_id=?"; wArgs.push(planId); }
  if (prog) { w += " AND program=?"; wArgs.push(prog); }
  const recTotal = db.prepare(`SELECT COUNT(*) c FROM train_record ${w}`).get(...wArgs).c;
  const records = db.prepare(`SELECT * FROM train_record ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...wArgs, limit, offset)
    .map(r => ({ ...r, name: meta(r.program).name, domain: meta(r.program).domain, accPct: Math.round(r.acc * 100) }));

  ok(res, {
    patient: { id: p.id, name: p.name, sex: p.sex, age, education: p.education, outpatient_no: p.outpatient_no, dept: p.dept, history: p.history, created_at: p.created_at },
    summary, plans, assess, reports,
    records: { rows: records, total: recTotal, limit, offset },
  });
});


// 数据导出 CSV
const csv = (rows) => rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
// 评估数据导出：一行一次评估，表头分「患者信息 / 量表评估 / 范式评估」三个区域
// 量表区域每种量表一列填总分；范式区域按评估项目一列，单元格内列出该范式的各项指标
app.get("/api/v1/export/assess", auth, perm("admin:data:export"), (req, res) => {
  const { where, args } = assessFilter(req.query);
  const recs = db.prepare(`SELECT r.id,r.plan_name,r.started_at,p.name,p.sex,p.birth_date,p.outpatient_no,p.dept,p.education,
      u.real_name doctor_name,
      (SELECT report_no FROM report rp WHERE rp.record_id=r.id ORDER BY rp.id DESC LIMIT 1) report_no
    FROM assess_record r JOIN patient p ON p.id=r.patient_id LEFT JOIN sys_user u ON u.id=r.doctor_id
    ${where} ORDER BY r.id`).all(...args);
  const detailStmt = db.prepare("SELECT code,payload FROM assess_detail WHERE record_id=?");
  const ageOf = (bd) => bd ? Math.floor((Date.now() - new Date(bd)) / 31557600000) : "";

  const scaleCols = SCALES.map(s => ({ code: s.code, name: s.name }));
  const paraCols = PARADIGMS.map(p => ({ code: p.code, name: p.name }));
  const BASE_HEAD = ["姓名", "性别", "年龄", "门诊号", "科室", "教育程度", "评估方案", "评估医生", "评估时间", "报告编号"];
  const pad = (n) => Array(Math.max(n, 0)).fill("");
  const headGroup = [...["患者信息"], ...pad(BASE_HEAD.length - 1),
    "量表评估", ...pad(scaleCols.length - 1),
    "范式评估", ...pad(paraCols.length - 1)];
  const headName = [...BASE_HEAD, ...scaleCols.map(c => c.name), ...paraCols.map(c => c.name)];

  const body = recs.map(r => {
    const byCode = {};
    for (const d of detailStmt.all(r.id)) {
      try { byCode[d.code] = JSON.parse(d.payload || "{}") || {}; } catch (e) { byCode[d.code] = {}; }
    }
    const scaleVals = scaleCols.map(c => {
      const o = byCode[c.code];
      if (!o || o.total === undefined || o.total === null) return "";
      return o.adjust ? `${o.total}（教育调整+${o.adjust}）` : String(o.total);
    });
    const paraVals = paraCols.map(c => {
      const o = byCode[c.code];
      if (!o || !o.metrics) return "";
      return Object.entries(o.metrics).map(([k, v]) => `${k} ${v}`).join("；");
    });
    return [r.name, r.sex, ageOf(r.birth_date), r.outpatient_no, r.dept, r.education,
      r.plan_name, r.doctor_name || "", r.started_at, r.report_no || "", ...scaleVals, ...paraVals];
  });

  log(req.user, "导出评估数据", recs.length + " 次评估");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=assess.csv");
  res.send("\ufeff" + csv([headGroup, headName, ...body]));
});
app.get("/api/v1/export/train", auth, perm("admin:data:export"), (req, res) => {
  const { where, args } = trainFilter(req.query);
  const rows = db.prepare(`SELECT p.name,p.outpatient_no,p.dept,t.program,t.level,t.duration_s,t.acc,t.avg_rt,t.hint_cnt,t.result,t.adjust,t.created_at
    FROM train_record t JOIN patient p ON p.id=t.patient_id ${where} ORDER BY t.id`).all(...args);
  const body = [["姓名", "门诊号", "科室", "方案", "关卡", "用时s", "正确率", "平均反应时ms", "提示次数", "结果", "难度调整", "时间"],
    ...rows.map(r => [r.name, r.outpatient_no, r.dept, r.program, r.level, r.duration_s, Math.round(r.acc * 100) + "%", r.avg_rt, r.hint_cnt, r.result, r.adjust, r.created_at])];
  log(req.user, "导出训练数据", rows.length + " 条");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=train.csv");
  res.send("\ufeff" + csv(body));
});

// 审计日志 / 备份
app.get("/api/v1/logs", auth, perm("admin:config"), (req, res) =>
  ok(res, db.prepare("SELECT * FROM sys_log ORDER BY id DESC LIMIT 200").all()));
app.post("/api/v1/backup", auth, perm("admin:config"), (req, res) => {
  const dest = path.join(DATA_DIR, "backups", `db-${now().replace(/[: ]/g, "-")}.db`);
  fs.copyFileSync(DB_FILE, dest);
  log(req.user, "手动备份", path.basename(dest));
  ok(res, { file: path.basename(dest) }, "备份完成：" + path.basename(dest));
});

// 患者端：我的任务清单（训练方案）与我的报告摘要
// 说明：评估全部由医务人员在医生端施测，患者端不下发任何评估任务。
const PARADIGM_ICON = { SPAN: "🔢", CPT: "⏱️", SDMT: "🔤", TMT: "🧩", STROOP: "🎨", TOL: "🗼", AVLT: "📖", REC: "🃏", BNT: "🖼️", FLU: "💬", CDT: "✏️", COPY: "✏️", "CA-01": "🎯", "CA-02": "🎯", "CA-03": "🎯", "CA-04": "🎯", "EX-01": "🎯", "EX-02": "🎯", "EX-03": "🎯", "EX-04": "🎯", "LM-01": "🎯", "LM-02": "🎯", "LM-03": "🎯", "LM-04": "🎯", "LA-01": "🎯", "LA-02": "🎯", "LA-03": "🎯", "LA-04": "🎯", "VP-01": "🎯", "VP-02": "🎯", "VP-03": "🎯", "VP-04": "🎯", "SC-01": "🎯", "SC-02": "🎯", "SC-03": "🎯", "SC-04": "🎯" };
app.get("/api/v1/my/tasks", auth, (req, res) => {
  if (!isPatientSide(req.user.role)) return bad(res, 403, "仅患者账号");
  sweepExpiredPlans();
  const pid = req.user.refId;
  const paradigmTasks = [];
  const plan = db.prepare("SELECT * FROM train_plan WHERE patient_id=? AND status='进行中' ORDER BY id DESC LIMIT 1").get(pid);
  const planItems = [];
  if (plan) {
    for (const it of JSON.parse(plan.items)) {
      const last = db.prepare("SELECT level,adjust FROM train_record WHERE plan_id=? AND program=? ORDER BY id DESC LIMIT 1").get(plan.id, it.program);
      let level = last ? last.level : (it.startLevel || 1);
      if (!plan.locked && last) {
        if (last.adjust === "跳升1关") level += 2; else if (last.adjust === "升1关") level += 1; else if (last.adjust === "降1关") level -= 1;
      }
      const pr = progByCode(it.program);
      if (pr) planItems.push({ planId: plan.id, program: pr.code, name: pr.name, desc: pr.desc, icon: PARADIGM_ICON[pr.code] || "🎯", level: Math.max(1, Math.min(pr.levels.length, level)) });
    }
  }
  // 本周场次进度：任务不按天分配，只按方案频次（freq 次/周）给出进度与达标提示，不锁训练
  const weekDone = db.prepare(`SELECT COUNT(DISTINCT session_id) c FROM train_record
    WHERE patient_id=? AND DATE(created_at)>=DATE('now','localtime','-' ||
      ((CAST(strftime('%w','now','localtime') AS INTEGER)+6)%7) || ' days')`).get(pid).c;
  ok(res, { paradigmTasks, planItems, week: { done: weekDone, target: plan ? (plan.freq || 0) : 0 } });
});
// 患者端：个人资料（本人或家属代操作）
app.get("/api/v1/my/profile", auth, (req, res) => {
  if (!isPatientSide(req.user.role)) return bad(res, 403, "仅患者账号");
  const p = patientRow(req.user.refId);
  if (!p) return bad(res, 404, "患者档案不存在");
  const acct = db.prepare("SELECT username,phone FROM sys_user WHERE role='patient' AND ref_id=?").get(p.id);
  const me = db.prepare("SELECT phone FROM sys_user WHERE id=?").get(req.user.id);
  ok(res, {
    id: p.id, name: p.name, sex: p.sex, birth_date: p.birth_date, education: p.education,
    outpatient_no: p.outpatient_no, dept: p.dept, guardian: p.guardian,
    age: Math.floor((Date.now() - new Date(p.birth_date)) / 31557600000),
    account: acct ? acct.username : "",
    phone: (me && me.phone) || (acct && acct.phone) || p.phone || "",
    isFamily: req.user.role === "family", operator: req.user.name,
  });
});
// 患者端：训练记录（分页 + 日期范围），只给训练过程指标，不含量表得分与诊断性结论
app.get("/api/v1/my/records", auth, (req, res) => {
  if (!isPatientSide(req.user.role)) return bad(res, 403, "仅患者账号");
  const pid = req.user.refId;
  const size = Math.min(+req.query.size || 20, 100);
  const page = Math.max(+req.query.page || 1, 1);
  let where = "WHERE patient_id=?", args = [pid];
  if (req.query.from) { where += " AND DATE(created_at)>=?"; args.push(req.query.from); }
  if (req.query.to) { where += " AND DATE(created_at)<=?"; args.push(req.query.to); }
  const total = db.prepare(`SELECT COUNT(*) c FROM train_record ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT program,level,duration_s,acc,result,adjust,created_at
    FROM train_record ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...args, size, (page - 1) * size);
  // 本周完成次数（周一为起点）与方案要求频次
  const week = db.prepare(`SELECT COUNT(DISTINCT session_id) c FROM train_record
    WHERE patient_id=? AND DATE(created_at)>=DATE('now','localtime','-' ||
      ((CAST(strftime('%w','now','localtime') AS INTEGER)+6)%7) || ' days')`).get(pid).c;
  const plan = db.prepare("SELECT freq,weeks FROM train_plan WHERE patient_id=? AND status='进行中' ORDER BY id DESC LIMIT 1").get(pid);
  const assessCount = db.prepare("SELECT COUNT(*) c FROM assess_record WHERE patient_id=? AND status='已完成'").get(pid).c;
  const lastAssess = db.prepare("SELECT MAX(created_at) t FROM report WHERE patient_id=?").get(pid).t || "";
  // 累计口径：场次（一次训练含多个项目算 1 场）与项次分开给，避免「次」混用
  const sessions = db.prepare("SELECT COUNT(DISTINCT session_id) c FROM train_record WHERE patient_id=?").get(pid).c;
  ok(res, { rows, total, sessions, week: { done: week, target: plan ? plan.freq : 0 }, assessCount, lastAssessAt: lastAssess });
});
// 患者端：非诊断性摘要（不输出量表得分、分档与结论文字）
app.get("/api/v1/my/report", auth, (req, res) => {
  if (!isPatientSide(req.user.role)) return bad(res, 403, "仅患者账号");
  const pid = req.user.refId;
  const assessCount = db.prepare("SELECT COUNT(*) c FROM assess_record WHERE patient_id=? AND status='已完成'").get(pid).c;
  const last = db.prepare("SELECT created_at FROM report WHERE patient_id=? ORDER BY id DESC LIMIT 1").get(pid);
  const records = db.prepare("SELECT program,level,acc,result,adjust,created_at FROM train_record WHERE patient_id=? ORDER BY id DESC LIMIT 20").all(pid);
  ok(res, { assessCount, lastAssessAt: last ? last.created_at : "", records });
});

// 管理端工作台概览（只读聚合）
app.get("/api/v1/admin/overview", auth, perm("admin:data"), (req, res) => {
  const c = (sql, ...a) => db.prepare(sql).get(...a).c;
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = db.prepare("SELECT DATE('now','localtime',?) d").get(`-${i} days`).d;
    const row = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(duration_s),0) s FROM train_record WHERE DATE(created_at)=?").get(d);
    trend.push({ d: d.slice(5), n: row.n, minutes: Math.round(row.s / 60) });
  }
  ok(res, {
    patients: c("SELECT COUNT(*) c FROM patient WHERE is_deleted=0"),
    users: c("SELECT COUNT(*) c FROM sys_user WHERE role!='patient' AND is_deleted=0"),
    patientAccounts: c("SELECT COUNT(*) c FROM sys_user WHERE role='patient' AND is_deleted=0"),
    assessTotal: c("SELECT COUNT(*) c FROM assess_record"),
    assessDoing: c("SELECT COUNT(*) c FROM assess_record WHERE status='进行中'"),
    reports: c("SELECT COUNT(*) c FROM report"),
    trainTotal: c("SELECT COUNT(*) c FROM train_record"),
    plansActive: c("SELECT COUNT(*) c FROM train_plan WHERE status='进行中'"),
    logsToday: c("SELECT COUNT(*) c FROM sys_log WHERE DATE(created_at)=DATE('now','localtime')"),
    trainMinutes: c("SELECT COALESCE(SUM(duration_s),0) c FROM train_record") ,
    trend,
    recent: db.prepare("SELECT user_name,action,detail,created_at FROM sys_log ORDER BY id DESC LIMIT 8").all(),
    domains: db.prepare(`SELECT t.program, COUNT(*) n FROM train_record t GROUP BY t.program ORDER BY n DESC LIMIT 6`).all(),
  });
});

/* ---------------- 数据查询：筛选条件构造 ---------------- */
// 评估数据：以「评估记录」为行，且只呈现已完成的记录（进行中、已作废不计入临床数据）
function assessFilter(q = {}) {
  const kw = `%${q.kw || ""}%`;
  const cond = ["r.status='已完成'",
    "(p.name LIKE ? OR p.outpatient_no LIKE ? OR EXISTS(SELECT 1 FROM assess_detail d WHERE d.record_id=r.id AND d.code LIKE ?))"];
  const args = [kw, kw, kw];
  if (q.from) { cond.push("DATE(r.started_at)>=?"); args.push(q.from); }
  if (q.to) { cond.push("DATE(r.started_at)<=?"); args.push(q.to); }
  if (q.dept) { cond.push("p.dept=?"); args.push(q.dept); }
  if (q.doctor) { cond.push("u.real_name=?"); args.push(q.doctor); }
  if (q.hasReport === "1") cond.push("EXISTS(SELECT 1 FROM report rp WHERE rp.record_id=r.id)");
  if (q.hasReport === "0") cond.push("NOT EXISTS(SELECT 1 FROM report rp WHERE rp.record_id=r.id)");
  return { where: "WHERE " + cond.join(" AND "), args };
}
// 训练明细：患者 / 结果 / 时间范围 / 训练方案 / 科室 / 关卡区间
function trainFilter(q = {}) {
  const kw = `%${q.kw || ""}%`;
  const cond = ["(p.name LIKE ? OR p.outpatient_no LIKE ? OR t.program LIKE ?)"];
  const args = [kw, kw, kw];
  if (q.result) { cond.push("t.result=?"); args.push(q.result); }
  if (q.from) { cond.push("DATE(t.created_at)>=?"); args.push(q.from); }
  if (q.to) { cond.push("DATE(t.created_at)<=?"); args.push(q.to); }
  if (q.program) { cond.push("t.program=?"); args.push(q.program); }
  if (q.dept) { cond.push("p.dept=?"); args.push(q.dept); }
  if (q.levelMin) { cond.push("t.level>=?"); args.push(+q.levelMin); }
  if (q.levelMax) { cond.push("t.level<=?"); args.push(+q.levelMax); }
  return { where: "WHERE " + cond.join(" AND "), args };
}

// 管理端数据页：评估记录（只读，支持多维筛选与分页；仅已完成）
app.get("/api/v1/admin/assess", auth, perm("admin:data"), (req, res) => {
  const limit = Math.min(+req.query.limit || 20, 200);
  const offset = Math.max(+req.query.offset || 0, 0);
  const { where, args } = assessFilter(req.query);
  // 按评估记录聚合（一条记录可能包含多个量表/范式项目）
  const base = `FROM assess_record r JOIN patient p ON p.id=r.patient_id
    LEFT JOIN sys_user u ON u.id=r.doctor_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...args).c;
  const rows = db.prepare(`SELECT r.id record_id,p.name,p.sex,p.birth_date,p.outpatient_no,p.dept,
      r.plan_name,r.started_at,r.finished_at,u.real_name doctor_name,
      (SELECT COUNT(*) FROM assess_detail d WHERE d.record_id=r.id) item_count,
      (SELECT report_no FROM report rp WHERE rp.record_id=r.id ORDER BY rp.id DESC LIMIT 1) report_no
    ${base} ORDER BY r.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  ok(res, { rows, total });
});

// 管理端：单次评估的项目与结果明细（只读）
app.get("/api/v1/admin/assess/:id", auth, perm("admin:data"), (req, res) => {
  const rec = db.prepare(`SELECT r.id,r.plan_name,r.started_at,r.finished_at,p.name patient_name,
      u.real_name doctor_name
    FROM assess_record r JOIN patient p ON p.id=r.patient_id LEFT JOIN sys_user u ON u.id=r.doctor_id
    WHERE r.id=? AND r.status='已完成'`).get(req.params.id);
  if (!rec) return bad(res, 404, "评估记录不存在或尚未完成");
  const items = db.prepare("SELECT code,kind,name,payload FROM assess_detail WHERE record_id=? ORDER BY id").all(rec.id)
    .map(d => {
      let p = {};
      try { p = JSON.parse(d.payload || "{}") || {}; } catch (e) { p = {}; }
      return { code: d.code, kind: d.kind, name: d.name, payload: p };
    });
  ok(res, { record: rec, items });
});

// 管理端数据页：训练明细（只读，支持多维筛选与分页）
app.get("/api/v1/admin/train", auth, perm("admin:data"), (req, res) => {
  const limit = Math.min(+req.query.limit || 20, 200);
  const offset = Math.max(+req.query.offset || 0, 0);
  const { where, args } = trainFilter(req.query);
  const base = `FROM train_record t JOIN patient p ON p.id=t.patient_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...args).c;
  const rows = db.prepare(`SELECT t.id,p.name,p.outpatient_no,p.dept,t.plan_id,t.program,t.level,t.duration_s,
      t.acc,t.avg_rt,t.hint_cnt,t.result,t.adjust,t.created_at
    ${base} ORDER BY t.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  ok(res, { rows, total });
});

// 管理端数据页：筛选项（科室取自字典，医生取自在职员工，方案取自训练方案库）
app.get("/api/v1/admin/filters", auth, perm("admin:data"), (req, res) => {
  ok(res, {
    depts: dictList("dept", false).map(d => d.label),
    doctors: db.prepare("SELECT DISTINCT real_name FROM sys_user WHERE role!='patient' AND is_deleted=0 AND status=1 ORDER BY real_name").all().map(r => r.real_name),
    programs: TRAININGS.map(t => ({ code: t.code, name: t.name })),
    assessStatus: ["进行中", "已完成", "已作废"],
    results: ["优秀", "通过", "未通过"],
  });
});

// 管理端：单个患者档案只读视图（含评估/训练汇总）
app.get("/api/v1/admin/patient/:id", auth, perm("admin:data"), (req, res) => {
  const p = patientRow(req.params.id);
  if (!p) return bad(res, 404, "患者不存在");
  const age = Math.floor((Date.now() - new Date(p.birth_date)) / 31557600000);
  ok(res, {
    ...p, age,
    assessCount: db.prepare("SELECT COUNT(*) c FROM assess_record WHERE patient_id=?").get(p.id).c,
    reportCount: db.prepare("SELECT COUNT(*) c FROM report WHERE patient_id=?").get(p.id).c,
    planCount: db.prepare("SELECT COUNT(*) c FROM train_plan WHERE patient_id=?").get(p.id).c,
    trainCount: db.prepare("SELECT COUNT(*) c FROM train_record WHERE patient_id=?").get(p.id).c,
    trainMinutes: Math.round(db.prepare("SELECT COALESCE(SUM(duration_s),0) s FROM train_record WHERE patient_id=?").get(p.id).s / 60),
    lastTrain: (db.prepare("SELECT MAX(created_at) t FROM train_record WHERE patient_id=?").get(p.id).t) || "",
    reports: db.prepare("SELECT id,report_no,created_at FROM report WHERE patient_id=? ORDER BY id DESC").all(p.id),
  });
});

/* ---------------- 三端独立入口 ---------------- */
// 管理端 / 医生端 / 患者端各监听一个独立端口，但共用同一个 Express 实例与同一个 SQLite 连接，
// 既满足「三端三个访问地址」，又避免多进程并发写库（WAL 下仍会有 SQLITE_BUSY 风险）。
// 每个端口的 / 会 302 到本端页面；误访问其他端入口时也跳回本端，防止串端。
// 端口选在 321x 段，避开 3000（原目录实例）与 3100（本机其他应用已占用）。
const ENTRIES = [
  { key: "admin", name: "管理端", port: Number(process.env.PORT_ADMIN || process.env.PORT) || 3210 },
  { key: "doctor", name: "医生端", port: Number(process.env.PORT_DOCTOR) || 3211 },
  { key: "patient", name: "患者端", port: Number(process.env.PORT_PATIENT) || 3212 },
];

app.get("/api/v1/entry", (req, res) => {
  const host = String(req.headers.host || "localhost").split(":")[0];
  ok(res, ENTRIES.map(e => ({ key: e.key, name: e.name, port: e.port, url: `http://${host}:${e.port}/${e.key}` })));
});

// 静态资源与入口
app.get("/favicon.ico", (req, res) => res.status(204).end());   // 浏览器默认请求，避免日志噪声
app.use(express.static(path.join(__dirname, "..", "web")));
["/admin", "/doctor", "/patient"].forEach(r =>
  app.get(r, (req, res) => res.sendFile(path.join(__dirname, "..", "web", r.slice(1) + ".html"))));

// 统一错误响应（JSON，避免前端收到HTML）
app.use((err, req, res, next) => {
  console.error("API错误:", err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ code: 500, message: "服务异常：" + err.message, data: null });
});

if (require.main === module) {
  const http = require("http");
  const banner = [];
  for (const e of ENTRIES) {
    const srv = http.createServer((req, res) => {
      const p = (req.url.split("?")[0].replace(/\/+$/, "") || "/");
      const host = String(req.headers.host || "localhost").split(":")[0];
      if (p === "/") {
        // 管理端端口的根路径留作门户页（index.html）；医生端 / 患者端根路径直达本端
        if (e.key === "admin") return app(req, res);
        res.writeHead(302, { Location: "/" + e.key }); return res.end();
      }
      // 访问了其他端的入口 → 跳到该端的正式端口，避免同一页面存在两个地址
      const other = ENTRIES.find(x => p === "/" + x.key && x.key !== e.key);
      if (other) {
        res.writeHead(302, { Location: `http://${host}:${other.port}/${other.key}` }); return res.end();
      }
      app(req, res);
    });
    srv.on("error", err => {
      console.error(`[${e.name}] 端口 ${e.port} 启动失败：${err.code === "EADDRINUSE" ? "端口已被占用，请用 PORT_" + e.key.toUpperCase() + " 指定其他端口" : err.message}`);
    });
    srv.listen(e.port, () => banner.push(`  ${e.name}   http://localhost:${e.port}/${e.key}`));
  }
  setTimeout(() => {
    console.log("HS-CRT-01 体验版已启动（三端独立端口，共用 data/hscrt01.db）");
    console.log(banner.length ? banner.join("\n") : "  （无端口启动成功，请检查端口占用）");
    console.log(`  门户页   http://localhost:${ENTRIES[0].port}/`);
  }, 120);
}

// 供 scripts / 演示数据生成器复用（评分、六域画像、推荐等引擎）
module.exports = { app, db, now, log, scoreScale, scoreParadigm, buildRadar, buildConclusion, judgeLevel, recommend, TRAININGS, PARADIGMS, SCALES };
