/**
 * 收敛「一个患者多个在管方案」的历史数据。
 *
 * 在管 = 待推送 或 进行中；同一患者同一时刻只允许 1 个。
 *
 * 处理规则：
 *  1) 多个「进行中」→ 保留训练记录最多的一条（并列取 pushed_at 较晚、再并列取 id 最大），
 *     其余置为「已终止」并写 finished_at。保留有记录的那条，患者端才拿得到真实任务。
 *  2) 同时存在「进行中」与「待推送」→ 进行中为准，待推送直接删除（等价于「取消生成」，写审计日志）。
 *  3) 多个「待推送」→ 保留 id 最大的一条，其余删除。
 *
 * 用法：
 *   node scripts/fix-train-plan-single.js          # 只报告
 *   node scripts/fix-train-plan-single.js --fix    # 执行修改
 */
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "..", "data", "hscrt01.db"));
const FIX = process.argv.includes("--fix");

// 与服务端同一套轻量迁移：完成/终止时间列
if (FIX) {
  const cols = db.prepare("PRAGMA table_info(train_plan)").all().map(c => c.name);
  if (!cols.includes("finished_at")) db.exec("ALTER TABLE train_plan ADD COLUMN finished_at TEXT");
}

const now = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const recCount = (id) => db.prepare("SELECT COUNT(*) c FROM train_record WHERE plan_id=?").get(id).c;
const logRow = (pid, action, detail) => {
  db.prepare("INSERT INTO sys_log(user_id,user_name,action,detail,ip) VALUES(?,?,?,?,?)")
    .run(0, "系统", action, detail, "-");
};

const pids = db.prepare(`
  SELECT patient_id FROM train_plan
  WHERE status IN ('待推送','进行中')
  GROUP BY patient_id HAVING COUNT(*) > 1 ORDER BY patient_id`).all().map(r => r.patient_id);

if (!pids.length) {
  console.log("没有多方案患者，无需处理。");
  process.exit(0);
}

const stamp = now();
let stopped = 0, deleted = 0;

for (const pid of pids) {
  const rows = db.prepare(`
    SELECT * FROM train_plan WHERE patient_id=? AND status IN ('待推送','进行中')
    ORDER BY id DESC`).all(pid);
  const running = rows.filter(r => r.status === "进行中");
  const pending = rows.filter(r => r.status === "待推送");

  console.log(`\n患者 #${pid}：进行中 ${running.length} 条 / 待推送 ${pending.length} 条`);

  // 规则 1：多个进行中，保留有记录的那条
  if (running.length > 1) {
    const ranked = [...running].sort((a, b) => {
      const d = recCount(b.id) - recCount(a.id);
      if (d) return d;
      const t = String(b.pushed_at || b.created_at).localeCompare(String(a.pushed_at || a.created_at));
      return t || (b.id - a.id);
    });
    const keep = ranked[0];
    console.log(`  保留 进行中 #${keep.id}（${recCount(keep.id)} 次训练）`);
    for (const pl of ranked.slice(1)) {
      console.log(`  终止 #${pl.id}（${recCount(pl.id)} 次训练）→ 已终止`);
      if (FIX) {
        db.prepare("UPDATE train_plan SET status='已终止', finished_at=? WHERE id=?").run(stamp, pl.id);
        logRow(pid, "终止训练方案", `方案#${pl.id}（历史重复进行中，系统收敛）`);
      }
      stopped++;
    }
  }

  // 规则 2：进行中 + 待推送，待推送作废
  if (running.length >= 1 && pending.length) {
    for (const pl of pending) {
      console.log(`  删除 待推送 #${pl.id}（已有进行中方案，视为取消生成）`);
      if (FIX) {
        db.prepare("DELETE FROM train_plan WHERE id=?").run(pl.id);
        logRow(pid, "取消训练方案", `方案#${pl.id}（历史重复在管，系统收敛）`);
      }
      deleted++;
    }
    continue;
  }

  // 规则 3：多个待推送，保留最新一条
  if (!running.length && pending.length > 1) {
    const [keep, ...rest] = pending;
    console.log(`  保留 待推送 #${keep.id}`);
    for (const pl of rest) {
      console.log(`  删除 待推送 #${pl.id}`);
      if (FIX) {
        db.prepare("DELETE FROM train_plan WHERE id=?").run(pl.id);
        logRow(pid, "取消训练方案", `方案#${pl.id}（历史重复待推送，系统收敛）`);
      }
      deleted++;
    }
  }
}

console.log(`\n${FIX ? "已执行" : "预览"}：终止 ${stopped} 条，删除 ${deleted} 条。`);
if (!FIX) console.log("加 --fix 执行修改。");
