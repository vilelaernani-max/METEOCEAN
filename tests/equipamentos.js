/* Teste do cadastro de equipamentos e da combinação de limites. Rodar: node tests/equipamentos.js [pasta-de-capturas]
   Parte pura (Node) e parte de navegador (Playwright + Chromium, com a Open-Meteo simulada). */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const shots = process.argv[2];
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
const eq = (n, got, want) => ok(n, JSON.stringify(got) === JSON.stringify(want), `obtido ${JSON.stringify(got)} esperado ${JSON.stringify(want)}`);
const grab = re => { const m = src.match(re); if (!m) throw new Error('trecho não encontrado: ' + re); return m[0]; };

// ---------------- parte pura ----------------
const code = [
  grab(/const HOUR = 3600;\n/), grab(/const PONTOS16 = [^\n]*\n/), grab(/const pontoDe = [^\n]*\n/), grab(/function dirBlocked\([\s\S]*?\n\}\n/),
  grab(/const rangesOf = [^\n]*\n/), grab(/function combineEquipLimits\([\s\S]*?\n\}\n/),
  grab(/function normalizeLimits\(raw\) \{[\s\S]*?\n\}\n/), grab(/const isDaylight = [^\n]*\n/), grab(/function evaluateHour\(row, L, day\) \{[\s\S]*?\n\}\n/),
  grab(/const dirTxt = [^\n]*\n/),
].join('\n') + '\nreturn { PONTOS16, rangesOf, combineEquipLimits, normalizeLimits, evaluateHour, dirTxt };';
const { PONTOS16, combineEquipLimits, normalizeLimits, evaluateHour, dirTxt } = new Function(code)();
const I = n => PONTOS16.indexOf(n);

const A = { name: 'Guindaste A', limits: { hs_max: 2, tp_min: 6, wind_max: 25, gust_max: 30, cur_max: null, dir_from: I('SSE'), dir_to: I('SSO'), wdir_from: null, wdir_to: null } };
const B = { name: 'ROV B', limits: { hs_max: 1.5, tp_min: 8, wind_max: 30, gust_max: null, cur_max: 1.5, dir_from: I('NO'), dir_to: I('NE'), wdir_from: I('L'), wdir_to: I('S') } };
const C = { name: 'Sem limites', limits: {} };

let c = combineEquipLimits([A, B]);
eq('Hs = menor', c.hs_max, 1.5); eq('vento = menor', c.wind_max, 25); eq('Tp mínimo = maior', c.tp_min, 8);
eq('rajada vem só do que tem', c.gust_max, 30); eq('corrente vem só do que tem', c.cur_max, 1.5);
eq('faixas de vento = união', c.dir_ranges, [[I('SSE'), I('SSO')], [I('NO'), I('NE')]]);
eq('faixas de onda = as que existem', c.wdir_ranges, [[I('L'), I('S')]]);
c = combineEquipLimits([A]); eq('um só equipamento: seus limites', [c.hs_max, c.tp_min, c.wind_max, c.gust_max, c.cur_max, c.dir_ranges.length], [2, 6, 25, 30, null, 1]);
c = combineEquipLimits([A, C]); eq('equipamento sem limites não altera', [c.hs_max, c.wind_max, c.dir_ranges.length], [2, 25, 1]);
c = combineEquipLimits([C]); eq('só equipamento sem limites: tudo vazio', [c.hs_max, c.tp_min, c.wind_max, c.gust_max, c.cur_max, c.dir_ranges, c.wdir_ranges], [null, null, null, null, null, [], []]);
c = combineEquipLimits([]); eq('lista vazia: tudo vazio', [c.hs_max, c.wind_max, c.dir_ranges], [null, null, []]);
c = combineEquipLimits([A, { name: 'A2', limits: A.limits }]); eq('faixas iguais não se repetem', c.dir_ranges.length, 1);
c = combineEquipLimits([{ name: 'meia faixa', limits: { dir_from: 3, dir_to: null } }]); eq('faixa pela metade é ignorada', c.dir_ranges, []);
c = combineEquipLimits([{ name: 'zero', limits: { hs_max: 0, wind_max: 0 } }, { name: 'x', limits: { hs_max: 3, wind_max: 9 } }]); eq('limite zero é limite (o menor)', [c.hs_max, c.wind_max], [0, 0]);
eq('não altera os equipamentos de entrada', [A.limits.hs_max, A.limits.dir_from], [2, I('SSE')]);

