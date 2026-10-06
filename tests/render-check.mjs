/* 检查“间断点断开”逻辑：极点应断开，平滑陡峭曲线与台阶跳变不应断开（spans.mjs） */
import fs from 'fs';
let createCanvas;
try {
  ({ createCanvas } = await import('@napi-rs/canvas'));
} catch (e) {
  console.log('跳过：未安装可选依赖 @napi-rs/canvas（npm i -D @napi-rs/canvas 后可运行）');
  process.exit(0);
}

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appSrc = scripts[scripts.length - 1];

class ClassList {
  constructor() { this.set = new Set(); }
  add(...n) { n.forEach(x => this.set.add(x)); }
  remove(...n) { n.forEach(x => this.set.delete(x)); }
  contains(n) { return this.set.has(n); }
  toggle(n, f) { const on = f === undefined ? !this.set.has(n) : !!f; on ? this.set.add(n) : this.set.delete(n); return on; }
  toString() { return [...this.set].join(' '); }
}

class RecCtx {
  constructor() {
    this.strokeStyle = '#000'; this.fillStyle = '#000'; this.lineWidth = 1; this.globalAlpha = 1;
    this.font = '12px sans-serif'; this.textAlign = 'left'; this.textBaseline = 'top'; this.lineJoin = ''; this.lineCap = '';
    this.strokes = []; this.cur = null;
  }
  setTransform() {} save() {} restore() {} closePath() {} arc() {} rect() {} fill() {} fillRect() {} strokeRect() {}
  fillText() {} setLineDash() {} measureText(s) { return { width: String(s).length * 7 }; }
  beginPath() { this.cur = { subs: 0, segs: 0, maxDy: 0, dyTotal: 0 }; }
  moveTo() { if (this.cur) this.cur.subs++; }
  lineTo(x, y) {
    if (!this.cur) return;
    if (this._last) { const dy = Math.abs(y - this._last.y); if (dy > this.cur.maxDy) this.cur.maxDy = dy; this.cur.dyTotal += dy; }
    this.cur.segs++;
    this._last = { x, y };
  }
  quadraticCurveTo(a, b, x, y) { this.lineTo(x, y); }
  stroke() { if (this.cur) this.strokes.push(Object.assign({ lineWidth: this.lineWidth }, this.cur)); this._last = null; }
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.classList = new ClassList(); this.style = {}; this.value = '';
    this._text = ''; this._listeners = {}; this.parentNode = null; this._w = 900; this._h = 600;
    if (this.tagName === 'CANVAS') { this._c = createCanvas(300, 150); this._rec = new RecCtx(); }
  }
  get className() { return this.classList.toString(); }
  set className(v) { this.classList = new ClassList(); String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c)); }
  get textContent() { return this._text; } set textContent(v) { this._text = String(v); }
  get width() { return this._c.width; } set width(v) { this._c.width = Math.max(1, Math.round(v)); }
  get height() { return this._c.height; } set height(v) { this._c.height = Math.max(1, Math.round(v)); }
  getContext() { return this._rec; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  remove() { const i = this.parentNode ? this.parentNode.children.indexOf(this) : -1; if (i >= 0) this.parentNode.children.splice(i, 1); this.parentNode = null; }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  querySelectorAll(sel) {
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    const tag = cls ? null : sel.toUpperCase();
    const out = [];
    (function walk(n) { for (const c of n.children) { if (cls ? c.classList.contains(cls) : c.tagName === tag) out.push(c); walk(c); } })(this);
    return out;
  }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  dispatch(t, ev = {}) {
    const base = { type: t, target: this, preventDefault() {}, offsetX: 0, offsetY: 0, key: '', shiftKey: false, altKey: false, deltaX: 0, deltaY: 0, deltaMode: 0, pointerId: 1 };
    (this._listeners[t] || []).forEach(fn => fn(Object.assign(base, ev)));
    return this;
  }
  focus() {} click() { this.dispatch('click'); }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this._w, height: this._h }; }
  toDataURL() { return ''; }
}

const ids = ['cv', 'stage', 'funcs', 'status', 'readout', 'badge', 'addBtn', 'presets', 'resetBtn', 'pngBtn', 'zin', 'zout', 'zreset'];
const byId = {};
ids.forEach(i => { byId[i] = new El(i === 'cv' ? 'canvas' : 'div'); });
const document = { getElementById: i => byId[i], createElement: t => new El(t), addEventListener() {}, body: new El('body') };
const window = { devicePixelRatio: 1, addEventListener() {} };
const rafq = []; const raf = cb => rafq.push(cb);
const flush = () => rafq.splice(0).forEach(c => c());

