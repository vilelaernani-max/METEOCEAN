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
      r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: m ? { time, wave_height: time.map((_, i) => 1.2 + 0.8 * Math.sin(i / 9)), wave_period: time.map(() => 8), wave_direction: time.map((_, i) => (200 + i * 2) % 360) } : { time, wind_speed_10m: time.map((_, i) => 14 + 9 * Math.sin(i / 7 + 1)), wind_gusts_10m: time.map(() => 20), wind_direction_10m: time.map((_, i) => (60 + i * 3.2) % 360) }, hourly_units: {} } });
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
  const hs = await p.$$eval('#report h2', h => h.map(x => x.textContent.trim()));
  ok('títulos das rosas no resumido', hs.includes('Rosa dos ventos') && hs.includes('Rosa de ondas'), JSON.stringify(hs));
  ok('resumido não repete os gráficos separados de vento e Hs', !hs.includes('Vento a 10 m') && !hs.includes('Altura significativa (Hs)'), JSON.stringify(hs));
  ok('rosas lado a lado no desktop', await p.evaluate(() => { const [a, b] = [...document.querySelectorAll('#report .roses > div')].map(x => x.getBoundingClientRect()); return !!a && !!b && Math.abs(a.top - b.top) < 5 && b.left > a.left; }));
  ok('janelas e limites continuam no resumido', /Janelas — cenário conservador/.test(await p.textContent('#report')) && /Limites aplicados/.test(await p.textContent('#report')));
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]);
  const html = fs.readFileSync(await d.path(), 'utf8');
  ok('HTML baixado do resumido traz o gráfico e as rosas', /class="dualchart"/.test(html) && (html.match(/Rosa dos ventos|Rosa de ondas/g) || []).length >= 2);
  const [pd] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#rp-pdf')]).catch(() => [null]);
  ok('PDF do resumido gera', !!pd);
  if (pd) { const pdf = fs.readFileSync(await pd.path(), 'latin1'); ok('PDF do resumido: gráfico e rosas', /VENTO E ONDA JUNTOS/.test(pdf) && /ROSA DOS VENTOS E ROSA DE ONDAS/.test(pdf), ''); }
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
  ok('só vento: só a rosa dos ventos', so1.length === 1 && /Rosa dos ventos/.test(so1[0]) && (await p.$$('#report .dualchart')).length === 0, JSON.stringify(so1));
  await ctx.close();

  // resumido só com ondas: só a rosa de ondas
  ({ p, errs, ctx } = await run({ modo: 'resumido', desmarca: ['#q-an-wind', '#q-an-tide', '#q-an-cur'] }));
  const so2 = await aria(p);
  ok('só ondas: só a rosa de ondas', so2.length === 1 && /Rosa de ondas/.test(so2[0]) && (await p.$$('#report .dualchart')).length === 0, JSON.stringify(so2));
  await ctx.close();

  // completo continua como antes: gráficos separados, sem o bloco .roses
  ({ p, errs, ctx } = await run({ modo: 'completo' }));
  const hc = await p.$$eval('#report h2', h => h.map(x => x.textContent.trim()));
  ok('completo mantém os gráficos separados e a seção de vento predominante', hc.includes('Vento a 10 m') && hc.includes('Altura significativa (Hs)') && hc.includes('Vento predominante'), JSON.stringify(hc));
  ok('completo não ganhou o bloco de rosas do resumido', (await p.$$('#report .roses')).length === 0);
  await ctx.close();

  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes do relatório resumido passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
