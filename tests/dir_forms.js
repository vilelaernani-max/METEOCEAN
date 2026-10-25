/* Teste no navegador: formulários, análise, relatório, backup. Rodar: node tests/dir_forms.js
   Precisa do Playwright (NODE_PATH ou /opt/node22/lib/node_modules) e do Chromium. */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
let fails = 0;
const ok = (nome, cond, extra = '') => { if (!cond) { fails++; console.log('FALHOU', nome, extra); } };

function openMeteo(dir) {
  return route => {
    const u = route.request().url();
    const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(130)].map((_, i) => t0 + i * 3600);
    const h = u.includes('marine')
      ? { time, wave_height: time.map(() => 1.0), wave_period: time.map(() => 8), wave_direction: time.map(() => 90) }
      : { time, wind_speed_10m: time.map(() => 10), wind_gusts_10m: time.map(() => 14), wind_direction_10m: time.map(() => dir) };
    route.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: h, hourly_units: {} } });
  };
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await b.newContext({ acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/*open-meteo.com/**', openMeteo(180));
  await p.goto('file://' + require('path').resolve(__dirname, '../index.html')); await p.waitForTimeout(800);

  // análise rápida SEM faixa: vento de 180° não bloqueia
  await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input');
  await p.click('#q-go'); await p.waitForSelector('#report .verdict', { timeout: 15000 });
  const semFaixa = await p.textContent('#report .verdict');
  ok('sem faixa: há janela', /janela\(s\) operacional/.test(semFaixa), semFaixa);

  // só um valor: erro e não gera
  await p.selectOption('#q-dfrom', '7'); // SSE
  await p.click('#q-go'); await p.waitForTimeout(500);
  ok('só um valor avisa', /informe os dois pontos/i.test(await p.textContent('#q-msg')), await p.textContent('#q-msg'));

  // faixa SSE..SSO: vento de 180° bloqueia tudo
  await p.selectOption('#q-dto', '9'); // SSO
  await p.click('#q-go'); await p.waitForFunction(() => /Nenhuma janela/.test(document.querySelector('#report .verdict')?.textContent || ''), null, { timeout: 15000 });
  const comFaixa = await p.textContent('#report');
  ok('com faixa: nenhuma janela', /Nenhuma janela/.test(comFaixa));
  ok('limites mostram a faixa', /Direção do vento bloqueada[\s\S]{0,40}SSE a SSO/.test(comFaixa));
  // HTML baixado traz a faixa
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]);
  ok('HTML baixado traz a faixa', /SSE a SSO/.test(fs.readFileSync(await d.path(), 'utf8')));
  // PDF gera sem erro
  const [pd] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#rp-pdf')]).catch(() => [null]);
  ok('PDF gera', !!pd);

  // faixa persistida na análise rápida após recarregar
  await p.reload(); await p.waitForTimeout(800);
  ok('faixa lembrada', (await p.inputValue('#q-dfrom')) === '7' && (await p.inputValue('#q-dto')) === '9');

  // perfil: salvar com faixa, recarregar, ler
  await p.click('#t-limites'); await p.click('#p-new');
  await p.fill('#p-name', 'Perfil teste'); await p.selectOption('#p-dfrom', '14'); await p.selectOption('#p-dto', '1'); // NO..NNE
  await p.click('#p-save'); await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(800); await p.click('#t-limites');
  const opt = await p.$$eval('#p-sel option', os => os.map(o => [o.value, o.textContent]));
  const meu = opt.find(o => o[1] === 'Perfil teste'); ok('perfil salvo', !!meu);
  await p.selectOption('#p-sel', meu[0]); await p.dispatchEvent('#p-sel', 'change');
  ok('perfil carrega faixa', (await p.inputValue('#p-dfrom')) === '14' && (await p.inputValue('#p-dto')) === '1');
  // perfil só com um valor: não salva
  await p.selectOption('#p-dto', ''); await p.click('#p-save'); await p.waitForTimeout(300);
  ok('perfil com um valor avisa', /dois pontos/i.test(await p.textContent('#p-msg')), await p.textContent('#p-msg'));
  await p.selectOption('#p-dto', '1'); await p.click('#p-save'); await p.waitForTimeout(300);

  // local: salvar com faixa e abrir de novo
  await p.click('#t-locais'); await p.fill('#l-name', 'Local teste'); await p.fill('#l-lat', '-22.9'); await p.fill('#l-lon', '-43.1');
  await p.selectOption('#l-dfrom', '4'); await p.selectOption('#l-dto', '6'); // L..SE
  await p.click('#l-save'); await p.waitForTimeout(500);
  ok('local mostra limite', /sem vento de L a SE/.test(await p.textContent('#l-list')), await p.textContent('#l-list'));

  // backup preserva a faixa
  await p.click('#t-historico');
  const [bd] = await Promise.all([p.waitForEvent('download'), p.click('#b-export')]);
  const bk = JSON.parse(fs.readFileSync(await bd.path(), 'utf8'));
  ok('backup tem perfil com faixa', bk.collections.profiles.some(x => x.name === 'Perfil teste' && x.limits.dir_from === 14 && x.limits.dir_to === 1));
  ok('backup tem local com faixa', bk.collections.locations.some(x => x.name === 'Local teste' && x.limits.dir_from === 4 && x.limits.dir_to === 6));

  // perfil antigo (sem os campos novos) continua funcionando
  const velho = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('mco:profiles') || '{}'); } catch (e) { return {}; } });
  ok('há perfis salvos no armazenamento', Object.keys(velho).length >= 1);

  ok('sem erros de página', errs.length === 0, JSON.stringify(errs));
  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes de navegador passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
