// 生成演示用「手写作答」PNG（纯 Node + zlib，无需浏览器）
const zlib = require("zlib");

const TBL = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function makeCanvas(w, h) {
  const px = Buffer.alloc(w * h * 4, 255);
  const set = (x, y, v = 0) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = v;
  };
  const line = (x0, y0, x1, y1, wid = 2) => {
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (dx * i) / n, y = y0 + (dy * i) / n;
      for (let ox = 0; ox < wid; ox++) for (let oy = 0; oy < wid; oy++) set(x + ox, y + oy);
    }
  };
  const circle = (cx, cy, r, wid = 2) => {
    for (let a = 0; a < 720; a++) {
      const t = (a / 720) * Math.PI * 2;
      for (let o = 0; o < wid; o++) set(cx + Math.cos(t) * (r + o), cy + Math.sin(t) * (r + o));
    }
  };
  const png = () => {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 4 + 1)] = 0;
      px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
    ]);
  };
  return { set, line, circle, png };
}

// 画钟：钟面 + 刻度 + 指针
function drawClock() {
  const c = makeCanvas(260, 200);
  c.circle(130, 100, 66, 2);
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    c.line(130 + Math.cos(t) * 54, 100 + Math.sin(t) * 54, 130 + Math.cos(t) * 62, 100 + Math.sin(t) * 62, 1);
  }
  c.line(130, 100, 130, 58, 2);          // 分针指向 12
  c.line(130, 100, 164, 112, 2);         // 时针指向 4
  c.line(130, 100, 130, 100, 3);
  return "data:image/png;base64," + c.png().toString("base64");
}

// 临摹相交五边形
function drawPentagons() {
  const c = makeCanvas(300, 200);
  const poly = (cx, cy, r, rot) => {
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const t = rot + (i / 5) * Math.PI * 2;
      pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    for (let i = 0; i < 5; i++) c.line(pts[i][0], pts[i][1], pts[(i + 1) % 5][0], pts[(i + 1) % 5][1], 2);
  };
  poly(118, 100, 62, -Math.PI / 2);
  poly(182, 100, 62, -Math.PI / 2);
  return "data:image/png;base64," + c.png().toString("base64");
}

// 立方体
function drawCube() {
  const c = makeCanvas(240, 220);
  const f = [[70, 60], [150, 60], [150, 140], [70, 140]];
  const o = 34;
  for (let i = 0; i < 4; i++) c.line(f[i][0], f[i][1], f[(i + 1) % 4][0], f[(i + 1) % 4][1], 2);
  for (let i = 0; i < 4; i++) c.line(f[i][0] + o, f[i][1] + o, f[(i + 1) % 4][0] + o, f[(i + 1) % 4][1] + o, 2);
  for (let i = 0; i < 4; i++) c.line(f[i][0], f[i][1], f[i][0] + o, f[i][1] + o, 2);
  return "data:image/png;base64," + c.png().toString("base64");
}

module.exports = { drawClock, drawPentagons, drawCube };