// várias faixas na avaliação hora a hora
const L = normalizeLimits({ hs_max: 3, wind_max: 40, dir_ranges: [[I('SSE'), I('SSO')], [I('NO'), I('NE')]] });
const row = { ts: 0, hs: 1, tp: 8, wind_kn: 10, gust_kn: 12 };
let e = evaluateHour({ ...row, wind_dir: 180 }, L, null); eq('180° bloqueia (1ª faixa)', e[0], 'nogo'); ok('motivo cita a 1ª faixa', /SSE–SSO/.test(e[1].join(' ')), e[1].join(' '));
e = evaluateHour({ ...row, wind_dir: 350 }, L, null); eq('350° bloqueia (2ª faixa, cruza o norte)', e[0], 'nogo'); ok('motivo cita a 2ª faixa', /NO–NE/.test(e[1].join(' ')), e[1].join(' '));
eq('90° passa', evaluateHour({ ...row, wind_dir: 90 }, L, null)[0], 'go');
eq('sem direção com faixas: sem dado', evaluateHour({ ...row, wind_dir: null }, L, null)[0], 'nodata');
const Lw = normalizeLimits({ hs_max: 3, wind_max: 40, wdir_ranges: [[I('L'), I('S')], [I('NNO'), I('N')]] });
eq('onda 135° bloqueia', evaluateHour({ ...row, wave_dir: 135 }, Lw, null)[0], 'nogo'); eq('onda 355° bloqueia (2ª faixa)', evaluateHour({ ...row, wave_dir: 355 }, Lw, null)[0], 'nogo'); eq('onda 270° passa', evaluateHour({ ...row, wave_dir: 270 }, Lw, null)[0], 'go');
const Lmix = normalizeLimits({ hs_max: 3, wind_max: 40, dir_from: I('L'), dir_to: I('L'), dir_ranges: [[I('S'), I('S')]] });
eq('par único e lista valem juntos (L)', evaluateHour({ ...row, wind_dir: 90 }, Lmix, null)[0], 'nogo'); eq('par único e lista valem juntos (S)', evaluateHour({ ...row, wind_dir: 180 }, Lmix, null)[0], 'nogo');
const Ldup = normalizeLimits({ hs_max: 3, wind_max: 40, dir_from: I('S'), dir_to: I('S'), dir_ranges: [[I('S'), I('S')]] });
eq('mesma faixa no par e na lista: um só motivo', evaluateHour({ ...row, wind_dir: 180 }, Ldup, null)[1].length, 1);
eq('sem faixas, sem efeito', evaluateHour({ ...row, wind_dir: null }, normalizeLimits({ hs_max: 3, wind_max: 40, dir_ranges: [] }), null)[0], 'go');
let erro = null; try { normalizeLimits({ dir_ranges: [[16, 2]] }); } catch (x) { erro = x.message; } eq('índice inválido na lista dá erro', typeof erro, 'string');
erro = null; try { normalizeLimits({ dir_ranges: ['x'] }); } catch (x) { erro = x.message; } eq('item que não é faixa dá erro', typeof erro, 'string');
erro = null; try { normalizeLimits({ wdir_ranges: [[1]] }); } catch (x) { erro = x.message; } eq('faixa incompleta dá erro', typeof erro, 'string');
eq('textos de todas as faixas', dirTxt(L), 'SSE a SSO; NO a NE'); eq('sem faixa: não usado', dirTxt(normalizeLimits({})), 'não usado');
eq('texto de onda', dirTxt(Lw, true), 'L a S; NNO a N');

console.log(fails ? `${fails} FALHA(S) na parte pura` : 'ok: parte pura dos equipamentos passou');
if (fails) process.exit(1);

