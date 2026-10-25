/* Teste do mapa da região no navegador, com Open-Meteo e tiles simulados. Rodar: node tests/map.js [pasta-de-capturas] */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const shots = process.argv[2];
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4+/wNAAVVArEcIxn+AAAAAElFTkSuQmCC', 'base64');
let modo = 'ok', chamadasGrade = 0;

function resp(u) {
  const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(130)].map((_, i) => t0 + i * 3600);
  const lats = new URL(u).searchParams.get('latitude').split(',');
  if (lats.length === 1) { // análise normal do ponto
    const h = u.includes('marine') ? { time, wave_height: time.map(() => 1.0), wave_period: time.map(() => 8), wave_direction: time.map(() => 90) }
      : { time, wind_speed_10m: time.map(() => 10), wind_gusts_10m: time.map(() => 14), wind_direction_10m: time.map(() => 120) };
    return { latitude: -22.9, longitude: -43.1, hourly: h, hourly_units: {} };
  }
  chamadasGrade++;
  return lats.map((_, i) => {
    const terra = i === 0 || i === 7; // dois pontos sobre terra
    const h = u.includes('marine') ? { time, wave_height: time.map((_, k) => terra ? null : 0.5 + (i % 7) * 0.3 + (k % 3) * 0.1) }
      : { time, wind_speed_10m: time.map(() => 8 + (i % 5) * 4), wind_direction_10m: time.map((_, k) => (i * 20 + k * 10) % 360) };
    return { latitude: -22, longitude: -43, hourly: h };
  });
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const run = async (w, h, scheme, tag) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/tile.openstreetmap.org/**', r => r.fulfill({ body: PNG, contentType: 'image/png' }));
    await p.route('**/*open-meteo.com/**', r => {
      if (modo === '429' && new URL(r.request().url()).searchParams.get('latitude').includes(',')) return r.fulfill({ status: 429, json: { error: true, reason: 'limit' } });
      if (modo === 'curta' && new URL(r.request().url()).searchParams.get('latitude').includes(',')) return r.fulfill({ json: [resp(r.request().url())[0]] });
      r.fulfill({ json: resp(r.request().url()) });
    });
    await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(700);
    await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input');
    await p.click('#q-go'); await p.waitForSelector('#report .rmwrap', { timeout: 15000 });
    return { p, errs, ctx };
  };

  // 1) fluxo normal, desktop claro
  chamadasGrade = 0; modo = 'ok';
  let { p, errs, ctx } = await run(1100, 900, 'light', 'desktop');
  ok('botão existe e nada buscado antes do clique', (await p.textContent('.rmwrap button')) === 'Ver mapa da região' && chamadasGrade === 0);
  await p.click('.rmwrap button'); await p.waitForSelector('.rmap svg g', { timeout: 15000 });
  ok('uma busca por API (2 no total)', chamadasGrade === 2, String(chamadasGrade));
  ok('49 células', (await p.$$eval('.rmap svg g', g => g.length)) === 49);
  ok('2 pontos de terra sem cor', (await p.$$eval('.rmap rect.c-none', r => r.length)) === 2);
  const antes = await p.$$eval('.rmap rect.cell', r => r.map(x => x.getAttribute('class')).join('|'));
  const setaAntes = await p.$eval('.rmap path.arr', e => e.getAttribute('transform'));
  const labAntes = await p.textContent('.rmctl .mono');
  await p.fill('#rm-hour', '30'); await p.dispatchEvent('#rm-hour', 'input');
  ok('horário atualiza o rótulo', (await p.textContent('.rmctl .mono')) !== labAntes);
  ok('seta muda de direção com o horário', (await p.$eval('.rmap path.arr', e => e.getAttribute('transform'))) !== setaAntes);
  ok('sem nova busca ao mudar o horário', chamadasGrade === 2);
  await p.click('button[aria-label="Próxima hora"]'); ok('botão próxima hora move a barra', (await p.inputValue('#rm-hour')) === '31');
  ok('legenda relativa ao limite', /70% do limite/.test(await p.textContent('.rmleg')));
  ok('cores variam (mais de uma classe)', new Set(await p.$$eval('.rmap rect.cell', r => r.map(x => x.getAttribute('class')))).size >= 2);
  ok('tooltip com vento', /vento \d+ kn de/.test(await p.$eval('.rmap svg g title', t => t.textContent)));
  ok('mapa não vai no HTML baixado', await (async () => { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]); return !/rmwrap|Mapa da região/.test(require('fs').readFileSync(await d.path(), 'utf8')); })());
  if (shots) await p.locator('.rmwrap').screenshot({ path: path.join(shots, 'mapa-desktop-claro.png') });
  ok('sem erros de página (desktop)', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  // 2) celular escuro: sem rolagem horizontal
  ({ p, errs, ctx } = await run(390, 800, 'dark', 'celular'));
  await p.click('.rmwrap button'); await p.waitForSelector('.rmap svg g', { timeout: 15000 });
  ok('sem rolagem horizontal no celular', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));
  await p.locator('.rmwrap').scrollIntoViewIfNeeded();
  if (shots) await p.locator('.rmwrap').screenshot({ path: path.join(shots, 'mapa-celular-escuro.png') });
  ok('sem erros de página (celular)', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  // 3) erro 429: mensagem, relatório intacto
  modo = '429';
  ({ p, errs, ctx } = await run(1100, 900, 'light', 'e429'));
  await p.click('.rmwrap button'); await p.waitForSelector('.rmwrap .msg.bad', { timeout: 10000 });
  ok('429 mostra mensagem clara', /limite de uso/.test(await p.textContent('.rmwrap .msg.bad')), await p.textContent('.rmwrap .msg.bad'));
  ok('relatório segue na tela', (await p.$$('#report .verdict')).length === 1);
  ok('botão volta a funcionar', !(await p.$eval('.rmwrap button', b => b.disabled)));
  await ctx.close();

  // 4) resposta incompleta
  modo = 'curta';
  ({ p, errs, ctx } = await run(1100, 900, 'light', 'curta'));
  await p.click('.rmwrap button'); await p.waitForSelector('.rmwrap .msg.bad', { timeout: 10000 });
  ok('resposta incompleta avisa', /incompleta/.test(await p.textContent('.rmwrap .msg.bad')));
  await ctx.close();

  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes do mapa passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
