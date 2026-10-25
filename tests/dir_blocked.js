/* Teste da direção do vento bloqueada. Rodar: node tests/dir_blocked.js */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const grab = re => { const m = src.match(re); if (!m) throw new Error('trecho não encontrado: ' + re); return m[0]; };
const code = [
  grab(/const PONTOS16 = [^\n]*\n/),
  grab(/const pontoDe = [^\n]*\n/),
  grab(/function dirBlocked\(dir, fromIdx, toIdx\) \{[\s\S]*?\n\}\n/),
  grab(/function normalizeLimits\(raw\) \{[\s\S]*?\n\}\n/),
  grab(/function evaluateHour\(row, L, day\) \{[\s\S]*?\n\}\n/),
  grab(/const isDaylight = [^\n]*\n/),
].join('\n') + '\nreturn { PONTOS16, dirBlocked, normalizeLimits, evaluateHour };';
const { PONTOS16, dirBlocked, normalizeLimits, evaluateHour } = new Function(code)();
let fails = 0;
const eq = (nome, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log('FALHOU', nome, 'obtido', JSON.stringify(got), 'esperado', JSON.stringify(want)); } };
const I = n => PONTOS16.indexOf(n);

eq('16 pontos', PONTOS16.length, 16);
// faixa SSE..SSO = 146,25° a 213,75° (fim exclusivo)
eq('180 em SSE-SSO', dirBlocked(180, I('SSE'), I('SSO')), true);
eq('90 fora', dirBlocked(90, I('SSE'), I('SSO')), false);
eq('borda início 146.25', dirBlocked(146.25, I('SSE'), I('SSO')), true);
eq('logo antes 146.24', dirBlocked(146.24, I('SSE'), I('SSO')), false);
eq('borda fim 213.75 exclusiva', dirBlocked(213.75, I('SSE'), I('SSO')), false);
eq('logo antes do fim', dirBlocked(213.74, I('SSE'), I('SSO')), true);
// cruza o norte: NO..NE (303,75° a 56,25°)
eq('350 em NO-NE', dirBlocked(350, I('NO'), I('NE')), true);
eq('10 em NO-NE', dirBlocked(10, I('NO'), I('NE')), true);
eq('0 em NO-NE', dirBlocked(0, I('NO'), I('NE')), true);
eq('90 fora NO-NE', dirBlocked(90, I('NO'), I('NE')), false);
eq('200 fora NO-NE', dirBlocked(200, I('NO'), I('NE')), false);
// 360 equivale a 0 ; de = até bloqueia só aquele ponto
eq('360 = 0 em N-N', dirBlocked(360, 0, 0), true);
eq('5 em N-N', dirBlocked(5, 0, 0), true);
eq('30 fora de N-N', dirBlocked(30, 0, 0), false);
eq('negativo -5 = 355 em N-N', dirBlocked(-5, 0, 0), true);
// sem dado ou faixa vazia
eq('dado nulo', dirBlocked(null, 0, 3), null);
eq('dado indefinido', dirBlocked(undefined, 0, 3), null);

// normalizeLimits
const n0 = normalizeLimits({});
eq('padrão sem direção', [n0.dir_from, n0.dir_to], [null, null]);
const n1 = normalizeLimits({ dir_from: I('SSE'), dir_to: I('SSO') });
eq('aceita faixa', [n1.dir_from, n1.dir_to], [I('SSE'), I('SSO')]);
let erro = null; try { normalizeLimits({ dir_from: 3, dir_to: null }); } catch (e) { erro = e.message; }
eq('só um preenchido dá erro', typeof erro, 'string');
erro = null; try { normalizeLimits({ dir_from: 16, dir_to: 2 }); } catch (e) { erro = e.message; }
eq('índice inválido dá erro', typeof erro, 'string');
eq('strings vazias = não usar', (() => { const x = normalizeLimits({ dir_from: '', dir_to: '' }); return [x.dir_from, x.dir_to]; })(), [null, null]);
eq('strings numéricas', (() => { const x = normalizeLimits({ dir_from: '7', dir_to: '9' }); return [x.dir_from, x.dir_to]; })(), [7, 9]);

// evaluateHour
const L = normalizeLimits({ hs_max: 2, wind_max: 30, dir_from: I('SSE'), dir_to: I('SSO') });
const base = { ts: 0, hs: 1, tp: 8, wind_kn: 10, gust_kn: 12 };
let r = evaluateHour({ ...base, wind_dir: 180 }, L, null);
eq('180 vira nogo', r[0], 'nogo');
eq('motivo cita direção', /direção S \(180°\).*SSE–SSO/.test(r[1].join(' ')), true);
eq('90 continua go', evaluateHour({ ...base, wind_dir: 90 }, L, null)[0], 'go');
eq('sem direção vira nodata', evaluateHour({ ...base, wind_dir: null }, L, null)[0], 'nodata');
// campos vazios: nada muda, mesmo sem direção nos dados
const Lv = normalizeLimits({ hs_max: 2, wind_max: 30 });
eq('sem faixa: go mesmo com direção na faixa', evaluateHour({ ...base, wind_dir: 180 }, Lv, null)[0], 'go');
eq('sem faixa: go sem dado de direção', evaluateHour({ ...base, wind_dir: null }, Lv, null)[0], 'go');

console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes passaram');
process.exit(fails ? 1 : 0);
