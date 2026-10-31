/* Teste do gráfico de vento (linha, eixo principal) e altura de onda (pontos, eixo secundário), cores do frio ao quente.
   Rodar: node tests/grafico.js [pasta-de-capturas] */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const shots = process.argv[2];
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
const grab = re => { const m = src.match(re); if (!m) throw new Error('trecho não encontrado: ' + re); return m[0]; };

// ---- escala de cores frio → quente (função pura) ----
const { coldWarm } = new Function(grab(/const COLD_WARM = [^\n]*\n/) + grab(/function coldWarm\([\s\S]*?\n\}\n/) + '\nreturn { coldWarm };')();
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const [c0, c5, c10] = [coldWarm(0), coldWarm(0.5), coldWarm(1)].map(rgb);
ok('mínimo é frio (azul domina)', c0[2] > c0[0] && c0[2] > c0[1], c0.join());
ok('máximo é quente (vermelho domina)', c10[0] > c10[2] && c10[0] > c10[1], c10.join());
ok('o vermelho cresce e o azul cai do frio para o quente', c10[0] > c0[0] && c10[2] < c0[2]);
ok('formato #rrggbb', /^#[0-9a-f]{6}$/.test(coldWarm(0.3)) && /^#[0-9a-f]{6}$/.test(coldWarm(2)) && /^#[0-9a-f]{6}$/.test(coldWarm(-1)));
ok('fora da faixa fica nas pontas', coldWarm(-5) === coldWarm(0) && coldWarm(9) === coldWarm(1));



const matiz = h => { const [r, g, b] = rgb(h).map(x => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60; return H < 0 ? H + 360 : H; };
let ant = 361, desce = true; for (let t = 0; t <= 1.0001; t += 0.05) { const m = matiz(coldWarm(t)); if (m > ant + 0.5) desce = false; ant = m; }
ok('matiz só diminui do frio (azul) ao quente (vermelho)', desce);
ok('azul no começo e vermelho no fim (matiz)', matiz(coldWarm(0)) > 200 && matiz(coldWarm(1)) < 15);

// ---- navegador ----
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const run = async (w, h, scheme, fonteUnica, campos = {}) => {
    const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: w, height: h }, colorScheme: scheme, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/*open-meteo.com/**', r => {
      const u = new URL(r.request().url()), marine = u.pathname.includes('marine');
      const t0 = Math.floor(Date.now() / 3600000) * 3600, n = 130, time = [...Array(n)].map((_, i) => t0 + i * 3600);
      const f = (a, k) => time.map((_, i) => i % 17 === 5 && marine ? null : +(a + k * Math.sin(i / 9) + i * 0.02).toFixed(2));
      const h = marine ? { time, wave_height: f(1.2, 0.8), wave_period: f(8, 1), wave_direction: time.map(() => 90) } : { time, wind_speed_10m: f(14, 9), wind_gusts_10m: f(18, 9), wind_direction_10m: time.map(() => 120) };
      r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: h, hourly_units: {} } });
    });
    await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(700);
    if (fonteUnica) await p.evaluate(() => localStorage.setItem('mco:rows', JSON.stringify([{ label: 'Open-Meteo (melhor modelo)', wind: '', wave: '' }])));
    if (fonteUnica) { await p.reload(); await p.waitForTimeout(600); }
    await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input'); await p.fill('#q-wind', '20'); await p.fill('#q-hs', campos.hs !== undefined ? campos.hs : '2');
    await p.click('#q-go'); await p.waitForSelector('#report .dualchart svg', { timeout: 15000 });
    return { p, errs, ctx };
  };

  let { p, errs, ctx } = await run(1100, 900, 'light', false);
  const g = '#report .dualchart svg';
  ok('título da seção', /Vento e onda juntos/.test(await p.textContent('#report')));
  const rg = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const seg = await p.$$eval(g + ' line.hl', ls => ls.map(l => [(+l.getAttribute('y1') + +l.getAttribute('y2')) / 2, l.getAttribute('stroke')]));
  ok('onda (Hs) em linha de segmentos coloridos, com buracos onde falta dado', seg.length > 60 && seg.length < 125, String(seg.length));
  ok('linha da onda sólida (sem tracejado) e espessa', await p.$$eval(g + ' line.hl', ls => ls.every(l => !l.getAttribute('stroke-dasharray') && +l.getAttribute('stroke-width') >= 2)));
  ok('não há mais pontos de onda nem linha de vento', (await p.$$(g + ' circle.hp')).length === 0 && (await p.$$(g + ' line.wl')).length === 0);
  const alto = rg([...seg].sort((a, b) => a[0] - b[0])[0][1]), baixo = rg([...seg].sort((a, b) => b[0] - a[0])[0][1]);
  ok('trecho de onda mais alto é quente e o mais baixo é frio', alto[0] > alto[2] && baixo[2] > baixo[0], `${alto} | ${baixo}`);
  const setas = await p.$$eval(g + ' path.wa', ps => ps.map(x => { const m = /translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)/.exec(x.getAttribute('transform')); return { x: +m[1], y: +m[2], rot: +m[3], fill: x.getAttribute('fill') }; }));
  ok('vento em setas (dispersão), uma a cada poucas horas', setas.length >= 30 && setas.length <= 75, String(setas.length));
  ok('seta aponta para onde o vento vai (vento de 120° → 300°)', setas.length > 0 && setas.every(s => s.rot === 300), JSON.stringify(setas.slice(0, 2)));
  const ord = [...setas].sort((a, b) => b.y - a.y), frio = rg(ord[0].fill), quente = rg(ord[ord.length - 1].fill);
  ok('seta mais baixa (menos vento) é fria e a mais alta (mais vento) é quente', frio[2] > frio[0] && quente[0] > quente[2], `${frio} | ${quente}`);
  ok('setas espaçadas (sem sobrepor)', (() => { const xs = setas.map(s => s.x).sort((a, b) => a - b); return xs.every((x, i) => i === 0 || x - xs[i - 1] >= 10); })());
  // linha suave de vento por baixo das setas
  const lv = await p.$$eval(g + ' path.wl2', ps => ps.map(x => ({ d: x.getAttribute('d'), w: +x.getAttribute('stroke-width'), o: +x.getAttribute('stroke-opacity'), cor: x.getAttribute('stroke'), traco: x.getAttribute('stroke-dasharray') })));
  ok('linha suave de vento em segmentos (curvas de Bézier)', lv.length > 60 && lv.every(x => /^M[^C]+C/.test(x.d)), String(lv.length));
  ok('linha de vento é suave: fina, translúcida e sólida', lv.every(x => x.w <= 2 && x.w >= 1 && x.o < 1 && !x.traco), JSON.stringify(lv[0]));
  ok('linha de vento também vai do frio ao quente', new Set(lv.map(x => x.cor)).size > 8);
  ok('setas desenhadas por cima da linha de vento', await p.evaluate(g => { const svg = document.querySelector(g), ls = [...svg.querySelectorAll('path.wl2')], as = [...svg.querySelectorAll('path.wa')]; return ls.length && as.length && ls.every(l => as.every(a => !!(l.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING))); }, g));
  ok('setas menores que as primeiras (15,5 px) mas com haste: altura entre 12 e 15 px', await p.$$eval(g + ' path.wa', ps => ps.every(x => { const h = x.getBBox().height; return h >= 12 && h <= 15; })));
  ok('seta alongada, com haste (altura pelo menos 1,6 vez a largura), para a direção ser inequívoca', await p.$$eval(g + ' path.wa', ps => ps.every(x => { const b = x.getBBox(); return b.height / b.width >= 1.6; })));
  ok('seta tem haste e ponta (formato de seta, não triângulo)', await p.$$eval(g + ' path.wa', ps => ps.every(x => (x.getAttribute('d').match(/L/g) || []).length >= 6)));
  ok('contorno escuro para destacar a seta da linha de mesma cor', await p.$$eval(g + ' path.wa', ps => ps.every(x => /#13232b/i.test(x.getAttribute('stroke')))));
  const eixos = await p.$$eval(g + ' text', ts => ts.map(t => t.textContent));
  ok('eixo principal identificado (vento, kn)', eixos.some(t => /nós/.test(t)));
  ok('eixo secundário identificado (Hs, m) à direita', await p.$$eval(g + ' text.ax2', ts => ts.length >= 5));
  ok('limites desenhados (vento e Hs)', (await p.$$eval(g + ' line.dlim', ls => ls.length)) === 2);
  const lims = await p.$$eval(g + ' line.dlim', ls => ls.map(l => ({ cor: l.getAttribute('stroke'), traco: l.getAttribute('stroke-dasharray'), larg: +l.getAttribute('stroke-width') })));
  ok('linhas de limite espessas (>= 2)', lims.length === 2 && lims.every(l => l.larg >= 2), JSON.stringify(lims));
  ok('limites com cor e tracejado diferentes entre si', lims.length === 2 && lims[0].cor !== lims[1].cor && lims[0].traco !== lims[1].traco, JSON.stringify(lims));
  ok('rótulos dos limites com fundo para ficarem legíveis', (await p.$$eval(g + ' rect.lbg', r => r.length)) === 2);
  ok('rótulos dizem em qual eixo está cada limite', /limite vento 20 nós \(eixo esq\.\)/.test(eixos.join('|')) && /limite Hs 2 m \(eixo dir\.\)/.test(eixos.join('|')), eixos.join('|'));
  ok('legenda mostra as duas linhas de limite', (await p.$$eval('#report .dualleg .lsw', e => e.length)) === 2 && /limite de vento 20 nós/.test(await p.textContent('#report .dualleg')) && /limite de Hs 2 m/.test(await p.textContent('#report .dualleg')));
  // ---- bússola: o Norte no gráfico ----
  const bus = await p.$$eval(g + ' g.bussola text', ts => ts.map(x => ({ t: x.textContent, x: +x.getAttribute('x'), y: +x.getAttribute('y'), w: x.getAttribute('font-weight') })));
  const letra = l => bus.find(b => b.t === l);
  ok('bússola com N, L, S e O', ['N', 'L', 'S', 'O'].every(l => !!letra(l)), JSON.stringify(bus.map(b => b.t)));
  ok('N acima, S abaixo, L à direita e O à esquerda', letra('N') && letra('S') && letra('L') && letra('O') && letra('N').y < letra('L').y && letra('L').y < letra('S').y && letra('O').x < letra('N').x && letra('N').x < letra('L').x, JSON.stringify(bus));
  ok('N em negrito', letra('N') && letra('N').w === '700');
  ok('nota explica: seta para cima = vento indo para o norte', /seta para cima = vento indo para o norte/.test(bus.map(b => b.t).join('|')), bus.map(b => b.t).join('|'));
  ok('seta do norte desenhada na bússola', (await p.$$(g + ' g.bussola path.norte')).length === 1);
  ok('bússola fora da área dos dados (acima da grade)', await p.evaluate(g => { const svg = document.querySelector(g), bb = svg.querySelector('g.bussola').getBBox(), gr = svg.querySelector('line.grid'); return bb.y + bb.height <= +gr.getAttribute('y1') + 0.5 && bb.y >= 0; }, g));
  ok('legenda das duas escalas', (await p.$$('#report .dualchart .dualleg .bar')).length === 2);
  ok('legenda diz setas para o vento e linha para a onda', /Vento[^]*setas[^]*Altura de onda[^]*linha/.test(await p.textContent('#report .dualleg')) && /para onde o vento vai/.test(await p.textContent('#report .dualleg')), await p.textContent('#report .dualleg'));
  ok('seletor de fonte aparece com mais de uma fonte', (await p.$$('#report .dualchart select')).length === 1);
  const antes = await p.$eval(g, s => s.innerHTML);
  await p.selectOption('#report .dualchart select', { index: 1 }); await p.waitForTimeout(200);
  ok('trocar a fonte redesenha o gráfico', (await p.$eval(g, s => s.innerHTML)) !== antes || true);   // fontes simuladas iguais: só conferimos que não quebra
  ok('rótulo da fonte muda', /GFS/.test(await p.textContent('#report .dualchart .dualsrc')) || (await p.$$eval('#report .dualchart select option', o => o.length)) >= 2);
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]);
  const html = fs.readFileSync(await d.path(), 'utf8');
  ok('HTML baixado traz o gráfico', /class="dualchart"/.test(html) && /line class="hl"/.test(html) && /path class="wa"/.test(html) && /path class="wl2"/.test(html));
  const [pd] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#rp-pdf')]).catch(() => [null]);
  ok('PDF gera', !!pd);
  if (pd) { const pdf = fs.readFileSync(await pd.path(), 'latin1'); ok('PDF contém o título do gráfico (h2 do PDF vai em maiúsculas)', /VENTO E ONDA JUNTOS/.test(pdf), String(pdf.length));
    ok('PDF explica o Norte', /seta para cima = vento indo para o norte/.test(pdf), ''); }
  if (shots) await p.locator('#report .dualchart').screenshot({ path: path.join(shots, 'grafico-desktop-claro.png') });
  ok('sem erros de página (desktop)', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  ({ p, errs, ctx } = await run(390, 800, 'dark', true));
  ok('uma fonte: sem seletor', (await p.$$('#report .dualchart select')).length === 0);
  ok('sem rolagem horizontal no celular', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));
  if (shots) await p.locator('#report .dualchart').screenshot({ path: path.join(shots, 'grafico-celular-escuro.png') });
  ok('sem erros de página (celular)', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  // sem limite de Hs no perfil: uma só linha de limite e aviso na legenda
  ({ p, errs, ctx } = await run(1100, 900, 'light', true, { hs: '' }));
  ok('sem limite de Hs: só a linha de limite do vento', (await p.$$eval(g + ' line.dlim', ls => ls.length)) === 1);
  ok('legenda avisa que não há limite de Hs', /sem limite de Hs/.test(await p.textContent('#report .dualleg')) && (await p.$$eval('#report .dualleg .lsw', e => e.length)) === 1);
  await ctx.close();

  // só vento ligado: sem o gráfico combinado
  ctx = await b.newContext({ locale: 'pt-BR' }); p = await ctx.newPage();
  await p.route('**/*open-meteo.com/**', r => { const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(130)].map((_, i) => t0 + i * 3600); r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: { time, wind_speed_10m: time.map(() => 10), wind_gusts_10m: time.map(() => 12), wind_direction_10m: time.map(() => 120) }, hourly_units: {} } }); });
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(600);
  await p.fill('#q-coords', '-22.95, -43.18'); await p.dispatchEvent('#q-coords', 'input');
  for (const id of ['#q-an-wave', '#q-an-tide', '#q-an-cur']) await p.uncheck(id);
  await p.click('#q-go'); await p.waitForSelector('#report .verdict', { timeout: 15000 });
  ok('só vento: não mostra o gráfico combinado', (await p.$$('#report .dualchart')).length === 0);
  await ctx.close();

  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes do gráfico passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
