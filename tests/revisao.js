/* Teste da revisão (spec 7): histórico compacto, fuso pela longitude e rodada do modelo. Rodar: node tests/revisao.js */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const H = 3600, agora = Math.floor(Date.now() / 3600000) * 3600;
  const abre = async ({ locale = 'pt-BR', dias = 16, meta = 'ok', url = '' } = {}) => {
    const ctx = await b.newContext({ locale, viewport: { width: 1100, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/*open-meteo.com/**', r => {
      const t0 = agora, time = [...Array(dias * 24 + 2)].map((_, i) => t0 + i * H), m = r.request().url().includes('marine'), d2 = v => Math.round(v * 100) / 100, d1 = v => Math.round(v * 10) / 10;   // precisão com que a Open-Meteo entrega
      r.fulfill({ json: { latitude: -22.9, longitude: -43.1, hourly: m ? { time, wave_height: time.map((_, i) => d2(1.2 + 0.8 * Math.sin(i / 9))), wave_period: time.map(() => 8), wave_direction: time.map((_, i) => (200 + i * 2) % 360), sea_level_height_msl: time.map((_, i) => d2(0.8 * Math.sin(i / 2))), ocean_current_velocity: time.map((_, i) => d2(1.2 + Math.sin(i / 6))), ocean_current_direction: time.map((_, i) => (30 + i * 5) % 360) } : { time, wind_speed_10m: time.map((_, i) => d1(14 + 9 * Math.sin(i / 7 + 1))), wind_gusts_10m: time.map(() => 20), wind_direction_10m: time.map((_, i) => Math.round((60 + i * 3.2) % 360)) }, hourly_units: { ocean_current_velocity: 'kn' } } });
    });
    await p.route('**/static/meta.json', r => {
      if (meta === 'falha') return r.abort();
      const u = r.request().url(), gfs = /gfs/.test(u), run = gfs ? agora - 5 * H : agora - 11 * H;   // GFS 5 h atrás, ECMWF 11 h atrás
      r.fulfill({ json: { last_run_initialisation_time: run, last_run_availability_time: run + 4 * H, update_interval_seconds: 21600 } });
    });
    await p.route(/openstreetmap\.org\/.*\.png/, r => r.abort());
    await p.goto('file://' + path.resolve(__dirname, '../index.html') + url); await p.waitForTimeout(700);
    return { p, ctx, errs };
  };
  const gera = async (p, coords = '-22.9519, -43.1859', dias = 16) => {
    await p.fill('#q-coords', coords); await p.dispatchEvent('#q-coords', 'input'); await p.fill('#q-days', String(dias)); await p.fill('#q-wind', '20'); await p.fill('#q-hs', '2');
    await p.evaluate(() => document.querySelectorAll('#report .verdict').forEach(v => v.setAttribute('data-old', '1')));
    await p.click('#q-go'); await p.waitForSelector('#report .verdict:not([data-old])', { timeout: 20000 });
  };

  // ---- 1. histórico compacto ----
  let { p, ctx, errs } = await abre();
  await gera(p);
  const tamanho = await p.evaluate(() => (localStorage.getItem('mco:results') || '').length);
  ok('relatório de 16 dias com 3 fontes ocupa menos de 52 KB salvo (antes: ~61 KB; e o histórico guarda 20, não 40)', tamanho > 2000 && tamanho < 52 * 1024, `${(tamanho / 1024).toFixed(1)} KB`);
  const antes = await p.innerText('#report');
  const salvo = await p.evaluate(() => { const m = JSON.parse(localStorage.getItem('mco:results')); const k = Object.keys(m)[0]; return { packed: m[k].packed, grid: m[k].result.grid, st: m[k].result.conservative.status.slice(0, 5) }; });
  ok('salvo em forma compacta (status em letras, grade como início + quantidade)', salvo.packed === 2 && typeof salvo.grid.n === 'number' && /^[GNX]+$/.test(salvo.st), JSON.stringify(salvo));
  await p.click('#t-historico'); await p.click('#h-list button.lnk >> nth=0'); await p.waitForSelector('#report .verdict');
  const depois = await p.innerText('#report');
  const semIdade = t => t.replace(/Previsão gerada há [^.]*\./g, '').replace(/\d+ min/g, '');
  ok('relatório reaberto do histórico é igual ao original', semIdade(antes) === semIdade(depois), '');
  // relatório salvo no formato antigo (sem compactar) continua abrindo
  await p.evaluate(() => { const m = JSON.parse(localStorage.getItem('mco:results')), k = Object.keys(m)[0], r = m[k], res = r.result;
    const st = s => [...s].map(c => ({ G: 'go', N: 'nogo', X: 'nodata' })[c]); const grid = Array.from({ length: res.grid.n }, (_, i) => res.grid.t0 + i * 3600);
    const old = { ...r, result: { ...res, grid, sources: res.sources.map(s => ({ ...s, status: st(s.status) })), conservative: { ...res.conservative, status: st(res.conservative.status) }, optimistic: { ...res.optimistic, status: st(res.optimistic.status) } } }; delete old.packed;
    m[k] = old; localStorage.setItem('mco:results', JSON.stringify(m)); });
  await p.reload(); await p.waitForTimeout(700); await p.click('#t-historico'); await p.click('#h-list button.lnk >> nth=0'); await p.waitForSelector('#report .verdict', { timeout: 10000 });
  ok('relatório salvo no formato antigo abre igual', semIdade(await p.innerText('#report')) === semIdade(antes), '');
  ok('sem erros de página (histórico)', errs.length === 0, JSON.stringify(errs));
  await ctx.close();

  // ---- 2. fuso pela longitude ----
  ({ p, ctx, errs } = await abre({ dias: 3 }));
  await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input');
  ok('longitude −43° preenche fuso −3 automaticamente', (await p.inputValue('#q-tz')) === '-3' && (await p.getAttribute('#q-tz', 'data-auto')) === '1', await p.inputValue('#q-tz'));
  await p.fill('#q-coords', '5.3, 4.0'); await p.dispatchEvent('#q-coords', 'input');
  ok('ponto na África Ocidental (lon 4°) vira fuso 0', (await p.inputValue('#q-tz')) === '0', await p.inputValue('#q-tz'));
  await p.fill('#q-coords', '28.0, -89.5'); await p.dispatchEvent('#q-coords', 'input');
  ok('Golfo do México (lon −89,5°) vira fuso −6', (await p.inputValue('#q-tz')) === '-6', await p.inputValue('#q-tz'));
  await gera(p, '28.0, -89.5', 3);
  ok('relatório usa o fuso do ponto (UTC−6), não o do navegador', /UTC−6/.test(await p.innerText('#report .hdr.main')), await p.innerText('#report .hdr.main'));
  await p.fill('#q-tz', '-5');
  await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input');
  ok('fuso digitado pelo usuário não é sobrescrito ao mudar o ponto', (await p.inputValue('#q-tz')) === '-5' && !(await p.getAttribute('#q-tz', 'data-auto')));
  await gera(p, '-22.9519, -43.1859', 3);
  ok('relatório respeita o fuso digitado (UTC−5)', /UTC−5/.test(await p.innerText('#report .hdr.main')));
  await p.fill('#q-tz', '');
  ok('apagar o fuso volta ao automático', (await p.inputValue('#q-tz')) === '-3' && (await p.getAttribute('#q-tz', 'data-auto')) === '1', await p.inputValue('#q-tz'));
  // local salvo manda no fuso
  await p.click('#t-locais'); await p.fill('#l-name', 'Base'); await p.fill('#l-lat', '-22.5'); await p.fill('#l-lon', '-41.5'); await p.fill('#l-tz', '-2'); await p.click('#l-save'); await p.waitForFunction(() => /salvo/i.test(document.querySelector('#l-msg').textContent));
  await p.click('#t-analise'); await p.fill('#q-coords', '-22.5, -41.5'); await p.dispatchEvent('#q-coords', 'input');
  ok('ponto de um local salvo usa o fuso do cadastro (−2)', (await p.inputValue('#q-tz')) === '-2', await p.inputValue('#q-tz'));
  await p.reload(); await p.waitForTimeout(700);
  ok('fuso fica guardado ao recarregar', (await p.inputValue('#q-tz')) === '-2');
  await ctx.close();
  ({ p, ctx } = await abre({ dias: 3, url: '?lat=-10&lon=-35&fuso=-4' }));
  ok('parâmetro ?fuso= no link vale como digitado', (await p.inputValue('#q-tz')) === '-4' && !(await p.getAttribute('#q-tz', 'data-auto')));
  await ctx.close();

  // ---- 3. rodada do modelo ----
  ({ p, ctx, errs } = await abre({ dias: 3 }));
  await gera(p, '-22.9519, -43.1859', 3);
  let rel = await p.innerText('#report');
  ok('cabeçalho lista a rodada de cada modelo nomeado (vento e onda)', /Rodadas dos modelos: NOAA GFS \/ GFS-Wave: vento \d{2}\/\d{2} \d{2}:\d{2}Z, onda \d{2}\/\d{2} \d{2}:\d{2}Z · ECMWF IFS \/ WAM: vento .*, onda /.test(rel), (rel.match(/Rodada[^\n]*/) || [''])[0]);
  ok('"melhor modelo" não entra na lista (não tem rodada única)', !/Open-Meteo \(melhor modelo\): vento/.test(rel));
  ok('idade informa a rodada mais antiga (11 h antes do relatório)', /A rodada mais antiga dos modelos é de 11 h antes deste relatório\./.test(rel), (rel.match(/rodada mais antiga[^\n]*/) || [''])[0]);
  const [dh] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]);
  ok('HTML baixado mantém a frase da rodada na idade', /A rodada mais antiga dos modelos é de 11 h/.test(fs.readFileSync(await dh.path(), 'utf8')));
  const [pd] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#rp-pdf')]);
  let txt = ''; try { txt = execFileSync('pdftotext', ['-layout', await pd.path(), '-'], { encoding: 'utf8' }); } catch (e) { txt = fs.readFileSync(await pd.path(), 'latin1'); }
  ok('PDF traz as rodadas dos modelos', /Rodadas dos modelos: NOAA GFS/.test(txt), txt.slice(0, 400));
  await p.click('button.flag[data-lang="en"]'); await p.waitForTimeout(300);
  rel = await p.innerText('#report');
  ok('em inglês: Model runs e oldest model run', /Model runs: NOAA GFS \/ GFS-Wave: wind .*, wave /.test(rel) && /The oldest model run is from 11 h before this report\./.test(rel), (rel.match(/Model run[^\n]*/) || [''])[0]);
  ok('sem erros de página (rodada)', errs.length === 0, JSON.stringify(errs));
  await ctx.close();
  // sem informação da rodada: relatório sai igual, com aviso
  ({ p, ctx, errs } = await abre({ dias: 3, meta: 'falha' }));
  await gera(p, '-22.9519, -43.1859', 3);
  rel = await p.innerText('#report');
  ok('sem meta.json: relatório sai e diz que a rodada não foi informada', /Rodada do modelo: não informada pela fonte/.test(rel) && !/rodada mais antiga/.test(rel) && /Janelas — cenário conservador/i.test(rel));
  ok('sem erros de página (sem meta)', errs.length === 0, JSON.stringify(errs));
  await ctx.close();

  await b.close();
  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes da revisão passaram');
  process.exit(fails ? 1 : 0);
})();
