// set-initial-pwd.js —— 把所有账号的密码重置为统一初始密码（hs123456）
// 背景：医护 / 管理账号与患者任务账号统一用同一个初始密码，登录页与患者登录码弹窗都按这个展示，
//      存量库里的账号密码必须跟着对齐，否则文档上写的密码登不进去。
// 范围：sys_user 里未删除的全部账号（admin/doctor/therapist/patient/family）；执行前自动备份数据库。
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const PWD = "hs123456";
const dir = path.join(__dirname, "..", "data");
const file = path.join(dir, "hscrt01.db");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const bak = path.join(dir, "backups", `hscrt01.before-initial-pwd-${stamp}.db`);
fs.mkdirSync(path.dirname(bak), { recursive: true });
fs.copyFileSync(file, bak);
console.log("备份 → " + bak);

const db = new Database(file);
const rows = db.prepare("SELECT id, username, role FROM sys_user WHERE is_deleted=0").all();
const hash = bcrypt.hashSync(PWD, 10);
const upd = db.prepare("UPDATE sys_user SET password_hash=? WHERE id=?");
const byRole = {};
for (const r of rows) { upd.run(hash, r.id); byRole[r.role] = (byRole[r.role] || 0) + 1; }
console.log(`已重置 ${rows.length} 个账号为初始密码 ${PWD}：` +
  Object.entries(byRole).map(([k, v]) => `${k} ${v}`).join(" · "));
db.close();
