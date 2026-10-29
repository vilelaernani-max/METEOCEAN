/* Teste do relatório resumido: gráfico de vento e onda + rosas. Rodar: node tests/resumido.js [pasta-de-capturas] */
const fs = require('fs');
const path = require('path');
const shots = process.argv[2];
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const run = async ({ modo, w = 1100, h = 900, scheme = 'light', desmarca = [] }) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/*open-meteo.com/**', r => {
      const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(130)].map((_, i) => t0 + i * 3600), m = r.request().url().includes('marine');
      r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: m ? { time, wave_height: time.map((_, i) => 1.2 + 0.8 * Math.sin(i / 9)), wave_period: time.map(() => 8), wave_direction: time.map((_, i) => (200 + i * 2) % 360), sea_level_height_msl: time.map((_, i) => 0.8 * Math.sin(i / 2)), ocean_current_velocity: time.map((_, i) => 1.2 + Math.sin(i / 6)), ocean_current_direction: time.map((_, i) => (30 + i * 5) % 360) } : { time, wind_speed_10m: time.map((_, i) => 14 + 9 * Math.sin(i / 7 + 1)), wind_gusts_10m: time.map(() => 20), wind_direction_10m: time.map((_, i) => (60 + i * 3.2) % 360) }, hourly_units: {} } });
    });
    await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(700);
    await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input'); await p.fill('#q-wind', '20'); await p.fill('#q-hs', '2');
    await p.check(`input[name="q-mode"][value="${modo}"]`);
    for (const id of desmarca) await p.uncheck(id);
    await p.click('#q-go'); await p.waitForSelector('#report .verdict', { timeout: 15000 });
    return { p, errs, ctx };
  };
  const aria = p => p.$$eval('#report .roses svg', s => s.map(x => x.getAttribute('aria-label')));

  // resumido, tudo ligado
  let { p, errs, ctx } = await run({ modo: 'resumido' });
  ok('resumido tem o gráfico de vento e onda juntos', (await p.$$('#report .dualchart svg')).length === 1);
  const ar = await aria(p);
  ok('resumido tem a rosa dos ventos e a rosa de ondas', ar.length === 2 && /Rosa dos ventos/.test(ar[0]) && /Rosa de ondas/.test(ar[1]), JSON.stringify(ar));
  const hs = await p.$$eval('#report h2', h => h.map(x => x.textContent.trim().replace(/\s*\?$/, '')));
  ok('títulos das rosas no resumido', hs.includes('Rosa dos ventos') && hs.includes('Rosa de ondas'), JSON.stringify(hs));
  // ---- blocos por variável no resumido ----
  const ordem = await p.$$eval('#report h2', h => h.map(x => x.textContent.trim().replace(/\s*\?$/, '')));
  const iDual = ordem.indexOf('Vento e onda juntos'), iRosa = ordem.indexOf('Rosa dos ventos'), iV = ordem.indexOf('Vento: intensidade, rajada e direção'), iO = ordem.indexOf('Onda: Hs, Tp e direção'), iC = ordem.indexOf('Corrente: velocidade e direção'), iM = ordem.indexOf('Maré: nível do mar');
  ok('ordem: gráfico combinado, rosas, vento, onda, corrente e maré', iDual >= 0 && iDual < iRosa && iRosa < iV && iV < iO && iO < iC && iC < iM, JSON.stringify(ordem));
  const bloco = i => p.evaluate(i => [...document.querySelectorAll('#report h2')][i].parentElement.innerHTML, i);
  const bV = await bloco(iV);
  ok('vento: intensidade em linha (segmentos), rajada tracejada e direção em setas', (bV.match(/class="sr"/g) || []).length > 60 && /class="sd"/.test(bV) && (bV.match(/class="sa"/g) || []).length > 20, '');
  ok('vento: limites de vento e de rajada não usados não aparecem; o limite de vento aparece', (bV.match(/class="dlim"/g) || []).length === 1 && /limite vento 20 kn/.test(bV));
  ok('vento: bússola do Norte e legenda das setas', /class="bussola"/.test(bV) && /seta[^<]*para onde o vento vai/.test(bV));
  const bO = await bloco(iO);
  ok('onda: Hs em linha, Tp em linha no eixo direito e direção em setas', (bO.match(/class="sr"/g) || []).length > 60 && /class="ss"/.test(bO) && (bO.match(/class="sa"/g) || []).length > 20 && /class="mut ax2"/.test(bO), '');
  ok('onda: limite de Hs e bússola', /limite Hs 2 m/.test(bO) && /class="bussola"/.test(bO));
  ok('onda: legenda explica a seta da onda', /seta[^<]*para onde a onda vai/.test(bO));
  const bC = await bloco(iC);
  ok('corrente: velocidade em linha e setas de direção', (bC.match(/class="sr"/g) || []).length > 60 && (bC.match(/class="sa"/g) || []).length > 20 && /Stick plot|stick|vetores/i.test(bC + ''), '');
  const bM = await bloco(iM);
  ok('maré: curva do nível do mar com preamar e baixa-mar', /Nível do mar previsto/.test(bM) && /preamar/.test(bM) && /baixa-mar/.test(bM), '');
  ok('resumido não repete os gráficos separados de vento e Hs', !hs.includes('Vento a 10 m') && !hs.includes('Altura significativa (Hs)'), JSON.stringify(hs));
  ok('rosas lado a lado no desktop', await p.evaluate(() => { const [a, b] = [...document.querySelectorAll('#report .roses > div')].map(x => x.getBoundingClientRect()); return !!a && !!b && Math.abs(a.top - b.top) < 5 && b.left > a.left; }));
  ok('janelas e limites continuam no resumido', /Janelas — cenário conservador/.test(await p.textContent('#report')) && /Limites aplicados/.test(await p.textContent('#report')));
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]);
  const html = fs.readFileSync(await d.path(), 'utf8');
  ok('HTML baixado do resumido traz o gráfico e as rosas', /class="dualchart"/.test(html) && (html.match(/Rosa dos ventos|Rosa de ondas/g) || []).length >= 2);
  const [pd] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#rp-pdf')]).catch(() => [null]);
  ok('PDF do resumido gera', !!pd);
  if (pd) { const pdf = fs.readFileSync(await pd.path(), 'latin1'); ok('PDF do resumido: gráfico e rosas', /VENTO E ONDA JUNTOS/.test(pdf) && /ROSA DOS VENTOS E ROSA DE ONDAS/.test(pdf), '');
    ok('PDF do resumido: blocos de vento e de onda com direção', /VENTO: INTENSIDADE, RAJADA E DIRE/.test(pdf) && /ONDA: HS, TP E DIRE/.test(pdf) && /A seta do vento aponta|Setas: dire/.test(pdf), '');
    ok('PDF do resumido: nota do Norte nos gráficos com setas', (pdf.match(/Norte para cima/g) || []).length >= 4, String((pdf.match(/Norte para cima/g) || []).length)); }
  if (shots) await p.locator('#report').screenshot({ path: path.join(shots, 'resumido-desktop.png') });
  ok('sem erros de página (resumido)', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  // resumido, celular escuro: rosas empilham e a página não rola de lado
  ({ p, errs, ctx } = await run({ modo: 'resumido', w: 390, h: 800, scheme: 'dark' }));
  ok('celular: sem rolagem horizontal da página', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));
  ok('celular: rosas empilhadas', await p.evaluate(() => { const [a, b] = [...document.querySelectorAll('#report .roses > div')].map(x => x.getBoundingClientRect()); return !!a && !!b && b.top > a.bottom - 2; }));
  if (shots) await p.locator('#report .roses').screenshot({ path: path.join(shots, 'resumido-celular.png') });
  ctx.close();

  // resumido só com vento: só a rosa dos ventos, sem gráfico combinado
  ({ p, errs, ctx } = await run({ modo: 'resumido', desmarca: ['#q-an-wave', '#q-an-tide', '#q-an-cur'] }));
  const so1 = await aria(p);
  { const hh = await p.$$eval('#report h2', h => h.map(x => x.textContent.trim().replace(/\s*\?$/, ''))); ok('só vento: tem o bloco de vento e não tem onda, corrente nem maré', hh.includes('Vento: intensidade, rajada e direção') && !hh.some(x => /^Onda:|^Corrente:|^Maré:/.test(x)), JSON.stringify(hh)); }
  ok('só vento: só a rosa dos ventos', so1.length === 1 && /Rosa dos ventos/.test(so1[0]) && (await p.$$('#report .dualchart')).length === 0, JSON.stringify(so1));
  await ctx.close();

  // resumido só com ondas: só a rosa de ondas
  ({ p, errs, ctx } = await run({ modo: 'resumido', desmarca: ['#q-an-wind', '#q-an-tide', '#q-an-cur'] }));
  const so2 = await aria(p);
  { const hh = await p.$$eval('#report h2', h => h.map(x => x.textContent.trim().replace(/\s*\?$/, ''))); ok('só ondas: tem o bloco de onda e não tem vento, corrente nem maré', hh.includes('Onda: Hs, Tp e direção') && !hh.some(x => /^Vento:|^Corrente:|^Maré:/.test(x)), JSON.stringify(hh)); }
  ok('só ondas: só a rosa de ondas', so2.length === 1 && /Rosa de ondas/.test(so2[0]) && (await p.$$('#report .dualchart')).length === 0, JSON.stringify(so2));
  await ctx.close();

  // completo continua como antes: gráficos separados, sem o bloco .roses
  ({ p, errs, ctx } = await run({ modo: 'completo' }));
  const hc = await p.$$eval('#report h2', h => h.map(x => x.textContent.trim().replace(/\s*\?$/, '')));
  ok('completo mantém os gráficos separados e a seção de vento predominante', hc.includes('Vento a 10 m') && hc.includes('Altura significativa (Hs)') && hc.includes('Vento predominante'), JSON.stringify(hc));
  { const html = await p.$eval('#report', e => e.innerHTML);
    ok('completo: corrente com gráficos (velocidade, direção e stick plot)', /Velocidade da corrente/.test(html) && /Stick plot/.test(html) && /Direção \(para onde vai\)/.test(html));
    ok('completo: maré com a curva prevista', /Curva de maré prevista/.test(html) && /Nível do mar previsto/.test(html)); }
  ok('completo não ganhou o bloco de rosas do resumido', (await p.$$('#report .roses')).length === 0);
  await ctx.close();

  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes do relatório resumido passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
