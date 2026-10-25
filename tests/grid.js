/* Teste da grade e da escala de cores do mapa. Rodar: node tests/grid.js */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const grab = re => { const m = src.match(re); if (!m) throw new Error('trecho não encontrado: ' + re); return m[0]; };
const code = [grab(/const RM_N = [^\n]*\n/), grab(/function gridPoints\([\s\S]*?\n\}\n/), grab(/function hsClass\([\s\S]*?\n\}\n/)].join('\n') + '\nreturn { RM_N, RM_SPAN_KM, gridPoints, hsClass };';
const { RM_N, RM_SPAN_KM, gridPoints, hsClass } = new Function(code)();
let fails = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log('FALHOU', n, 'obtido', JSON.stringify(got), 'esperado', JSON.stringify(want)); } };
const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };

const g = gridPoints(-22.95, -43.19);
eq('49 pontos', g.length, 49); eq('n=7 e 300 km', [RM_N, RM_SPAN_KM], [7, 300]);
eq('centro é o ponto', [g[24].lat, g[24].lon], [-22.95, -43.19]);
eq('linha 0 é a mais ao norte', g[0].lat > g[48].lat, true);
eq('coluna 0 é a mais a oeste', g[0].lon < g[6].lon, true);
const passoNS = km(g[0].lat, g[0].lon, g[7].lat, g[7].lon), passoLO = km(g[0].lat, g[0].lon, g[1].lat, g[1].lon);
eq('passo norte-sul ~50 km', Math.abs(passoNS - 50) < 0.5, true);
eq('passo leste-oeste ~50 km (corrigido pela latitude)', Math.abs(passoLO - 50) < 0.5, true);
eq('lado total ~300 km', Math.abs(km(g[0].lat, g[0].lon, g[42].lat, g[42].lon) - 300) < 1, true);
const eq0 = gridPoints(0, 10); eq('no equador o passo em graus é igual', Math.abs((eq0[1].lon - eq0[0].lon) - (eq0[0].lat - eq0[7].lat)) < 1e-9, true);
eq('perto do polo não divide por zero', Number.isFinite(gridPoints(89.9, 0)[1].lon), true);

// escala relativa ao limite do perfil (1,5 m): 70% = 1,05
eq('abaixo de 70%', hsClass(1.0, 1.5), 'ok'); eq('exato 70% já é amarelo', hsClass(1.05, 1.5), 'mid');
eq('entre 70% e 100%', hsClass(1.4, 1.5), 'mid'); eq('exatamente no limite', hsClass(1.5, 1.5), 'mid');
eq('acima do limite', hsClass(1.51, 1.5), 'bad'); eq('zero', hsClass(0, 1.5), 'ok');
// escala fixa sem limite
eq('fixa até 1 m', hsClass(1, null), 'ok'); eq('fixa 1–2', hsClass(1.5, null), 'lo'); eq('fixa 2–3', hsClass(2.5, null), 'mid'); eq('fixa >3', hsClass(3.1, null), 'bad');
// sem dado
eq('nulo', hsClass(null, 1.5), 'none'); eq('indefinido', hsClass(undefined, null), 'none'); eq('NaN', hsClass(NaN, 1.5), 'none');
console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes da grade passaram'); process.exit(fails ? 1 : 0);
