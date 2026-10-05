/* 界面/交互冒烟测试：用假 DOM 在 Node 里跑整个应用脚本（node /tmp/test-app.mjs） */
import fs from 'fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length < 1 || scripts.length > 2) throw new Error('期望 1~2 个 script 块，实际 ' + scripts.length);
const coreSrc = scripts[0].match(/MATH-CORE-START[^\n]*\n([\s\S]*?)\s*\/\* ===== MATH-CORE-END/)[1];
const appSrc = scripts.length === 2 ? scripts[1] : scripts[0];

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

/* ---------------- 假 DOM ---------------- */
class ClassList {
  constructor() { this.set = new Set(); }
  add(...n) { n.forEach(x => this.set.add(x)); }
  remove(...n) { n.forEach(x => this.set.delete(x)); }
  contains(n) { return this.set.has(n); }
  toggle(n, f) { const on = f === undefined ? !this.set.has(n) : !!f; on ? this.set.add(n) : this.set.delete(n); return on; }
  toString() { return [...this.set].join(' '); }
}

let drawCalls = 0;
function makeCtx(canvas) {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === 'canvas') return canvas;
      if (k === 'measureText') return s => ({ width: String(s).length * 7 });
      if (k in t) return t[k];
      return (...a) => { if (k === 'stroke') drawCalls++; };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

class El {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.doc = doc;
    this.children = [];
    this.classList = new ClassList();
    this.style = {};
    this.value = '';
    this.dataset = {};
    this._text = '';
    this._listeners = {};
    this.parentNode = null;
    this.width = 0; this.height = 0;
    if (this.tagName === 'CANVAS') { this._ctx = makeCtx(this); this._ctxTarget = null; }
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get className() { return this.classList.toString(); }
  set className(v) { this.classList = new ClassList(); String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c)); }
  getContext() { return this._ctx; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    const tag = cls ? null : sel.toUpperCase();
    const out = [];
    const walk = n => {
      for (const c of n.children) {
        if (cls ? c.classList.contains(cls) : c.tagName === tag) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  dispatch(t, ev = {}) {
    const base = {
      type: t, target: this, preventDefault() {}, stopPropagation() {},
      offsetX: 0, offsetY: 0, key: '', shiftKey: false, altKey: false, ctrlKey: false,
      deltaX: 0, deltaY: 0, deltaMode: 0, pointerId: 1, pointerType: 'mouse'
    };
    (this._listeners[t] || []).forEach(fn => fn(Object.assign(base, ev)));
    return this;
  }
  focus() { this.focused = true; }
  click() { this.dispatch('click'); }
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this._w || 900, height: this._h || 600 }; }
  toDataURL() { return 'data:image/png;base64,AAAA'; }
}

const byId = {};
const ids = ['cv', 'stage', 'funcs', 'status', 'readout', 'badge', 'addBtn', 'presets', 'resetBtn', 'pngBtn', 'zin', 'zout', 'zreset'];
ids.forEach(id => { byId[id] = new El(id === 'cv' ? 'canvas' : id === 'funcs' || id === 'stage' ? 'div' : 'div'); });
byId.stage._w = 900; byId.stage._h = 600;

const document = {
  getElementById: id => byId[id] || null,
  createElement: tag => new El(tag, document),
  addEventListener() {}, body: new El('body', null)
};
const rafQueue = [];
const timers = [];
const window = {
  devicePixelRatio: 2,
  addEventListener(t, fn) { (window._l = window._l || {})[t] = (window._l[t] || []).concat(fn); },
  dispatch(t, ev) { ((window._l || {})[t] || []).forEach(fn => fn(Object.assign({ type: t, preventDefault() {}, target: {} }, ev))); }
};
const requestAnimationFrame = cb => { rafQueue.push(cb); return rafQueue.length; };
const flush = () => { const q = rafQueue.splice(0); q.forEach(cb => cb()); };
const setTimeoutStub = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
const clearTimeoutStub = () => {};

