/* Teste da aba Ajuda e dos pontos "?". Rodar: node tests/ajuda.js [pasta-de-capturas] */
const fs = require('fs');
const path = require('path');
const shots = process.argv[2];
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const SECOES = ['aj-gerar', 'aj-limites', 'aj-equip', 'aj-direcao', 'aj-relatorio', 'aj-grafico', 'aj-mapa', 'aj-avisos', 'aj-backup', 'aj-contato'];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const abre = async (w, h, scheme) => {
    const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: w, height: h }, colorScheme: scheme });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/*open-meteo.com/**', r => {
      const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(130)].map((_, i) => t0 + i * 3600), m = r.request().url().includes('marine');
      r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: m ? { time, wave_height: time.map(() => 1), wave_period: time.map(() => 9), wave_direction: time.map(() => 270) } : { time, wind_speed_10m: time.map(() => 10), wind_gusts_10m: time.map(() => 14), wind_direction_10m: time.map(() => 120) }, hourly_units: {} } });
    });
    await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(700);
    return { p, errs, ctx };
  };
  let { p, errs, ctx } = await abre(1100, 900, 'light');
  ok('aba Ajuda existe', (await p.$$('#t-ajuda')).length === 1 && (await p.$$('#p-ajuda')).length === 1);
  await p.click('#t-ajuda');
  ok('painel da Ajuda visível', await p.$eval('#p-ajuda', e => !e.hidden));
  for (const id of SECOES) {
    const r = await p.evaluate(id => { const d = document.getElementById(id); if (!d) return null; return { tag: d.tagName, resumo: (d.querySelector('summary') || {}).textContent || '', texto: d.textContent.trim().length }; }, id);
    ok(`seção ${id} existe como <details> com título e texto`, r && r.tag === 'DETAILS' && r.resumo.trim().length > 5 && r.texto > 120, JSON.stringify(r));
  }
  const tudo = await p.textContent('#p-ajuda');
  ok('Ajuda cita os assuntos principais', ['equipamento', 'direção', 'resumido', 'completo', 'seta', 'Norte', 'backup', 'Marinha', 'Hs', 'janela'].every(w => new RegExp(w, 'i').test(tudo)), '');
  ok('Ajuda traz o Desenvolvido por e os contatos', /Desenvolvido por\s+Ernani Vilela/.test(tudo) && /vilelaernani@gmail\.com/.test(tudo) && /\(35\) 99159-5388/.test(tudo));
  ok('Ajuda não tem texto de teste nem lorem', !/lorem ipsum|\bTODO\b|xxx/.test(tudo));

  // pontos "?" e para onde levam
  const alvos = [['#t-equip', '#p-equip .help', 'aj-equip'], ['#t-analise', '#q-equip-box .help', 'aj-equip'], ['#t-analise', '#p-analise fieldset.fs:has(input[name="q-mode"]) .help', 'aj-relatorio'],
    ['#t-analise', '#p-analise .dirpair .help >> nth=0', 'aj-direcao'], ['#t-equip', '#p-equip .dirpair .help >> nth=0', 'aj-direcao'], ['#t-limites', '#p-limites .help >> nth=0', 'aj-limites'],
    ['#t-avisos', '#p-avisos .help', 'aj-avisos'], ['#t-historico', '#p-historico .help', 'aj-backup']];
  for (const [aba, sel, alvo] of alvos) {
    await p.click(aba);
    const n = await p.locator(sel).count();
    ok(`há "?" em ${sel}`, n >= 1, String(n));
    if (!n) continue;
    const bt = p.locator(sel).first();
    ok(`"?" tem texto de ajuda para leitor de tela (${alvo})`, /^Ajuda/.test(await bt.getAttribute('aria-label') || ''), await bt.getAttribute('aria-label'));
    await bt.click(); await p.waitForTimeout(150);
    ok(`"?" abre a Ajuda em ${alvo}`, await p.$eval('#p-ajuda', e => !e.hidden) && await p.$eval('#' + alvo, d => d.open) && await p.$eval('#' + alvo, d => { const r = d.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), alvo);
    ok('botão Voltar leva de volta à aba de origem', await (async () => { await p.click('#aj-voltar'); await p.waitForTimeout(100); return await p.$eval('#p-' + aba.slice(3), e => !e.hidden); })(), aba);
  }

  // "?" no gráfico combinado e no mapa (relatório na tela), e não vai no HTML baixado
  await p.click('#t-analise'); await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input'); await p.click('#q-go'); await p.waitForSelector('#report .dualchart svg', { timeout: 15000 });
  const hg = p.locator('#report h2:has-text("Vento e onda juntos") .help');
  ok('"?" ao lado do gráfico combinado', (await hg.count()) === 1);
  await hg.click(); await p.waitForTimeout(150);
  ok('"?" do gráfico abre "Como ler os gráficos"', await p.$eval('#aj-grafico', d => d.open) && await p.$eval('#p-ajuda', e => !e.hidden));
  await p.click('#aj-voltar'); await p.waitForTimeout(100);
  ok('o relatório continua na tela depois de voltar', (await p.$$('#report .dualchart svg')).length === 1);
  ok('"?" no mapa da região', (await p.$$('#report .rmwrap h2 .help')).length === 1);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]);
  ok('relatório baixado não leva os botões de ajuda', !/class="help"/.test(fs.readFileSync(await dl.path(), 'utf8')));
  if (shots) { await p.click('#t-ajuda'); await p.screenshot({ path: path.join(shots, 'ajuda-desktop.png') }); }
  ok('sem erros de página (desktop)', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  // celular escuro
  ({ p, errs, ctx } = await abre(390, 800, 'dark'));
  await p.click('#t-ajuda'); await p.waitForTimeout(150);
  for (const id of SECOES) await p.evaluate(id => { document.getElementById(id).open = true; }, id);
  ok('celular: Ajuda sem rolagem lateral (tudo aberto)', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));
  if (shots) await p.screenshot({ path: path.join(shots, 'ajuda-celular.png') });
  ok('celular: sem erros de página', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes da ajuda passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
