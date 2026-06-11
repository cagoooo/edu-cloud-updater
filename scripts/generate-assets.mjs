#!/usr/bin/env node
/**
 * 學生教育雲帳號更新工具 — 圖示與社群分享圖一次生成
 * ====================================================
 * 設計主視覺：☁ 教育雲 + ↻ 比對更新環（cloud + refresh ring）
 * 技術：@napi-rs/canvas + 本機微軟正黑體 → 產物全是「點陣 PNG」，
 *       部署到 GitHub Pages（Linux）serving 不會出現中文方框（tofu）。
 *
 * 產出（寫入 repo 根目錄）：
 *   favicon.ico / favicon.svg / apple-touch-icon.png / og-preview.png
 *   icons/icon-192.png / icon-512.png / icon-192-maskable.png / icon-512-maskable.png
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import pngToIco from 'png-to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ICONS = resolve(ROOT, 'icons');
mkdirSync(ICONS, { recursive: true });

// ---- 字型：本機微軟正黑體（粗體 + 標準）----
const FB = 'C:/Windows/Fonts/msjhbd.ttc';
const FR = 'C:/Windows/Fonts/msjh.ttc';
for (const [p, name] of [[FB, 'JhengHeiBold'], [FR, 'JhengHei']]) {
  if (!existsSync(p)) { console.error('❌ 找不到字型：' + p); process.exit(1); }
  GlobalFonts.registerFromPath(p, name);
}

// ---- 配色 ----
const C = {
  bg1: '#1e3a8a',
  bg2: '#2563eb',
  cloud: '#ffffff',
  ring: '#5eead4',   // 亮青綠，在深藍底上對比清楚
  ink: '#0f1e44',
};
const deg = (d) => (d * Math.PI) / 180;

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 雲朵（中心 cx,cy，整體寬度 w）
function drawCloud(ctx, cx, cy, w, color) {
  const s = w;
  ctx.fillStyle = color;
  const bumps = [
    [cx - 0.27 * s, cy + 0.04 * s, 0.21 * s],
    [cx - 0.02 * s, cy - 0.13 * s, 0.26 * s],
    [cx + 0.24 * s, cy - 0.01 * s, 0.21 * s],
  ];
  for (const [x, y, r] of bumps) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 底部圓角矩形把雲底壓平、銜接各鼓包
  roundRectPath(ctx, cx - 0.44 * s, cy - 0.02 * s, 0.88 * s, 0.24 * s, 0.12 * s);
  ctx.fill();
}

// 比對更新環（兩段弧 + 兩個箭頭，組成 ↻）
function drawRefresh(ctx, cx, cy, R, lw, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(cx, cy, R, deg(38), deg(150), false);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R, deg(218), deg(330), false);
  ctx.stroke();
  arrowAt(ctx, cx, cy, R, deg(150), lw, color, +1);
  arrowAt(ctx, cx, cy, R, deg(330), lw, color, +1);
}
function arrowAt(ctx, cx, cy, R, ang, lw, color, dir) {
  const px = cx + R * Math.cos(ang), py = cy + R * Math.sin(ang);
  const tang = ang + (dir * Math.PI) / 2;
  const tx = Math.cos(tang), ty = Math.sin(tang);
  const nx = Math.cos(ang), ny = Math.sin(ang);
  const a = lw * 1.15;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(px + tx * a * 1.7, py + ty * a * 1.7);
  ctx.lineTo(px + nx * a, py + ny * a);
  ctx.lineTo(px - nx * a, py - ny * a);
  ctx.closePath();
  ctx.fill();
}

// 主視覺（無背景，可疊在任意底上）：更新環在後、雲在前
function drawMark(ctx, cx, cy, u, opts = {}) {
  const R = u * 0.86;
  const lw = u * 0.2;
  if (opts.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = u * 0.18;
    ctx.shadowOffsetY = u * 0.06;
  }
  drawRefresh(ctx, cx, cy, R, lw, opts.ring || C.ring);
  drawCloud(ctx, cx, cy + u * 0.06, u * 1.04, opts.cloud || C.cloud);
  if (opts.shadow) ctx.restore();
}

// ---- 圖示（方形 app icon）----
function makeIcon(size, { maskable = false } = {}) {
  const cv = createCanvas(size, size);
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, C.bg1);
  g.addColorStop(1, C.bg2);
  ctx.fillStyle = g;
  if (maskable) {
    ctx.fillRect(0, 0, size, size);
  } else {
    roundRectPath(ctx, 0, 0, size, size, size * 0.22);
    ctx.fill();
  }
  const cs = maskable ? 0.6 : 0.84;
  drawMark(ctx, size / 2, size / 2, (size / 2) * cs);
  return cv.toBuffer('image/png');
}

// ---- 文字工具 ----
function fitFont(ctx, text, weight, maxSize, maxWidth, name = 'JhengHeiBold') {
  let sz = maxSize;
  while (sz > 12) {
    ctx.font = `${weight} ${sz}px "${name}"`;
    if (ctx.measureText(text).width <= maxWidth) break;
    sz -= 2;
  }
  return sz;
}
function heart(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.3);
  ctx.bezierCurveTo(cx - s, cy - s * 0.5, cx - s * 0.5, cy - s, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s, cx + s, cy - s * 0.5, cx, cy + s * 0.3);
  ctx.closePath();
  ctx.fill();
}
function pill(ctx, x, y, h, text, font, { bg, fg, dot } = {}) {
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  const padX = h * 0.5;
  const dotW = dot ? h * 0.5 : 0;
  const w = tw + padX * 2 + dotW;
  ctx.fillStyle = bg || 'rgba(255,255,255,0.14)';
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  let tx = x + padX;
  if (dot) {
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(x + padX + h * 0.16, y + h / 2, h * 0.16, 0, Math.PI * 2);
    ctx.fill();
    tx += dotW;
  }
  ctx.fillStyle = fg || '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tx, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

// ---- OG 社群分享圖 1200×630 ----
function makeOG() {
  const W = 1200, H = 630;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  // 背景
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, C.bg1);
  g.addColorStop(1, C.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 右側光暈
  const rg = ctx.createRadialGradient(W * 0.8, H * 0.36, 30, W * 0.8, H * 0.36, 460);
  rg.addColorStop(0, 'rgba(94,234,212,0.30)');
  rg.addColorStop(1, 'rgba(94,234,212,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
  // 右側主視覺
  drawMark(ctx, W - 215, H / 2 - 18, 165, { shadow: true });

  const padL = 84;
  const maxTextW = W - padL - 360;

  // 學校膠囊
  pill(ctx, padL, 78, 46, '桃園市龍潭區石門國民小學', '700 22px "JhengHeiBold"',
    { bg: 'rgba(255,255,255,0.16)', fg: '#e8f0ff', dot: '#5eead4' });

  // 主標題（兩行）
  ctx.fillStyle = '#ffffff';
  const l1 = '學生教育雲帳號', l2 = '更新工具';
  const ts = Math.min(
    fitFont(ctx, l1, '900', 96, maxTextW),
    fitFont(ctx, l2, '900', 96, maxTextW)
  );
  ctx.font = `900 ${ts}px "JhengHeiBold"`;
  ctx.fillText(l1, padL, 226);
  ctx.fillText(l2, padL, 226 + ts * 1.18);

  // 副標
  ctx.font = '500 29px "JhengHei"';
  ctx.fillStyle = '#cfe0ff';
  ctx.fillText('自動比對轉入轉出學生 · 一鍵產出更新後帳密總表', padL, 408);

  // 功能膠囊列
  const chips = [
    ['自動比對', '#93c5fd'],
    ['末四碼防撞號', '#fca5a5'],
    ['跨學年同步', '#5eead4'],
    ['純前端不上傳', '#fcd34d'],
  ];
  let cx = padL;
  for (const [t, dot] of chips) {
    const w = pill(ctx, cx, 446, 44, t, '700 21px "JhengHeiBold"',
      { bg: 'rgba(255,255,255,0.12)', fg: '#ffffff', dot });
    cx += w + 12;
  }

  // 網址膠囊（左下）
  pill(ctx, padL, H - 70, 44, 'cagoooo.github.io/edu-cloud-updater', '700 20px "JhengHei"',
    { bg: '#0f1e44', fg: '#8fe9d6' });

  // 作者署名（右下）
  ctx.font = '500 20px "JhengHei"';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  const credit = 'by 阿凱老師';
  const cw = ctx.measureText(credit).width;
  const made = 'Made with';
  ctx.fillText(made, W - padL - cw - 22 - ctx.measureText(made).width - 8, H - 44);
  heart(ctx, W - padL - cw - 16, H - 51, 8, '#fb7185');
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(credit, W - padL - cw, H - 44);

  return cv.toBuffer('image/png');
}

// ================= 生成 =================
writeFileSync(resolve(ROOT, 'apple-touch-icon.png'), makeIcon(180));
writeFileSync(resolve(ICONS, 'icon-192.png'), makeIcon(192));
writeFileSync(resolve(ICONS, 'icon-512.png'), makeIcon(512));
writeFileSync(resolve(ICONS, 'icon-192-maskable.png'), makeIcon(192, { maskable: true }));
writeFileSync(resolve(ICONS, 'icon-512-maskable.png'), makeIcon(512, { maskable: true }));
writeFileSync(resolve(ROOT, 'og-preview.png'), makeOG());

// favicon.ico 由 16/32/48 合成
const icoBufs = [16, 32, 48].map((s) => makeIcon(s));
const ico = await pngToIco(icoBufs);
writeFileSync(resolve(ROOT, 'favicon.ico'), ico);

console.log('✅ 圖示與 OG 圖生成完成');
console.log('   favicon.ico / favicon.svg(手寫) / apple-touch-icon.png / og-preview.png');
console.log('   icons/icon-192,512(.png) + maskable');