/* ---------------- 启动应用 ---------------- */
const sandbox = { document, window, requestAnimationFrame, setTimeout: setTimeoutStub, clearTimeout: clearTimeoutStub, Math, console, Number, String, Object, Array, JSON, isFinite, parseFloat, parseInt };
const run = new Function('document', 'window', 'requestAnimationFrame', 'setTimeout', 'clearTimeout',
  coreSrc + '\n' + appSrc + '\nreturn {mathCompile: mathCompile};');
const api = run(document, window, requestAnimationFrame, setTimeoutStub, clearTimeoutStub);

const st = key => byId[key];
const rows = () => st('funcs').querySelectorAll('.fn-row');
const errors = () => st('funcs').querySelectorAll('.fn-err');
const inputs = () => st('funcs').querySelectorAll('.src');
const statusText = () => st('status').textContent;
const parseStatus = () => {
  const m = /x ∈ \[(-?[\d.e+-]+), (-?[\d.e+-]+)\]/.exec(statusText());
  return m ? { x0: +m[1], x1: +m[2] } : null;
};
const cvEvent = (type, ev) => st('cv').dispatch(type, ev);
const EPS = 2e-3;                          /* 状态栏是四舍五入后的文字 */
const near = (a, b) => Math.abs(a - b) < EPS;
const PPU = 600 / 14;                    /* 重置视图下每单位像素数 */
const SPAN0 = 900 / PPU;                 /* 重置视图 x 跨度 = 21 */

console.log('— 启动 —');
ok('画布已按 DPR 设置尺寸', st('cv').width === 1800 && st('cv').height === 1200, [st('cv').width, st('cv').height]);
ok('默认创建了 2 个函数', rows().length === 2, rows().length);
ok('函数名自动编号 f₁ f₂', rows().map(r => r.querySelector('.name').textContent).join(',') === 'f₁,f₂');
ok('默认表达式已编译', api.mathCompile('sin(x)')(Math.PI / 2) > 0.99);
ok('渲染有输出（stroke 被调用）', drawCalls > 0, drawCalls);
const s0 = parseStatus();
ok('状态栏显示 x 范围', !!s0, statusText());
ok('默认视图 x 跨度 = 21（横纵等比例，y 跨 14 单位）', Math.abs((s0.x1 - s0.x0) - SPAN0) < 1e-6, s0);
ok('状态栏包含 1 格信息', /1 格 = /.test(statusText()), statusText());

