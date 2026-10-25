/* Teste do botão "Testar fontes", com Open-Meteo simulada. Rodar: node tests/fontes.js */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const vistos = [];
  await p.route('**/*open-meteo.com/**', r => {
    const u = new URL(r.request().url()), models = u.searchParams.get('models') || '', marine = u.pathname.includes('marine');
    vistos.push((marine ? 'onda:' : 'vento:') + models + '@' + u.searchParams.get('latitude'));
    const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(48)].map((_, i) => t0 + i * 3600);
    if (models === 'ncep_gfswave025') return r.fulfill({ status: 400, json: { error: true, reason: 'Cannot initialize SeaOnlyVariable from invalid String value ncep_gfswave025' } });
    if (marine) {
      const nulos = models === 'ecmwf_wam025';
      return r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: { time, wave_height: time.map(() => nulos ? null : 1) } } });
    }
    r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: { time, wind_speed_10m: time.map(() => 10) } } });
  });
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(700);
  await p.click('#adv > summary');
  await p.fill('#q-coords', '-10.5, -40.5'); await p.dispatchEvent('#q-coords', 'input');
  await p.click('#src-test'); await p.waitForFunction(() => document.querySelectorAll('#src-test-out li').length === 3, null, { timeout: 15000 });
  const li = await p.$$eval('#src-test-out li', l => l.map(x => x.textContent));
  ok('fonte 1 ok (melhor modelo)', /✓ vento[\s\S]*✓ onda/.test(li[0]) && /horas com dado/.test(li[0]), li[0]);
  ok('fonte 2: modelo de onda inválido mostra o motivo', /✗ onda \(ncep_gfswave025\)[^]*Cannot initialize/.test(li[1]) && /✓ vento/.test(li[1]), li[1]);
  ok('fonte 3: onda sem valores', /✗ onda \(ecmwf_wam025\)[^]*nenhum valor/.test(li[2]) && /✓ vento/.test(li[2]), li[2]);
  const msg = await p.textContent('#src-test-msg');
  ok('resumo conta 2 com problema', /2 de 3 fonte\(s\) com problema/.test(msg), msg);
  ok('usou o ponto digitado', vistos.every(v => v.endsWith('@-10.5000')), vistos.join(', '));
  ok('botão volta a habilitar', !(await p.$eval('#src-test', e => e.disabled)));
  // sem problemas: remove as fontes ruins e testa de novo
  await p.evaluate(() => { document.querySelector('#src-reset').click(); });
  await p.fill('#src-body tr:nth-child(2) input >> nth=1', ''); await p.fill('#src-body tr:nth-child(2) input >> nth=2', '');
  await p.fill('#src-body tr:nth-child(3) input >> nth=1', ''); await p.fill('#src-body tr:nth-child(3) input >> nth=2', '');
  await p.click('#src-test'); await p.waitForFunction(() => /responderam com dados/.test(document.querySelector('#src-test-msg').textContent), null, { timeout: 15000 });
  ok('tudo ok mostra mensagem verde', await p.$eval('#src-test-msg', e => e.classList.contains('ok')));
  ok('sem erros de página', errs.length === 0, JSON.stringify(errs));
  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes das fontes passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
