/* Teste da direção do vento bloqueada. Rodar: node tests/dir_blocked.js */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const grab = re => { const m = src.match(re); if (!m) throw new Error('trecho não encontrado: ' + re); return m[0]; };
const code = ['const tt = (s, ...a) => a.length ? s.replace(/\\{(\\d+)\\}/g, (_, i) => a[+i]) : s;',
  grab(/const PONTOS_PT = [^\n]*\n/), grab(/const PONTOS_EN = [^\n]*\n/), grab(/const PONTOS16 = [^\n]*\n/),
  grab(/const pontoDe = [^\n]*\n/),
  grab(/function dirBlocked\(dir, fromIdx, toIdx\) \{[\s\S]*?\n\}\n/),
  grab(/const rangesOf = [^\n]*\n/),
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

// ---- direção da onda (wdir_from / wdir_to), de onde a onda vem ----
const w0 = normalizeLimits({});
eq('onda: padrão sem faixa', [w0.wdir_from, w0.wdir_to], [null, null]);
const w1 = normalizeLimits({ wdir_from: I('L'), wdir_to: I('S') });
eq('onda: aceita faixa', [w1.wdir_from, w1.wdir_to], [I('L'), I('S')]);
erro = null; try { normalizeLimits({ wdir_from: 3 }); } catch (e) { erro = e.message; }
eq('onda: só um preenchido dá erro', /onda/i.test(erro || ''), true);
erro = null; try { normalizeLimits({ wdir_from: 99, wdir_to: 1 }); } catch (e) { erro = e.message; }
eq('onda: índice inválido dá erro', typeof erro, 'string');
eq('onda: vento e onda independentes', (() => { const x = normalizeLimits({ dir_from: 1, dir_to: 2 }); return [x.dir_from, x.wdir_from]; })(), [1, null]);
const LW = normalizeLimits({ hs_max: 3, wind_max: 40, wdir_from: I('L'), wdir_to: I('S') });
const rw = { ts: 0, hs: 1, tp: 8, wind_kn: 10, gust_kn: 12, wind_dir: 0 };
let ew = evaluateHour({ ...rw, wave_dir: 135 }, LW, null);
eq('onda 135 (SE) em L–S bloqueia', ew[0], 'nogo');
eq('motivo cita onda e faixa', /onda vindo de SE \(135°\).*L–S/.test(ew[1].join(' ')), true, ew[1]);
eq('onda 270 fora', evaluateHour({ ...rw, wave_dir: 270 }, LW, null)[0], 'go');
eq('onda sem direção vira nodata', evaluateHour({ ...rw, wave_dir: null }, LW, null)[0], 'nodata');
eq('direção do vento na faixa não afeta a onda', evaluateHour({ ...rw, wind_dir: 135, wave_dir: 270 }, LW, null)[0], 'go');
const LWc = normalizeLimits({ hs_max: 3, wind_max: 40, wdir_from: I('NO'), wdir_to: I('NE') });
eq('onda cruzando o norte', [evaluateHour({ ...rw, wave_dir: 350 }, LWc, null)[0], evaluateHour({ ...rw, wave_dir: 90 }, LWc, null)[0]], ['nogo', 'go']);
eq('sem faixa de onda: go mesmo sem direção', evaluateHour({ ...rw, wave_dir: null }, normalizeLimits({ hs_max: 3, wind_max: 40 }), null)[0], 'go');
const LB = normalizeLimits({ hs_max: 3, wind_max: 40, dir_from: I('N'), dir_to: I('N'), wdir_from: I('L'), wdir_to: I('S') });
eq('vento e onda bloqueados juntos: dois motivos', evaluateHour({ ...rw, wind_dir: 0, wave_dir: 135 }, LB, null)[1].length, 2);

console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes passaram');
process.exit(fails ? 1 : 0);
