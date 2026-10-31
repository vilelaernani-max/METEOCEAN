/* Teste da data de início da análise. Rodar: node tests/inicio.js  (Playwright + Chromium para a parte de navegador) */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
const grab = re => { const m = src.match(re); if (!m) throw new Error('trecho não encontrado: ' + re); return m[0]; };

// ---- função pura parseStart(valor, tz, agora, dias) ----
const { parseStart } = new Function('const tt = (s, ...a) => a.length ? s.replace(/\\{(\\d+)\\}/g, (_, i) => a[+i]) : s;\n' + grab(/const HOUR = 3600;\n/) + grab(/function parseStart\([\s\S]*?\n\}\n/) + '\nreturn { parseStart };')();
const AGORA = Date.UTC(2026, 9, 25, 14, 37) / 1000;                 // 25/10/2026 14:37 UTC
const H = Math.floor(AGORA / 3600) * 3600;
ok('vazio = agora (sem erro, sem início)', JSON.stringify(parseStart('', -3, AGORA, 5)) === JSON.stringify({ startTs: null }));
let r = parseStart('2026-10-28T08:00', -3, AGORA, 5);
ok('08:00 do local (UTC−3) = 11:00 UTC', r.startTs === Date.UTC(2026, 9, 28, 11, 0) / 1000, JSON.stringify(r));
r = parseStart('2026-10-28T08:40', 0, AGORA, 5); ok('arredonda para a hora cheia', r.startTs === Date.UTC(2026, 9, 28, 8, 0) / 1000, JSON.stringify(r));
r = parseStart('2026-10-28T08:00', 5.5, AGORA, 2); ok('fuso fracionado (UTC+5,5): 02:30 UTC cai na hora cheia 02:00', r.startTs === Date.UTC(2026, 9, 28, 2, 0) / 1000, JSON.stringify(r));
r = parseStart('2026-10-25T11:00', -3, AGORA, 5); ok('início 14:00 UTC (hora cheia atual) é aceito', r.startTs === H, JSON.stringify(r));
r = parseStart('2026-10-25T10:00', -3, AGORA, 5); ok('início no passado dá erro', /a partir de agora/.test(r.error || ''), JSON.stringify(r));
r = parseStart('lixo', -3, AGORA, 5); ok('valor inválido dá erro', typeof r.error === 'string');
r = parseStart('2026-11-05T15:00', 0, AGORA, 10); ok('total acima de 16 dias é recusado e diz o máximo', /no máximo \d+ dia/.test(r.error || ''), JSON.stringify(r));
r = parseStart('2026-11-05T14:00', 0, AGORA, 5);          // começa em 11 dias, +5 = 16 dias exatos
ok('exatamente 16 dias é aceito', !!r.startTs && !r.error, JSON.stringify(r));
r = parseStart('2026-11-11T14:00', 0, AGORA, 1); ok('início depois de 16 dias dá erro sem número', /passa do limite de 16 dias/.test(r.error || ''), JSON.stringify(r));
r = parseStart('2026-11-01T00:00', 0, AGORA, 3); ok('informa quantos dias à frente começa', Math.abs(r.aheadDays - 6.4) < 0.05, JSON.stringify(r));

// ---- navegador, com a Open-Meteo simulada ----
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await b.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  let pedidos = [];
  await p.route('**/*open-meteo.com/**', r => {
    const u = new URL(r.request().url()); if (/static\/meta\.json/.test(u.pathname)) return r.fulfill({ json: {} });   // rodada do modelo: fora deste teste
    pedidos.push(u.searchParams.get('forecast_days'));
    const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(16 * 24 + 24)].map((_, i) => t0 + i * 3600), marine = u.pathname.includes('marine');
    const h = marine ? { time, wave_height: time.map(() => 1), wave_period: time.map(() => 8), wave_direction: time.map(() => 90) } : { time, wind_speed_10m: time.map(() => 10), wind_gusts_10m: time.map(() => 14), wind_direction_10m: time.map(() => 120) };
    r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: h, hourly_units: {} } });
  });
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(800);
  await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input');

  // sem início: igual a hoje
  await p.click('#q-go'); await p.waitForSelector('#report .verdict', { timeout: 15000 });
  const hoje = await p.textContent('#report .meta, #report .hdr'); // cabeçalho com o período
  ok('sem início: pede dias+1', pedidos.every(x => x === '6'), pedidos.join(','));

  // início em 3 dias, 2 dias de duração
  pedidos = [];
  const fut = new Date(Date.now() + 3 * 86400000 - 3 * 3600000); // 3 dias à frente, em hora local do navegador
  const pad = n => String(n).padStart(2, '0');
  const val = `${fut.getFullYear()}-${pad(fut.getMonth() + 1)}-${pad(fut.getDate())}T${pad(fut.getHours())}:00`;
  await p.fill('#q-days', '2'); await p.fill('#q-start', val);
  await p.click('#q-go'); await p.waitForFunction(() => document.querySelector('#q-msg')?.textContent.includes('Relatório gerado'), null, { timeout: 15000 });
  ok('início futuro pede dias suficientes (cobre início + duração)', pedidos.length >= 2 && pedidos.every(x => Number(x) >= 5 && Number(x) <= 16), pedidos.join(','));
  const grade = await p.evaluate(() => { const t = document.querySelector('#report').textContent; return t; });
  ok('relatório gerado com 48 h (2 dias)', /Período/.test(grade));
  ok('sem alerta de longo prazo com 3 dias', !/perde confiança|confiança bem menor/.test(grade));

  // início no passado
  await p.fill('#q-start', '2020-01-01T00:00'); await p.click('#q-go'); await p.waitForTimeout(400);
  ok('passado: erro claro', /a partir de agora/.test(await p.textContent('#q-msg')), await p.textContent('#q-msg'));

  // total acima de 16 dias
  const longe = new Date(Date.now() + 12 * 86400000); const v2 = `${longe.getFullYear()}-${pad(longe.getMonth() + 1)}-${pad(longe.getDate())}T12:00`;
  await p.fill('#q-start', v2); await p.fill('#q-days', '10'); await p.click('#q-go'); await p.waitForTimeout(400);
  ok('acima de 16 dias: avisa o máximo', /no máximo \d+ dia/.test(await p.textContent('#q-msg')), await p.textContent('#q-msg'));

  // início a mais de 7 dias: alerta de confiança
  await p.fill('#q-days', '3'); await p.click('#q-go'); await p.waitForFunction(() => document.querySelector('#q-msg')?.textContent.includes('Relatório gerado'), null, { timeout: 15000 });
  ok('início a >7 dias mostra alerta de confiança', /confiança bem menor/.test(await p.textContent('#report')));
  ok('o campo de início não é lembrado após recarregar', await (async () => { await p.reload(); await p.waitForTimeout(600); return (await p.inputValue('#q-start')) === ''; })());
  ok('sem erros de página', errs.length === 0, JSON.stringify(errs));
  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes de início passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