// ---------------- parte de navegador ----------------
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  let dirVento = 180, dirOnda = 270;
  const abre = async (w = 1100, h = 900, scheme = 'light') => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/*open-meteo.com/**', r => {
      const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(130)].map((_, i) => t0 + i * 3600), m = r.request().url().includes('marine');
      r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: m ? { time, wave_height: time.map(() => 1.0), wave_period: time.map(() => 9), wave_direction: time.map(() => dirOnda), ocean_current_velocity: time.map(() => 1), ocean_current_direction: time.map(() => 10) } : { time, wind_speed_10m: time.map(() => 10), wind_gusts_10m: time.map(() => 14), wind_direction_10m: time.map(() => dirVento) }, hourly_units: {} } });
    });
    await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(700);
    return { p, errs, ctx };
  };
  const cadastra = async (p, e) => {
    await p.click('#t-equip'); await p.click('#e-new');
    await p.fill('#e-name', e.nome); await p.fill('#e-type', e.tipo || '');
    for (const [id, v] of Object.entries({ '#e-hs': e.hs, '#e-tp': e.tp, '#e-wind': e.wind, '#e-gust': e.gust, '#e-cur': e.cur })) await p.fill(id, v === undefined ? '' : String(v));
    for (const [id, v] of Object.entries({ '#e-dfrom': e.df, '#e-dto': e.dt, '#e-wfrom': e.wf, '#e-wto': e.wt })) await p.selectOption(id, v === undefined ? '' : String(v));
    await p.click('#e-save'); await p.waitForTimeout(250);
  };
  const campos = p => p.evaluate(() => Object.fromEntries(['#q-hs', '#q-tp', '#q-wind', '#q-gust', '#q-cur', '#q-dfrom', '#q-dto', '#q-wfrom', '#q-wto'].map(s => [s, document.querySelector(s).value])));

  let { p, errs, ctx } = await abre();
  ok('aba Equipamentos existe', (await p.$$('#t-equip')).length === 1 && (await p.$$('#p-equip')).length === 1);
  await p.click('#t-equip');
  ok('lista vazia avisa', /Nenhum equipamento/.test(await p.textContent('#e-list')), await p.textContent('#e-list'));
  // validações
  await p.fill('#e-name', ''); await p.click('#e-save'); ok('sem nome avisa', /nome/i.test(await p.textContent('#e-msg')), await p.textContent('#e-msg'));
  await p.fill('#e-name', 'X'); await p.selectOption('#e-dfrom', '7'); await p.click('#e-save');
  ok('só um lado da direção do vento avisa', /dois pontos/i.test(await p.textContent('#e-msg')), await p.textContent('#e-msg'));
  await p.selectOption('#e-dfrom', ''); await p.selectOption('#e-wto', '3'); await p.click('#e-save');
  ok('só um lado da direção da onda avisa', /dois pontos/i.test(await p.textContent('#e-msg')), await p.textContent('#e-msg'));
  await p.selectOption('#e-wto', ''); await p.fill('#e-hs', '-1'); await p.click('#e-save');
  ok('limite negativo avisa', /inválido|negativ/i.test(await p.textContent('#e-msg')), await p.textContent('#e-msg'));
  ok('nada foi salvo nas tentativas inválidas', /Nenhum equipamento/.test(await p.textContent('#e-list')));

  await cadastra(p, { nome: 'Guindaste A', tipo: 'Guindaste', hs: 2, tp: 6, wind: 25, gust: 30, df: 7, dt: 9 });
  ok('salvou Guindaste A', /Guindaste A/.test(await p.textContent('#e-list')) && /Hs ≤ 2 m/.test(await p.textContent('#e-list')), await p.textContent('#e-list'));
  await cadastra(p, { nome: 'ROV B', tipo: 'ROV', hs: 1.5, tp: 8, wind: 30, cur: 1.5, df: 14, dt: 2, wf: 4, wt: 8 });
  ok('salvou ROV B', /ROV B/.test(await p.textContent('#e-list')) && /corrente ≤ 1.5 kn/.test(await p.textContent('#e-list')), await p.textContent('#e-list'));
  await cadastra(p, { nome: 'Sem limites', tipo: 'Teste' }); ok('equipamento sem limite é aceito', /Sem limites/.test(await p.textContent('#e-list')));
  // editar: clicar no item carrega no formulário
  await p.click('#e-list li:has-text("Guindaste A") button.lnk'); await p.waitForTimeout(150);
  ok('abrir para editar carrega o formulário', (await p.inputValue('#e-name')) === 'Guindaste A' && (await p.inputValue('#e-hs')) === '2' && (await p.inputValue('#e-dfrom')) === '7' && (await p.inputValue('#e-dto')) === '9');
  await p.fill('#e-hs', '2.2'); await p.click('#e-save'); await p.waitForTimeout(200);
  ok('editar atualiza sem duplicar', (await p.$$eval('#e-list li', l => l.length)) === 3 && /Hs ≤ 2.2 m/.test(await p.textContent('#e-list')), await p.textContent('#e-list'));
  await p.click('#e-list li:has-text("Guindaste A") button.lnk'); await p.fill('#e-hs', '2'); await p.click('#e-save'); await p.waitForTimeout(200);

  // ---- seleção na análise rápida ----
  await p.click('#t-analise'); await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input');
  const caixas = await p.$$eval('#q-equips input[type=checkbox]', c => c.length); ok('3 caixas de equipamentos na análise', caixas === 3, String(caixas));
  const base = await campos(p);
  await p.check('#q-equips label:has-text("Guindaste A") input');
  let f = await campos(p);
  ok('A preenche Hs, Tp, vento, rajada', f['#q-hs'] === '2' && f['#q-tp'] === '6' && f['#q-wind'] === '25' && f['#q-gust'] === '30' && f['#q-cur'] === '', JSON.stringify(f));
  ok('A preenche a direção (1 faixa) e os seletores continuam livres', f['#q-dfrom'] === '7' && f['#q-dto'] === '9' && !(await p.$eval('#q-dfrom', e => e.disabled)));
  await p.check('#q-equips label:has-text("ROV B") input');
  f = await campos(p);
  ok('A+B: Hs menor (1,5), Tp maior (8), vento menor (25), rajada só de A (30), corrente só de B (1,5)', f['#q-hs'] === '1.5' && f['#q-tp'] === '8' && f['#q-wind'] === '25' && f['#q-gust'] === '30' && f['#q-cur'] === '1.5', JSON.stringify(f));
  ok('A+B: duas faixas de vento, seletores travados e nota', (await p.$eval('#q-dfrom', e => e.disabled)) && (await p.$eval('#q-dto', e => e.disabled)) && /2 faixas/.test(await p.textContent('#q-equip-note')), await p.textContent('#q-equip-note'));
  ok('A+B: uma faixa de onda preenche os seletores', f['#q-wfrom'] === '4' && f['#q-wto'] === '8' && !(await p.$eval('#q-wfrom', e => e.disabled)));
  await p.check('#q-equips label:has-text("Sem limites") input'); f = await campos(p);
  ok('equipamento sem limites não muda o combinado', f['#q-hs'] === '1.5' && f['#q-wind'] === '25', JSON.stringify(f));
  await p.uncheck('#q-equips label:has-text("Sem limites") input');

  // digitar por cima vale; faixa de vento 180° bloqueia (A: SSE–SSO)
  await p.fill('#q-hs', '1.2');
  dirVento = 180; await p.click('#q-go'); await p.waitForFunction(() => document.querySelector('#q-msg')?.textContent.includes('Relatório gerado'), null, { timeout: 15000 });
  let rel = await p.textContent('#report');
  ok('relatório cita os equipamentos no cabeçalho', /Equipamentos:\s*Guindaste A, ROV B/.test(rel), '');
  ok('tabela de limites: Equipamentos usados', /Equipamentos usados\s*Guindaste A, ROV B/.test(rel));
  ok('tabela de limites: valor digitado por cima vale (Hs 1.2)', /Hs máxima\s*1\.2 m/.test(rel));
  ok('tabela de limites: as duas faixas de vento', /Direção do vento bloqueada\s*SSE a SSO; NO a NE/.test(rel));
  ok('vento de 180° bloqueado pela faixa do Guindaste A', /Nenhuma janela/.test(rel));
  dirVento = 350; await p.click('#q-go'); await p.waitForFunction(() => /Nenhuma janela/.test(document.querySelector('#report .verdict')?.textContent || ''), null, { timeout: 15000 });
  ok('vento de 350° bloqueado pela faixa do ROV B', true);
  dirVento = 90; await p.click('#q-go'); await p.waitForFunction(() => /janela\(s\) operacional/.test(document.querySelector('#report .verdict')?.textContent || ''), null, { timeout: 15000 });
  ok('vento de 90° passa pelas duas faixas', true);
  dirOnda = 90; await p.click('#q-go'); await p.waitForFunction(() => /Nenhuma janela/.test(document.querySelector('#report .verdict')?.textContent || ''), null, { timeout: 15000 });
  ok('onda de 90° bloqueada pela faixa de onda do ROV B (L–S)', true);
  dirOnda = 270; await p.click('#q-go'); await p.waitForFunction(() => /janela\(s\) operacional/.test(document.querySelector('#report .verdict')?.textContent || ''), null, { timeout: 15000 });
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]);
  const html = fs.readFileSync(await d.path(), 'utf8');
  ok('HTML baixado traz os equipamentos', /Equipamentos:[\s\S]{0,40}Guindaste A/.test(html) && /Equipamentos usados/.test(html));
  const [pd] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#rp-pdf')]).catch(() => [null]);
  ok('PDF gera', !!pd);
  if (pd) { const pdf = fs.readFileSync(await pd.path(), 'latin1'); ok('PDF traz os equipamentos', /Guindaste A, ROV B/.test(pdf), ''); }
  if (shots) await p.locator('#q-equip-box').screenshot({ path: path.join(shots, 'equipamentos-selecao.png') });

  // desmarcar tudo devolve os valores de antes e libera os seletores
  await p.uncheck('#q-equips label:has-text("Guindaste A") input'); await p.uncheck('#q-equips label:has-text("ROV B") input');
  f = await campos(p);
  ok('sem equipamento: campos voltam ao que eram', f['#q-hs'] === base['#q-hs'] && f['#q-wind'] === base['#q-wind'] && f['#q-tp'] === base['#q-tp'] && f['#q-dfrom'] === base['#q-dfrom'], JSON.stringify({ f, base }));
  ok('sem equipamento: seletores livres e sem nota', !(await p.$eval('#q-dfrom', e => e.disabled)) && (await p.textContent('#q-equip-note')).trim() === '');
  await p.click('#q-go'); await p.waitForFunction(() => document.querySelector('#q-msg')?.textContent.includes('Relatório gerado'), null, { timeout: 15000 });
  rel = await p.textContent('#report');
  ok('sem equipamento: o relatório não cita equipamentos', !/Equipamentos:|Equipamentos usados/.test(rel));

  // excluir equipamento marcado
  await p.check('#q-equips label:has-text("ROV B") input'); await p.check('#q-equips label:has-text("Guindaste A") input');
  await p.click('#t-equip'); await p.click('#e-list li:has-text("ROV B") button.lnk'); await p.click('#e-del'); await p.click('#e-del-yes'); await p.waitForTimeout(300);
  ok('excluiu o ROV B da lista', !/ROV B/.test(await p.textContent('#e-list')));
  await p.click('#t-analise');
  ok('caixa do ROV B sumiu', (await p.$$('#q-equips label:has-text("ROV B")')).length === 0);
  f = await campos(p); ok('seleção recalculada só com o Guindaste A', f['#q-hs'] === '2' && f['#q-wind'] === '25' && f['#q-cur'] === '', JSON.stringify(f));

  // backup
  await p.click('#t-historico');
  const [bd] = await Promise.all([p.waitForEvent('download'), p.click('#b-export')]);
  const bk = JSON.parse(fs.readFileSync(await bd.path(), 'utf8'));
  ok('backup traz os equipamentos', Array.isArray(bk.collections.equipments) && bk.collections.equipments.some(e => e.name === 'Guindaste A' && e.limits.dir_from === 7) && bk.collections.equipments.length === 2, JSON.stringify(Object.keys(bk.collections)));
  // restaurar em outro navegador limpo
  const n2 = await abre(); await n2.p.click('#t-historico');
  await n2.p.setInputFiles('#b-file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) }); await n2.p.waitForTimeout(500);
  await n2.p.click('#t-equip');
  ok('importar restaura os equipamentos', /Guindaste A/.test(await n2.p.textContent('#e-list')) && /Sem limites/.test(await n2.p.textContent('#e-list')));
  await n2.ctx.close();
  ok('sem erros de página', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  // celular escuro
  ({ p, errs, ctx } = await abre(390, 800, 'dark'));
  await cadastra(p, { nome: 'Guindaste A', tipo: 'Guindaste', hs: 2, wind: 25, df: 7, dt: 9 });
  ok('celular: aba Equipamentos sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));
  if (shots) await p.screenshot({ path: path.join(shots, 'equipamentos-celular.png') });
  await p.click('#t-analise');
  ok('celular: análise com equipamentos sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok('celular: sem erros de página', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes dos equipamentos passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
