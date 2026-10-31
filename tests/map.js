/* Teste do mapa da região no navegador, com Open-Meteo e tiles simulados. Rodar: node tests/map.js [pasta-de-capturas] */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const shots = process.argv[2];
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4+/wNAAVVArEcIxn+AAAAAElFTkSuQmCC', 'base64');
let modo = 'ok', chamadasGrade = 0, ultimasLats = [];

function resp(u) {
  const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(130)].map((_, i) => t0 + i * 3600);
  const lats = new URL(u).searchParams.get('latitude').split(',');
  if (lats.length === 1) { // análise normal do ponto
    const h = u.includes('marine') ? { time, wave_height: time.map(() => 1.0), wave_period: time.map(() => 8), wave_direction: time.map(() => 90) }
      : { time, wind_speed_10m: time.map(() => 10), wind_gusts_10m: time.map(() => 14), wind_direction_10m: time.map(() => 120) };
    return { latitude: -22.9, longitude: -43.1, hourly: h, hourly_units: {} };
  }
  chamadasGrade++; ultimasLats = lats.map(Number);
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
    const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: w, height: h }, colorScheme: scheme });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/tile.openstreetmap.org/**', r => r.fulfill({ body: PNG, contentType: 'image/png' }));
    await p.route('**/*open-meteo.com/**', r => {
      if (/static\/meta\.json/.test(r.request().url())) return r.fulfill({ json: {} });   // rodada do modelo: não é o assunto deste teste
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
  ok('botão existe e nada buscado antes do clique', (await p.textContent('.rmwrap button.primary')) === 'Ver mapa da região' && chamadasGrade === 0);
  await p.click('.rmwrap button.primary'); await p.waitForSelector('.rmap svg g', { timeout: 15000 });
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
  ok('painel já mostra a célula central', /Célula selecionada[\s\S]*Vento: \d+ nós vindo de/.test(await p.textContent('#rm-info')), await p.textContent('#rm-info'));
  const cels = await p.$$('.rmap svg g');
  await cels[10].dispatchEvent('pointerdown', { pointerType: 'touch' });
  const apos = await p.textContent('#rm-info');
  ok('toque numa célula atualiza o painel e destaca', (await p.$$eval('.rmap rect.sel', r => r.length)) === 1 && !/\(-22\.9\d°, -43\.1\d°\)/.test(apos.slice(0, 40)), apos);
  const antesH = await p.textContent('#rm-info'); await p.fill('#rm-hour', '60'); await p.dispatchEvent('#rm-hour', 'input');
  ok('seleção continua ao mudar o horário e os dados mudam', (await p.$$eval('.rmap rect.sel', r => r.length)) === 1 && (await p.textContent('#rm-info')) !== antesH);
  await (await p.$$('.rmap svg g'))[20].dispatchEvent('pointermove', { pointerType: 'mouse' });
  const k20 = await p.$$eval('.rmap svg g', gs => gs.findIndex(g => g.querySelector('rect.sel')));
  ok('mouse passando seleciona a célula', k20 === 20, String(k20));
  await (await p.$$('.rmap svg g'))[30].dispatchEvent('pointermove', { pointerType: 'touch' });
  ok('movimento de toque não troca a seleção', (await p.$$eval('.rmap svg g', gs => gs.findIndex(g => g.querySelector('rect.sel')))) === 20);
  // ---- tamanho da região ----
  const passoKm = () => Math.abs(ultimasLats[0] - ultimasLats[7]) * 111.32;   // passo norte-sul entre pontos vizinhos
  ok('padrão 300 km: passo ~50 km', Math.abs(passoKm() - 50) < 0.5, String(passoKm()));
  ok('seletor tem 100, 200 e 300 km com 300 marcado', JSON.stringify(await p.$$eval('#rm-size option', o => o.map(x => x.value + (x.selected ? '*' : '')))) === '["100","200","300*"]');
  ok('texto informa 300 km', /Região de 300 km/.test(await p.textContent('.rmwrap')));
  await (await p.$$('.rmap svg g'))[10].dispatchEvent('pointerdown', { pointerType: 'touch' });
  await p.fill('#rm-hour', '12'); await p.dispatchEvent('#rm-hour', 'input');
  const antesBusca = chamadasGrade;
  await p.selectOption('#rm-size', '100'); await p.waitForFunction(n => /Região de 100 km/.test(document.querySelector('.rmwrap').textContent), null, { timeout: 10000 });
  ok('mudar o tamanho faz nova busca (2 requisições)', chamadasGrade === antesBusca + 2, `${antesBusca} -> ${chamadasGrade}`);
  ok('com 100 km o passo cai para ~17 km e a grade segue com 49 pontos', Math.abs(passoKm() - 100 / 6) < 0.3 && ultimasLats.length === 49, String(passoKm()));
  ok('célula e horário mantidos', (await p.$$eval('.rmap svg g', gs => gs.findIndex(g => g.querySelector('rect.sel')))) === 10 && (await p.inputValue('#rm-hour')) === '12');
  await p.selectOption('#rm-size', '200'); await p.waitForFunction(() => /Região de 200 km/.test(document.querySelector('.rmwrap').textContent), null, { timeout: 10000 });
  ok('200 km: passo ~33 km', Math.abs(passoKm() - 200 / 6) < 0.3, String(passoKm()));
  // ---- reproduzir ----
  const total = +(await p.getAttribute('#rm-hour', 'max'));
  await p.fill('#rm-hour', '0'); await p.dispatchEvent('#rm-hour', 'input');
  ok('não começa sozinho', (await p.textContent('#rm-play')) === 'Reproduzir');
  await p.click('#rm-play'); ok('vira Pausar', (await p.textContent('#rm-play')) === 'Pausar');
  await p.waitForTimeout(1300);
  const andou = +(await p.inputValue('#rm-hour')); ok('avança 1 h a cada 0,5 s (2 a 3 horas em 1,3 s)', andou >= 2 && andou <= 3, String(andou));
  ok('as cores/horário mudam junto', /\d{2}:\d{2}/.test(await p.textContent('.rmctl .mono')));
  await p.click('#rm-play'); const parou = +(await p.inputValue('#rm-hour')); await p.waitForTimeout(900);
  ok('pausar para a animação', +(await p.inputValue('#rm-hour')) === parou && (await p.textContent('#rm-play')) === 'Reproduzir');
  await p.fill('#rm-hour', String(total - 2)); await p.dispatchEvent('#rm-hour', 'input');
  await p.click('#rm-play'); await p.waitForFunction(() => document.querySelector('#rm-play').textContent === 'Reproduzir', null, { timeout: 5000 });
  ok('chegar ao fim para sozinho', +(await p.inputValue('#rm-hour')) === total);
  await p.click('#rm-play'); await p.waitForTimeout(700);
  ok('no fim, reproduzir recomeça do início', +(await p.inputValue('#rm-hour')) < total && (await p.textContent('#rm-play')) === 'Pausar');
  await p.selectOption('#rm-size', '300'); await p.waitForFunction(() => /Região de 300 km/.test(document.querySelector('.rmwrap').textContent), null, { timeout: 10000 });
  ok('nova busca para a animação', (await p.textContent('#rm-play')) === 'Reproduzir');
  ok('mapa não vai no HTML baixado', await (async () => { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]); return !/rmwrap|Mapa da região/.test(require('fs').readFileSync(await d.path(), 'utf8')); })());
  if (shots) await p.locator('.rmwrap').screenshot({ path: path.join(shots, 'mapa-desktop-claro.png') });
  ok('sem erros de página (desktop)', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  // 2) celular escuro: sem rolagem horizontal
  ({ p, errs, ctx } = await run(390, 800, 'dark', 'celular'));
  await p.click('.rmwrap button.primary'); await p.waitForSelector('.rmap svg g', { timeout: 15000 });
  ok('sem rolagem horizontal no celular', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));
  await p.locator('.rmwrap').scrollIntoViewIfNeeded();
  if (shots) await p.locator('.rmwrap').screenshot({ path: path.join(shots, 'mapa-celular-escuro.png') });
  ok('sem erros de página (celular)', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  // 3) erro 429: mensagem, relatório intacto
  modo = '429';
  ({ p, errs, ctx } = await run(1100, 900, 'light', 'e429'));
  await p.click('.rmwrap button.primary'); await p.waitForSelector('.rmwrap .msg.bad', { timeout: 10000 });
  ok('429 mostra mensagem clara', /limite de uso/.test(await p.textContent('.rmwrap .msg.bad')), await p.textContent('.rmwrap .msg.bad'));
  ok('relatório segue na tela', (await p.$$('#report .verdict')).length === 1);
  ok('botão volta a funcionar', !(await p.$eval('.rmwrap button.primary', b => b.disabled)));
  await ctx.close();

  // 4) resposta incompleta
  modo = 'curta';
  ({ p, errs, ctx } = await run(1100, 900, 'light', 'curta'));
  await p.click('.rmwrap button.primary'); await p.waitForSelector('.rmwrap .msg.bad', { timeout: 10000 });
  ok('resposta incompleta avisa', /incompleta/.test(await p.textContent('.rmwrap .msg.bad')));
  await ctx.close();

  // zoom da roda: 12 giros seguidos valem um nível só; depois de uma pausa, outro nível
  { const ctx3 = await b.newContext({ locale: 'pt-BR', viewport: { width: 900, height: 800 } }); const p3 = await ctx3.newPage();
    await p3.route('**/tile.openstreetmap.org/**', r => r.fulfill({ body: PNG, contentType: 'image/png' }));
    await p3.goto('file://' + path.resolve(__dirname, '../index.html')); await p3.waitForTimeout(700);
    const zoomAtual = () => p3.$eval('#map .map-tiles img', i => +i.dataset.k.split('/')[0]);
    const z0 = await zoomAtual(), box = await p3.locator('#map').boundingBox();
    await p3.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 12; i++) await p3.mouse.wheel(0, -100);
    await p3.waitForTimeout(100);
    ok('roda: muitos giros seguidos dão só um nível de zoom', (await zoomAtual()) === z0 + 1, `${z0} → ${await zoomAtual()}`);
    await p3.waitForTimeout(850); await p3.mouse.wheel(0, -100); await p3.waitForTimeout(100);
    ok('roda: depois de uma pausa vem o próximo nível', (await zoomAtual()) === z0 + 2, String(await zoomAtual()));
    await p3.waitForTimeout(850); await p3.mouse.wheel(0, 100); await p3.waitForTimeout(100);
    ok('roda: giro para o outro lado afasta', (await zoomAtual()) === z0 + 1, String(await zoomAtual()));
    await ctx3.close(); }
  // pinça com dois dedos no celular: afastar aproxima um nível por vez, juntar afasta; soltar depois da pinça não marca ponto
  { const ctx5 = await b.newContext({ locale: 'pt-BR', viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true }); const p5 = await ctx5.newPage();
    await p5.route('**/tile.openstreetmap.org/**', r => r.fulfill({ body: PNG, contentType: 'image/png' }));
    await p5.goto('file://' + path.resolve(__dirname, '../index.html')); await p5.waitForTimeout(700);
    const zoomAtual = () => p5.$eval('#map .map-tiles img', i => +i.dataset.k.split('/')[0]);
    const z0 = await zoomAtual();
    const pinca = (d0, d1, passos = 8) => p5.evaluate(([d0, d1, passos]) => {
      const m = document.getElementById('map'), r = m.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ev = (type, id, x, y) => m.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
      ev('pointerdown', 1, cx - d0 / 2, cy); ev('pointerdown', 2, cx + d0 / 2, cy);
      for (let i = 1; i <= passos; i++) { const d = d0 + (d1 - d0) * i / passos; ev('pointermove', 1, cx - d / 2, cy); ev('pointermove', 2, cx + d / 2, cy); }
      ev('pointerup', 1, cx - d1 / 2, cy); ev('pointerup', 2, cx + d1 / 2, cy);
    }, [d0, d1, passos]);
    await pinca(80, 160); await p5.waitForTimeout(100);
    ok('pinça abrindo 2× aproxima um nível', (await zoomAtual()) === z0 + 1, `${z0} → ${await zoomAtual()}`);
    ok('soltar depois da pinça não marca ponto', await p5.$eval('#map .map-pin', e => e.hidden) && (await p5.inputValue('#q-coords')) === '');
    await pinca(60, 240); await p5.waitForTimeout(100);
    ok('pinça abrindo 4× aproxima dois níveis', (await zoomAtual()) === z0 + 3, String(await zoomAtual()));
    await pinca(200, 100); await p5.waitForTimeout(100);
    ok('pinça fechando afasta um nível', (await zoomAtual()) === z0 + 2, String(await zoomAtual()));
    // um dedo continua marcando o ponto
    await p5.evaluate(() => { const m = document.getElementById('map'), r = m.getBoundingClientRect(), ev = (t, x, y) => m.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true })); ev('pointerdown', r.left + 100, r.top + 100); ev('pointerup', r.left + 100, r.top + 100); });
    ok('toque com um dedo marca o ponto', !(await p5.$eval('#map .map-pin', e => e.hidden)) && /-?\d+\.\d+, -?\d+\.\d+/.test(await p5.inputValue('#q-coords')), await p5.inputValue('#q-coords'));
    await ctx5.close(); }
  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes do mapa passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