new Function('document', 'window', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', appSrc + '\nreturn {};')(
  document, window, raf, () => 0, () => {});
flush();

const cv = byId.cv, rec = cv._rec;
const rows = () => byId.funcs.querySelectorAll('.fn-row');
const inputs = () => byId.funcs.querySelectorAll('.src');
const setVisible = (k, want) => {
  const off = rows()[k].classList.contains('off');
  if (off === want) rows()[k].querySelector('.vis').click();
};

function curveStrokes() {
  rec.strokes = [];
  /* 触发一次渲染并记录绘制指令（悬停事件会 requestAnimationFrame） */
  cv.dispatch('pointermove', { pointerId: 77, offsetX: 2, offsetY: 2 });
  flush();
  return rec.strokes.filter(s => s.lineWidth === 2.2);
}
function only(i, exprList) {
  while (rows().length < exprList.length) { byId.addBtn.click(); flush(); }
  while (rows().length > exprList.length) { rows()[rows().length - 1].querySelector('.del').click(); flush(); }
  exprList.forEach((s, k) => { if (inputs()[k].value !== s) { inputs()[k].value = s; inputs()[k].dispatch('input'); } });
  flush();
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '   → ' + JSON.stringify(extra) : '')); } };

/* [表达式, 期望子路径数, 说明] */
const cases = [
  ['x^3/6 - x', 1, '平滑多项式应是一条连续曲线'],
  ['sin(x)', 1, '正弦'],
  ['exp(x)', 1, '指数（陡峭但连续）'],
  ['exp(3x)', 1, '更陡的指数：仍然是同一条曲线'],
  ['sinh(x)', 1, '双曲正弦（越来越陡）'],
  ['x^7/1e5', 1, '高次幂（陡峭）'],
  ['abs(x)', 1, '绝对值（尖点不断开）'],
  ['sqrt(x)', 1, '定义域边界只需跳过 x<0'],
  ['ln(x)', 1, '对数：左半平面无定义'],
  ['sqrt(25-x^2)', 1, '半圆，两端定义域边界干净'],
  ['sin(x)/x', 2, '可去间断点：仅 x=0 处断开一个采样点，视觉上无缝'],
  ['floor(x)', 1, '取整函数：保留台阶竖线（与常见绘图器一致）'],
  ['sign(x)', 1, '符号函数：保留跨度很小的竖线'],
  ['1/x', 2, '单极点 → 两段'],
  ['1/(x-2)', 2, '平移后的极点'],
  ['1/x^2', 2, '二阶极点'],
  ['tan(x)', 7, '[-10.5,10.5] 内 6 个极点（±π/2 ±3π/2 ±5π/2）→ 7 段'],
  ['tan(x)+1/x', 8, 'tan 的 6 个极点 + 原点 → 8 段'],
  ['1/(x^2-1)', 3, '两个极点 → 三段'],
  ['tanh(x)', 1, '平滑'
  ],
  ['x-1/x', 2, '含极点'],
  ['1/sin(x)', 8, '[-10.5,10.5] 内 sin 有 7 个零点（0, ±π, ±2π, ±3π）→ 8 段'],
];

console.log('画布 900×600, 默认视图 x∈[-10.5,10.5] y∈[-7,7]\n');
for (const [expr, expect, why] of cases) {
  only(0, [expr]);
  setVisible(0, true);
  const strokes = curveStrokes();
  const s = strokes[0] || { subs: 0, maxDy: 0 };
  ok(('子路径数 = ' + expect + '  ' + expr).padEnd(34) + ' ' + why, s.subs === expect, { 实际: s.subs });
}
console.log('\n平滑但陡峭的曲线不应被误判为间断（补充检查）');
for (const expr of ['exp(3x)', 'sinh(x)', 'x^7/1e5', 'tan(x)']) {
  only(0, [expr]);
  setVisible(0, true);
  const strokes = curveStrokes();
  const totalSegs = strokes.reduce((a, s) => a + s.segs, 0);
  const subs = strokes.reduce((a, s) => a + s.subs, 0);
  console.log('  ' + expr.padEnd(12), '子路径 ' + String(subs).padStart(3), '  采样段 ' + String(totalSegs).padStart(5));
  ok(expr + ' 采样段数量合理（>=1800 说明采样足够密）', totalSegs > 1500, totalSegs);
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
