/* 数学内核单元测试（node /tmp/test-core.mjs） */
import fs from 'fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/MATH-CORE-START[^\n]*\n([\s\S]*?)\s*\/\* ===== MATH-CORE-END/);
if (!m) throw new Error('找不到 MATH-CORE 代码块');
const core = new Function(m[1] + '\nreturn {mathCompile, mathParse, mathTokenize, niceStep, fmtTick, fmtReadout, MATH_FUNCS, MATH_CONSTS};')();
const { mathCompile, mathParse, niceStep, fmtTick, fmtReadout } = core;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
function near(name, got, want, eps = 1e-9) {
  ok(name + ' = ' + want, Math.abs(got - want) < eps, got);
}
function val(src, x) { return mathCompile(src)(x); }
function err(src, x = 1) { return mathCompile(src)(x); }
function throws(name, src) {
  let threw = false, msg = '';
  try { mathCompile(src); } catch (e) { threw = true; msg = e.message; }
  ok('报错: ' + name, threw, '没有报错');
  return msg;
}

console.log('— 基础运算 —');
near('x+1', val('x+1', 2), 3);
near('2+3*4', val('2+3*4', 0), 14);
near('(2+3)*4', val('(2+3)*4', 0), 20);
near('2-3-4', val('2-3-4', 0), -5);
near('8/2/2', val('8/2/2', 0), 2);
near('-x', val('-x', 3), -3);
near('--x', val('--x', 3), 3);
near('+x', val('+x', 3), 3);
near('1e3', val('1e3', 0), 1000);
near('.5*4', val('.5*4', 0), 2);
near('3.5+1.5', val('3.5+1.5', 0), 5);

console.log('— 幂与优先级 —');
near('x^2', val('x^2', 3), 9);
near('-x^2', val('-x^2', 3), -9);
near('2^3^2', val('2^3^2', 0), 512);
near('2*x^3', val('2*x^3', 2), 16);
near('x^(1/2)', val('x^(1/2)', 9), 3);
near('2**3', val('2**3', 0), 8);
near('-2^2', val('-2^2', 0), -4);
near('2^-1', val('2^-1', 0), 0.5);

console.log('— 隐式乘法 —');
near('2x', val('2x', 3), 6);
near('2x^2', val('2x^2', 3), 18);
near('3(x+1)', val('3(x+1)', 2), 9);
near('(x+1)(x-1)', val('(x+1)(x-1)', 3), 8);
near('2sin(0)', val('2sin(0)', 0), 0);
near('sin(x)cos(x)', val('sin(x)cos(x)', Math.PI / 4), 0.5, 1e-12);
near('4x', val('4x', 0.25), 1);

console.log('— 函数与常量 —');
near('sin(pi/2)', val('sin(pi/2)', 0), 1, 1e-12);
near('cos(tau)', val('cos(tau)', 0), 1, 1e-12);
near('e', val('e', 0), Math.E);
near('ln(e)', val('ln(e)', 0), 1);
near('log(100)', val('log(100)', 0), 2);
near('log(8,2)', val('log(8,2)', 0), 3);
near('lg(1000)', val('lg(1000)', 0), 3);
near('log2(8)', val('log2(8)', 0), 3);
near('sqrt(2)', val('sqrt(2)', 0), Math.SQRT2);
near('cbrt(27)', val('cbrt(27)', 0), 3);
near('abs(-3)', val('abs(-3)', 0), 3);
near('exp(1)', val('exp(1)', 0), Math.E);
near('floor(2.7)', val('floor(2.7)', 0), 2);
near('round(2.5)', val('round(2.5)', 0), 3);
near('sign(-5)', val('sign(-5)', 0), -1);
near('min(3,1,2)', val('min(3,1,2)', 0), 1);
near('max(3,1,2)', val('max(3,1,2)', 0), 3);
near('pow(2,10)', val('pow(2,10)', 0), 1024);
near('hypot(3,4)', val('hypot(3,4)', 0), 5);
near('mod(-1,3)', val('mod(-1,3)', 0), 2);
near('mod(7,3)', val('mod(7,3)', 0), 1);
near('sec(0)', val('sec(0)', 0), 1);
near('tan(pi/4)', val('tan(pi/4)', 0), 1, 1e-12);
near('atanh(0.5)', val('atanh(0.5)', 0), Math.atanh(0.5));
near('π/2', val('π/2', 0), Math.PI / 2);
near('τ', val('τ', 0), 2 * Math.PI);
near('φ', val('φ', 0), (1 + Math.sqrt(5)) / 2);

