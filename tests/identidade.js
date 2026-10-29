/* Teste da identidade: logotipo discreto e "Desenvolvido por" no app e nos relatórios (tela, HTML, PDF). Rodar: node tests/identidade.js [pasta-de-capturas] */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const shots = process.argv[2];
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
const src = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

// tamanho dos logotipos embutidos
const b64 = [...src.matchAll(/(?:data:image\/webp;base64,|LOGO_JPG_B64 = ')([A-Za-z0-9+/=]{500,})/g)].map(m => m[1].length);
ok('logotipos embutidos (WebP e JPEG)', b64.length === 2, JSON.stringify(b64));
ok('imagens leves (até 40 KB no total em base64)', b64.reduce((a, b) => a + b, 0) <= 40 * 1024, String(b64.reduce((a, b) => a + b, 0)));

const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const abre = async (w, h, scheme) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/*open-meteo.com/**', r => {
      const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(130)].map((_, i) => t0 + i * 3600), m = r.request().url().includes('marine');
      r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: m ? { time, wave_height: time.map(() => 1), wave_period: time.map(() => 9), wave_direction: time.map(() => 270) } : { time, wind_speed_10m: time.map(() => 10), wind_gusts_10m: time.map(() => 14), wind_direction_10m: time.map(() => 120) }, hourly_units: {} } });
    });
    await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(700);
    return { p, errs, ctx };
  };
  const gera = async (p, modo) => {
    await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input'); await p.check(`input[name="q-mode"][value="${modo}"]`);
    await p.click('#q-go'); await p.waitForSelector('#report .verdict', { timeout: 15000 });
  };
  const DEV = /Desenvolvido por\s+Ernani Vilela/;

  let { p, errs, ctx } = await abre(1100, 900, 'light');
  // cabeçalho do app
  const lg = await p.$eval('#app-logo', i => ({ src: i.src.slice(0, 22), w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, alt: i.alt, ok: i.complete && i.naturalWidth > 0 }));
  ok('logotipo no cabeçalho do app, carregado e com texto alternativo', lg.ok && /data:image\/webp/.test(lg.src) && /MetOcean/.test(lg.alt), JSON.stringify(lg));
  ok('logotipo discreto (até 44 px)', lg.w <= 44 && lg.h <= 44 && lg.w >= 28, JSON.stringify(lg));
  const foot = await p.textContent('footer.appfoot');
  ok('rodapé do app: Desenvolvido por, papel, ano, e-mail e WhatsApp', DEV.test(foot) && /Oceanógrafo Surveyor/.test(foot) && /2026/.test(foot) && /vilelaernani@gmail\.com/.test(foot) && /\(35\) 99159-5388/.test(foot), foot);
  ok('e-mail e WhatsApp são links', (await p.$$eval('footer.appfoot a', a => a.map(x => x.getAttribute('href')))).some(h => /^mailto:vilelaernani@gmail\.com/.test(h)) && (await p.$$eval('footer.appfoot a', a => a.map(x => x.getAttribute('href')))).some(h => /wa\.me\/5535991595388/.test(h)));
  ok('rodapé do app em letra pequena', await p.$eval('footer.appfoot', e => parseFloat(getComputedStyle(e).fontSize) <= 13));

  for (const modo of ['resumido', 'completo']) {
    await gera(p, modo);
    const rl = await p.$eval('#report .rplogo', i => ({ w: i.getBoundingClientRect().width, ok: i.complete && i.naturalWidth > 0, alt: i.alt }));
    ok(`${modo}: logotipo no relatório, discreto`, rl.ok && rl.w <= 52 && rl.w >= 30 && /MetOcean/.test(rl.alt), JSON.stringify(rl));
    ok(`${modo}: rodapé do relatório com Desenvolvido por`, DEV.test(await p.textContent('#report .foot')) && /vilelaernani@gmail\.com/.test(await p.textContent('#report .foot')));
    const [d] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]);
    const html = fs.readFileSync(await d.path(), 'utf8');
    ok(`${modo}: nome do arquivo HTML traz data e hora`, /-\d{8}-\d{4}\.html$/.test(d.suggestedFilename()), d.suggestedFilename());
    ok(`${modo}: HTML baixado leva logotipo e rodapé`, /class="rplogo" src="data:image\/webp/.test(html) && DEV.test(html.replace(/<[^>]+>/g, ' ')), '');
    const [pd] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#rp-pdf')]).catch(() => [null]);
    ok(`${modo}: PDF gera`, !!pd);
    if (pd) {
      const caminho = await pd.path(), pdf = fs.readFileSync(caminho, 'latin1');
      ok(`${modo}: PDF tem a imagem do logotipo sem depender de decodificador JPEG (RGB cru)`, /\/Subtype \/Image/.test(pdf) && /\/XObject/.test(pdf) && /\/Width 96 \/Height 96/.test(pdf) && !/\/DCTDecode/.test(pdf) && !/\/Filter/.test(pdf.slice(pdf.indexOf('/Subtype /Image') - 40, pdf.indexOf('/Subtype /Image') + 200)), pdf.slice(pdf.indexOf('/Subtype /Image') - 20, pdf.indexOf('/Subtype /Image') + 160));
      const pgs = (pdf.match(/\/Type \/Page /g) || []).length;
      ok(`${modo}: identidade também no cabeçalho da primeira página (nome e papel além do rodapé)`, (pdf.match(/Ernani Vilela/g) || []).length >= pgs + 1 && (pdf.match(/Oceanógrafo Surveyor/g) || []).length >= pgs + 1, `${(pdf.match(/Ernani Vilela/g) || []).length} / ${pgs}`);
      ok(`${modo}: nome do arquivo PDF traz data e hora (evita abrir um arquivo antigo)`, /-\d{8}-\d{4}\.pdf$/.test(pd.suggestedFilename()), pd.suggestedFilename());
      ok(`${modo}: PDF tem o "Desenvolvido por" em todas as páginas`, (pdf.match(/Desenvolvido por Ernani Vilela/g) || []).length === (pdf.match(/\/Type \/Page /g) || []).length && (pdf.match(/Desenvolvido por/g) || []).length >= 1, `${(pdf.match(/Desenvolvido por/g) || []).length} / ${(pdf.match(/\/Type \/Page /g) || []).length}`);
      try { const info = execFileSync('pdfinfo', [caminho]).toString(); ok(`${modo}: PDF válido (pdfinfo)`, /Pages:\s+\d+/.test(info), info.slice(0, 80)); } catch (e) { if (e.code !== 'ENOENT') ok(`${modo}: PDF válido (pdfinfo)`, false, String(e.message).slice(0, 120)); }
      if (shots && modo === 'resumido') fs.copyFileSync(caminho, path.join(shots, 'identidade.pdf'));
    }
  }
  if (shots) await p.screenshot({ path: path.join(shots, 'identidade-desktop.png'), clip: { x: 0, y: 0, width: 1100, height: 140 } });
  ok('sem erros de página (desktop)', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  // celular escuro: cabeçalho e rodapé sem rolagem lateral
  ({ p, errs, ctx } = await abre(390, 800, 'dark'));
  ok('celular: sem rolagem horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));
  ok('celular: logotipo visível', await p.$eval('#app-logo', i => i.getBoundingClientRect().width > 20 && i.complete && i.naturalWidth > 0));
  await p.evaluate(() => document.querySelector('footer.appfoot').scrollIntoView());
  if (shots) await p.screenshot({ path: path.join(shots, 'identidade-celular.png') });
  ok('celular: rodapé visível e dentro da tela', await p.$eval('footer.appfoot', e => { const r = e.getBoundingClientRect(); return r.right <= window.innerWidth + 1 && r.height > 10; }));
  ok('celular: sem erros de página', errs.length === 0, JSON.stringify(errs)); await ctx.close();

  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes de identidade passaram');
  await b.close(); process.exit(fails ? 1 : 0);
})();