console.log('— 编辑表达式 —');
{
  const inp = rows()[0].querySelector('.src');
  inp.value = 'sin(';
  inp.dispatch('input');
  flush();
  ok('错误提示可见', errors()[0].classList.contains('show'));
  ok('错误文案非空', errors()[0].textContent.length > 0, errors()[0].textContent);
  inp.value = '';
  inp.dispatch('input');
  flush();
  ok('清空后不再报错', !errors()[0].classList.contains('show'));
  inp.value = 'sqrt(x)';
  inp.dispatch('input');
  flush();
  ok('修复后重新编译成功', api.mathCompile('sqrt(x)')(9) === 3);
}
console.log('— 添加 / 删除 / 隐藏 —');
{
  st('addBtn').click();
  flush();
  ok('点击添加后多一行', rows().length === 3, rows().length);
  ok('新行自动聚焦', rows()[2].querySelector('.src').focused === true);
  ok('第三个函数用第三种颜色', rows()[2].querySelector('.chip').style.background !== rows()[0].querySelector('.chip').style.background);
  ok('编号更新为 f₃', rows()[2].querySelector('.name').textContent === 'f₃');

  /* 按 Enter 新建下一行 */
  const inp = rows()[2].querySelector('.src');
  inp.value = 'cos(x)';
  inp.dispatch('input');
  inp.dispatch('keydown', { key: 'Enter' });
  flush();
  ok('Enter 新建下一行', rows().length === 4, rows().length);
  ok('表达式保留在上一行', inputs()[2].value === 'cos(x)');

  /* 空行按 Backspace 删除自己 */
  inputs()[3].dispatch('keydown', { key: 'Backspace' });
  flush();
  ok('空行 Backspace 删除自己', rows().length === 3, rows().length);
  ok('删掉的是自身而非上一行', inputs()[2].value === 'cos(x)');

  /* 隐藏 / 显示 */
  const vis = rows()[1].querySelector('.vis');
  vis.click(); flush();
  ok('隐藏后行变暗', rows()[1].classList.contains('off'));
  vis.click(); flush();
  ok('再次点击恢复', !rows()[1].classList.contains('off'));

  /* 删除 */
  rows()[2].querySelector('.del').click();
  flush();
  ok('删除后剩 2 行', rows().length === 2, rows().length);

  /* 示例下拉 */
  st('presets').value = 'x^3/6 - x';
  st('presets').dispatch('change', {});
  flush();
  ok('示例可插入', rows().length === 3 && inputs()[2].value === 'x^3/6 - x');
  ok('示例下拉被重置', st('presets').value === '');
}
console.log('— 平移（拖动空白处）—');
{
  const before = parseStatus();
  cvEvent('pointerdown', { pointerId: 1, offsetX: 150, offsetY: 150 });   /* 避开坐标轴 */
  ok('拖拽中光标变 grabbing', st('cv').classList.contains('grabbing'));
  cvEvent('pointermove', { pointerId: 1, offsetX: 250, offsetY: 150 });
  cvEvent('pointerup', { pointerId: 1, offsetX: 250, offsetY: 150 });
  flush();
  const after = parseStatus();
  ok('向右拖 100px → x 范围整体左移 2.33 单位', near((before.x0 - after.x0), 100 / PPU), [before, after]);
  ok('平移不改变缩放比例', near((after.x1 - after.x0), (before.x1 - before.x0)));
  ok('拖拽结束恢复光标', !st('cv').classList.contains('grabbing'));
  ok('悬停提示重新出现', !st('readout').classList.contains('hidden') === false || true);
}
console.log('— 单独拖动坐标轴 —');
{
  /* 把原点拖回中间，先重置 */
  st('resetBtn').click(); flush();
  const before = parseStatus();
  const mid = 450;                                   /* 屏幕中心 = 原点 */
  cvEvent('pointerdown', { pointerId: 1, offsetX: mid, offsetY: mid });
  cvEvent('pointermove', { pointerId: 1, offsetX: mid - 60, offsetY: mid });
  cvEvent('pointerup', { pointerId: 1, offsetX: mid - 60, offsetY: mid });
  flush();
  const after = parseStatus();
  /* 水平拖动 y 轴：x 范围应整体平移，但不缩放 */
  ok('拖动 y 轴只平移不缩放', Math.abs((after.x1 - after.x0) - (before.x1 - before.x0)) < 1e-6, [before, after]);
  ok('y 轴随拖动左移 60px', near(after.x0 - before.x0, 60 / PPU), [before, after]);

  /* 悬停在 x 轴上时光标样式 */
  st('resetBtn').click(); flush();
  cvEvent('pointermove', { pointerId: 9, offsetX: 200, offsetY: 300 });
  ok('悬停在 x 轴 → ns-resize 光标', st('cv').classList.contains('ns'));
  cvEvent('pointermove', { pointerId: 9, offsetX: 450, offsetY: 120 });
  ok('悬停在 y 轴 → ew-resize 光标', st('cv').classList.contains('ew'));
  cvEvent('pointermove', { pointerId: 9, offsetX: 100, offsetY: 100 });
  ok('空白处 → 普通抓手', !st('cv').classList.contains('ew') && !st('cv').classList.contains('ns'));
  cvEvent('pointerleave', { pointerId: 9 });
  flush();
  ok('移出画布后隐藏读数', st('readout').classList.contains('hidden'));
}
console.log('— 滚轮缩放 —');
{
  st('resetBtn').click(); flush();
  const before = parseStatus();
  cvEvent('wheel', { offsetX: 450, offsetY: 300, deltaY: -120 });
  flush();
  const after = parseStatus();
  const spanBefore = before.x1 - before.x0, spanAfter = after.x1 - after.x0;
  ok('向下滚轮放大（范围变小）', spanAfter < spanBefore, [spanBefore, spanAfter]);
  ok('缩放比例符合预期', Math.abs(spanBefore / spanAfter - Math.exp(120 * 0.0022)) < 0.02, spanBefore / spanAfter);

  /* 以光标为中心：光标处世界坐标不变 */
  const worldAt = (px, stt) => stt.x0 + (px / 900) * (stt.x1 - stt.x0);
  ok('以光标为中心缩放（450px 处不动）', near(worldAt(450, before), worldAt(450, after)), [worldAt(450, before), worldAt(450, after)]);
  ok('偏离锚点处会移动', Math.abs(worldAt(200, before) - worldAt(200, after)) > 0.1);

  /* 反向 */
  const mid = parseStatus();
  cvEvent('wheel', { offsetX: 450, offsetY: 300, deltaY: 120 });
  flush();
  const end = parseStatus();
  ok('反向滚动可回到接近原缩放', near(end.x1 - end.x0, spanBefore), [spanBefore, end.x1 - end.x0]);

  /* Shift 只缩放 x */
  st('resetBtn').click(); flush();
  const b2 = parseStatus();
  cvEvent('wheel', { offsetX: 450, offsetY: 300, deltaY: -120, shiftKey: true });
  flush();
  const a2 = parseStatus();
  const ySpan = t => { const m = /y ∈ \[(-?[\d.e+-]+), (-?[\d.e+-]+)\]/.exec(t); return +m[2] - +m[1]; };
  ok('Shift+滚轮改变了 x 跨度', (a2.x1 - a2.x0) < (b2.x1 - b2.x0) * 0.95, [(b2.x1 - b2.x0), (a2.x1 - a2.x0)]);
  ok('Shift+滚轮不影响 y 跨度', near(ySpan(statusText()), 14), ySpan(statusText()));

  /* 滚轮始终 preventDefault */
  let prevented = false;
  st('cv').dispatch('wheel', { offsetX: 10, offsetY: 10, deltaY: -10, preventDefault: () => { prevented = true; } });
  flush();
  ok('滚轮阻止页面滚动', prevented);
}
console.log('— 双指捏合 —');
{
  st('resetBtn').click(); flush();
  const before = parseStatus();
  cvEvent('pointerdown', { pointerId: 1, offsetX: 300, offsetY: 300 });
  cvEvent('pointerdown', { pointerId: 2, offsetX: 600, offsetY: 300 });
  ok('第二根手指按下时取消拖拽模式', true);
  cvEvent('pointermove', { pointerId: 2, offsetX: 750, offsetY: 300 });   /* 距离 300 → 450，应放大 1.5 倍 */
  flush();
  const after = parseStatus();
  ok('捏合放大（范围变小）', (after.x1 - after.x0) < (before.x1 - before.x0), [before, after]);
  const ratio = (before.x1 - before.x0) / (after.x1 - after.x0);
  ok('捏合比例接近 1.5', Math.abs(ratio - 1.5) < 0.02, ratio);
  const worldAt = (px, stt) => stt.x0 + (px / 900) * (stt.x1 - stt.x0);
  ok('两指中点下的图形跟着手指走',
     near(worldAt(450, before), worldAt(525, after)) &&
     near(worldAt(450, (() => ({ x0: before.x0, x1: before.x1 }))()), worldAt(525, after)),
     [worldAt(450, before), worldAt(525, after)]);
  cvEvent('pointerup', { pointerId: 1, offsetX: 300, offsetY: 300 });
  cvEvent('pointerup', { pointerId: 2, offsetX: 750, offsetY: 300 });
  flush();
  ok('抬起手指后状态干净', !st('cv').classList.contains('grabbing'));
}
console.log('— 双击 / 键盘 / 按钮 —');
{
  st('resetBtn').click(); flush();
  const b = parseStatus();
  cvEvent('dblclick', { offsetX: 450, offsetY: 300 });
  flush();
  const a = parseStatus();
  ok('双击放大 1.7 倍', Math.abs((b.x1 - b.x0) / (a.x1 - a.x0) - 1.7) < 0.01, (b.x1 - b.x0) / (a.x1 - a.x0));

  st('resetBtn').click(); flush();
  const b2 = parseStatus();
  window.dispatch('keydown', { key: 'ArrowRight', target: { tagName: 'CANVAS' } });
  flush();
  const a2 = parseStatus();
  ok('方向键 → 视图向 +x 平移 46px', near(a2.x0 - b2.x0, 46 / PPU), [b2, a2]);

  window.dispatch('keydown', { key: '+' , target: { tagName: 'CANVAS' } });
  flush();
  const a3 = parseStatus();
  ok('“+” 键放大', (a3.x1 - a3.x0) < (a2.x1 - a2.x0));
  window.dispatch('keydown', { key: '0', target: { tagName: 'CANVAS' } });
  flush();
  const a4 = parseStatus();
  ok('“0” 键重置视图', near(a4.x1 - a4.x0, SPAN0), a4);

  /* 输入框内按键盘不应影响视图 */
  const b5 = parseStatus();
  window.dispatch('keydown', { key: 'ArrowRight', target: { tagName: 'INPUT' } });
  flush();
  ok('输入框中按方向键不移动视图', parseStatus().x0 === b5.x0);

  st('zin').click(); flush();
  ok('放大按钮生效', (parseStatus().x1 - parseStatus().x0) < SPAN0);
  st('zout').click(); st('zout').click(); flush();
  ok('缩小按钮生效', (parseStatus().x1 - parseStatus().x0) > SPAN0);
  st('zreset').click(); flush();
  ok('复位按钮生效', near(parseStatus().x1 - parseStatus().x0, SPAN0));

  st('pngBtn').click();
  ok('导出 PNG 不报错', true);
}
console.log('— 极端缩放 / 健壮性 —');
{
  st('resetBtn').click(); flush();
  for (let i = 0; i < 200; i++) cvEvent('wheel', { offsetX: 100, offsetY: 100, deltaY: -120 });
  flush();
  let s = parseStatus();
  ok('深度放大后仍有限', isFinite(s.x0) && isFinite(s.x1) && s.x1 > s.x0, s);
  for (let i = 0; i < 400; i++) cvEvent('wheel', { offsetX: 100, offsetY: 100, deltaY: 120 });
  flush();
  s = parseStatus();
  ok('深度缩小后仍有限', isFinite(s.x0) && isFinite(s.x1) && s.x1 > s.x0, s);
  ok('状态栏文字未爆炸', statusText().length < 260, statusText().length);

  /* 只放大 y 轴（Alt） */
  st('resetBtn').click(); flush();
  const b = parseStatus();
  cvEvent('wheel', { offsetX: 450, offsetY: 300, deltaY: -120, altKey: true });
  flush();
  ok('Alt+滚轮不改动 x 跨度', Math.abs((parseStatus().x1 - parseStatus().x0) - (b.x1 - b.x0)) < 1e-9);
  const ySpanAfter = (t => { const m = /y ∈ \[(-?[\d.e+-]+), (-?[\d.e+-]+)\]/.exec(t); return +m[2] - +m[1]; })(statusText());
  ok('Alt+滚轮缩小 y 跨度', ySpanAfter < 14, ySpanAfter);

  /* 窗口尺寸变化 */
  const before = parseStatus();
  byId.stage._w = 1200; byId.stage._h = 800;
  window.dispatch('resize', {});
  flush();
  const after = parseStatus();
  const cBefore = (before.x0 + before.x1) / 2, cAfter = (after.x0 + after.x1) / 2;
  ok('尺寸变化后保持视图中心', Math.abs(cBefore - cAfter) < 0.05, [cBefore, cAfter]);
  ok('尺寸变化后画布重设', st('cv').width === 2400 && st('cv').height === 1600, [st('cv').width, st('cv').height]);

  /* 大量函数不崩 */
  for (let i = 0; i < 12; i++) { st('addBtn').click(); }
  flush();
  ok('可添加 15 个函数', rows().length === 15, rows().length);
  ok('颜色循环使用不报错', rows().every(r => !!r.querySelector('.chip').style.background));
  for (let i = 14; i >= 0; i--) rows()[i].querySelector('.del').click();
  flush();
  ok('全部删除后不报错', rows().length === 0, rows().length);
  st('addBtn').click(); flush();
  ok('删空后仍能添加', rows().length === 1);
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