console.log('— 全角符号 / 中文输入 —');
near('　sin（x）', val('　sin（x）', Math.PI / 2), 1, 1e-12);
near('x×2', val('x×2', 4), 8);
near('x÷2', val('x÷2', 4), 2);
near('x−1', val('x−1', 4), 3);

console.log('— 特殊值 —');
ok('1/x at 0 = Infinity', val('1/x', 0) === Infinity);
ok('0/0 = NaN', Number.isNaN(val('0/0', 0)));
ok('sqrt(-1) = NaN', Number.isNaN(val('sqrt(-1)', 0)));
ok('ln(-1) = NaN', Number.isNaN(val('ln(-1)', 0)));
ok('tan(pi/2) 很大', Math.abs(val('tan(pi/2)', 0)) > 1e15);

console.log('— 错误处理 —');
throws('空表达式', '');
throws('只输空格', '   ');
throws('括号未闭合', 'sin(x');
throws('未闭合内层', 'sin(cos(x)');
throws('多余右括号', '(x+1))');
throws('未知函数', 'foo(x)');
throws('未知名称', 'y+1');
throws('函数缺括号', 'sin');
throws('参数太少', 'log()');
throws('参数太多', 'sin(1,2)');
throws('非法字符', 'x@2');
throws('运算符位置错误', 'x++');
throws('浮点数格式错误', '1.2.3');
const msg = throws('多余内容', '2x)');
ok('错误信息可读: ' + msg, typeof msg === 'string' && msg.length > 0);

console.log('— 缩放刻度 —');
let bad = 0;
for (let e = -6; e <= 6; e++) {
  for (const ppu of [3e-3, 0.05, 0.7, 1.3, 9, 37.5, 240, 5000, 1.2e6]) {
    const pp = ppu * Math.pow(10, e * 0.37);
    const s = niceStep(pp, 92);
    const px = s.step * pp;
    if (!(px > 18 && px < 400) || !isFinite(s.step)) { bad++; console.log('   bad:', pp, s); }
  }
}
ok('刻度间距始终在合理像素范围', bad === 0, bad + ' 个异常');
ok('niceStep(100,92).step === 1', niceStep(100, 92).step === 1);
ok('niceStep(60,92).step === 2', niceStep(60, 92).step === 2);
ok('niceStep(25,92).step === 5', niceStep(25, 92).step === 5);
ok('niceStep(1000,92).step === 0.1', Math.abs(niceStep(1000, 92).step - 0.1) < 1e-12);

console.log('— 刻度文字 —');
ok('fmtTick(0,1) = 0', fmtTick(0, 1) === '0');
ok('fmtTick(2,1) = 2', fmtTick(2, 1) === '2');
ok('fmtTick(1.5,0.5) = 1.5', fmtTick(1.5, 0.5) === '1.5');
ok('fmtTick(0.2,0.1) = 0.2', fmtTick(0.2, 0.1) === '0.2');
ok('fmtTick(1000,100) = 1000', fmtTick(1000, 100) === '1000');
ok('fmtTick(2e6,1e6) 用科学计数', /e/.test(fmtTick(2e6, 1e6)), fmtTick(2e6, 1e6));
ok('fmtTick 无 -0', fmtTick(-0, 1) === '0');
ok('fmtReadout(0.1, 60) = 0.1', fmtReadout(0.1, 60) === '0.1', fmtReadout(0.1, 60));
ok('fmtReadout(12345678, 60) 科学计数', /e/.test(fmtReadout(12345678, 60)), fmtReadout(12345678, 60));
ok('fmtReadout(NaN) = —', fmtReadout(NaN, 60) === '—');

console.log('— 编译缓存/源码 —');
ok('f.source 保留原文', mathCompile(' sin(x) ').source === 'sin(x)');
ok('连续调用一致', mathCompile('x^3')(3) === 27 && mathCompile('x^3')(-2) === -8);
let nonNum = false;
try { mathCompile('"abc"'); } catch (e) { nonNum = true; }
ok('拒绝字符串字面量', nonNum);

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
