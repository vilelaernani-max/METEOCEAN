/* Teste dos idiomas (pt/en): dicionário, telas, relatórios (tela, HTML, PDF) e troca de idioma.
   Rodar: node tests/idiomas.js [pasta-de-capturas] */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const shots = process.argv[2];
let fails = 0;
const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FALHOU', n, x); } };
const src = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

// ---- 1. dicionário: toda chave usada no código tem a versão em inglês, sem texto vazio ----
const bloco = src.match(/\/\*EN:start\*\/\s*const EN = \{\};\s*Object\.assign\(EN, (\{[\s\S]*?\})\);\s*\/\*EN:end\*\//);
ok('dicionário EN presente', !!bloco);
const EN = bloco ? new Function('return ' + bloco[1])() : {};
ok('dicionário sem texto vazio', Object.values(EN).every(v => typeof v === 'string' && v.trim().length > 0));
const usadas = new Set();
for (const m of src.matchAll(/\btt\(\s*(?:'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\$])*)`)/g)) {
  const k = m[1] !== undefined ? m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\') : m[2] !== undefined ? m[2].replace(/\\"/g, '"') : m[3];
  usadas.add(k.replace(/\\u0001/g, '\u0001'));
}
const faltam = [...usadas].filter(k => EN[k] === undefined && !/^[\u0001-\u0003{}\d\s.,:;()\-–—·|/]+$/.test(k));
ok('toda chave tt() usada no código existe no dicionário', faltam.length === 0, JSON.stringify(faltam, null, 1));
ok('mesmos marcadores {n} em português e em inglês', Object.entries(EN).every(([k, v]) => (k.match(/\{\d+\}/g) || []).sort().join() === (v.match(/\{\d+\}/g) || []).sort().join()),
  JSON.stringify(Object.entries(EN).filter(([k, v]) => (k.match(/\{\d+\}/g) || []).sort().join() !== (v.match(/\{\d+\}/g) || []).sort().join()).map(([k]) => k.slice(0, 60))));

const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const PT_WORDS = /\b(janelas?|previs[ãa]o|vento|ondas?|mar[ée]|corrente|relat[óo]rio|an[áa]lise|limites?|gerar|salvar|excluir|ajuda|avisos?|equipamentos?|locais|hora|horas|n[ãa]o|gerado|fonte|fontes|cen[áa]rio|conservador|otimista|dire[çc][ãa]o|bloqueada)\b/i;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const mock = async p => {
    await p.route('**/*open-meteo.com/**', r => {
      const t0 = Math.floor(Date.now() / 3600000) * 3600, time = [...Array(130)].map((_, i) => t0 + i * 3600), m = r.request().url().includes('marine');
      const n = (r.request().url().match(/latitude=([^&]*)/) || [, ''])[1].split(',').length;   // grade do mapa: vários pontos
      const um = m ? { latitude: -22.9, longitude: -43.1, hourly: { time, wave_height: time.map((_, i) => 1.2 + 0.8 * Math.sin(i / 9)), wave_period: time.map(() => 8), wave_direction: time.map((_, i) => (200 + i * 2) % 360), sea_level_height_msl: time.map((_, i) => 0.8 * Math.sin(i / 2)), ocean_current_velocity: time.map((_, i) => 1.2 + Math.sin(i / 6)), ocean_current_direction: time.map((_, i) => (30 + i * 5) % 360) }, hourly_units: {} }
        : { latitude: -22.9, longitude: -43.1, hourly: { time, wind_speed_10m: time.map((_, i) => 14 + 9 * Math.sin(i / 7 + 1)), wind_gusts_10m: time.map(() => 20), wind_direction_10m: time.map((_, i) => (60 + i * 3.2) % 360) }, hourly_units: {} };
      r.fulfill({ json: n > 1 ? Array.from({ length: n }, () => um) : um });
    });
    await p.route(/openstreetmap\.org\/.*\.png/, r => r.abort());
  };
  const abre = async ({ lang = 'en', locale = 'en-US', w = 1100, h = 900, url = '' } = {}) => {
    const ctx = await b.newContext({ locale, viewport: { width: w, height: h }, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await mock(p);
    await p.goto('file://' + path.resolve(__dirname, '../index.html') + (url || (lang ? `?lang=${lang}` : ''))); await p.waitForTimeout(800);
    return { p, ctx, errs };
  };
  const texto = p => p.evaluate(() => document.body.innerText);
  const faltaTraducao = p => p.evaluate(() => [...window.__missing]);
  const gera = async (p, modo) => {
    await p.fill('#q-coords', '-22.9519, -43.1859'); await p.dispatchEvent('#q-coords', 'input'); await p.fill('#q-wind', '20'); await p.fill('#q-hs', '2');
    await p.check(`input[name="q-mode"][value="${modo}"]`);
    await p.click('#q-go'); await p.waitForSelector('#report .verdict', { timeout: 15000 });
  };

  // ---- 2. idioma inicial: pelo navegador, pelo parâmetro e pela escolha salva ----
  { const { p, ctx } = await abre({ lang: null, locale: 'pt-BR' }); ok('navegador pt-BR abre em português', (await p.getAttribute('html', 'lang')) === 'pt-BR' && /Análise rápida/i.test(await texto(p))); await ctx.close(); }
  { const { p, ctx } = await abre({ lang: null, locale: 'en-US' }); ok('navegador en-US abre em inglês', (await p.getAttribute('html', 'lang')) === 'en' && /Quick analysis/i.test(await texto(p))); await ctx.close(); }
  { const { p, ctx } = await abre({ lang: null, locale: 'fr-FR' }); ok('outro idioma do navegador cai em inglês', /Quick analysis/i.test(await texto(p))); await ctx.close(); }

  // ---- 3. telas fixas em inglês, sem português ----
  let { p, ctx, errs } = await abre({ lang: 'en' });
  ok('bandeiras: Brasil e EUA, a do idioma atual marcada', await p.evaluate(() => { const [a, b] = [...document.querySelectorAll('button.flag')]; return a.dataset.lang === 'pt' && b.dataset.lang === 'en' && a.getAttribute('aria-pressed') === 'false' && b.getAttribute('aria-pressed') === 'true' && a.querySelector('svg') && b.querySelector('svg'); }));
  ok('bandeiras têm texto alternativo', await p.evaluate(() => [...document.querySelectorAll('button.flag')].map(x => x.getAttribute('aria-label')).join() === 'Português,English'));
  for (const aba of ['analise', 'locais', 'limites', 'equip', 'historico', 'avisos', 'ajuda']) {
    await p.click(`#t-${aba}`);
    const t = await p.evaluate(id => document.getElementById(id).innerText, `p-${aba}`);
    const pt = t.match(PT_WORDS);
    ok(`aba ${aba} em inglês sem português`, !pt, pt ? pt[0] + ' → ' + t.slice(Math.max(0, pt.index - 40), pt.index + 40) : '');
  }
  ok('abas e rodapé em inglês', /Analysis[\s\S]*Locations[\s\S]*Limits[\s\S]*Equipment[\s\S]*History[\s\S]*Navy warnings[\s\S]*Help/.test(await p.innerText('nav.tabs')) && /Developed by Ernani Vilela · Surveyor Oceanographer · © 2026/.test(await p.innerText('#appfoot')), await p.innerText('#appfoot'));
  ok('seletores de direção em inglês (E/W)', await p.evaluate(() => [...document.querySelectorAll('#q-dfrom option')].map(o => o.textContent).join(',') === '—,N,NNE,NE,ENE,E,ESE,SE,SSE,S,SSW,SW,WSW,W,WNW,NW,NNW'));
  ok('textos de ajuda e atributos (placeholder) em inglês', (await p.getAttribute('#q-coords', 'placeholder')).startsWith('e.g.') && (await p.getAttribute('#map', 'aria-label')).startsWith('Map to choose'));
  ok('título do documento e idioma', (await p.getAttribute('html', 'lang')) === 'en');
  ok('sem textos sem tradução nas telas fixas', (await faltaTraducao(p)).length === 0, JSON.stringify(await faltaTraducao(p)));

  // ---- 4. cadastros e mensagens em inglês ----
  await p.click('#t-locais'); await p.click('#l-save');
  ok('mensagem de validação em inglês', /Give the location a name/.test(await p.textContent('#l-msg')), await p.textContent('#l-msg'));
  await p.fill('#l-name', 'Rig Alpha'); await p.fill('#l-lat', '-22.5'); await p.fill('#l-lon', '-41.5'); await p.fill('#l-hs', '1.8'); await p.click('#l-save');
  ok('local salvo (inglês)', /Location saved/.test(await p.textContent('#l-msg')) && /Hs ≤ 1.8 m/.test(await p.textContent('#l-list')), await p.textContent('#l-list'));
  await p.click('#t-equip');
  await p.fill('#e-name', 'Stern crane'); await p.fill('#e-type', 'Crane'); await p.fill('#e-hs', '2'); await p.fill('#e-wind', '25'); await p.selectOption('#e-dfrom', '2'); await p.selectOption('#e-dto', '4'); await p.click('#e-save');
  ok('equipamento salvo (inglês)', /Equipment saved/.test(await p.textContent('#e-msg')) && /Stern crane · Crane/.test(await p.textContent('#e-list')) && /no wind from NE to E/.test(await p.textContent('#e-list')), await p.textContent('#e-list'));
  await p.click('#t-limites'); await p.click('#p-seed');
  await p.waitForFunction(() => document.querySelectorAll('#p-sel option').length >= 3);
  ok('perfis de exemplo com nomes em inglês', /Multibeam survey \(example\)/.test(await p.innerText('#p-sel')), await p.innerText('#p-sel'));
  await p.click('#t-analise');
  await p.check('#q-equips label input >> nth=0');
  ok('nota de equipamento em inglês', /Combined limit \(the most restrictive\) of: Stern crane/.test(await p.textContent('#q-equip-note')), await p.textContent('#q-equip-note'));

  // ---- 5. relatório completo em inglês (tela, HTML, PDF) ----
  await gera(p, 'completo');
  let rel = await p.innerText('#report');
  let pt = rel.match(PT_WORDS);
  ok('relatório completo em inglês sem português', !pt, pt ? pt[0] + ' → ' + rel.slice(Math.max(0, pt.index - 50), pt.index + 50) : '');
  ok('relatório completo: seções em inglês', ['Windows — conservative scenario', 'Daily summary (conservative scenario)', 'Timeline by source', 'Prevailing wind', 'Wind and waves together', 'Sea current', 'Tide', 'Wave regime in the forecast period', 'Comparison between sources', 'Navy bad-weather warnings', 'Applied limits'].every(s => rel.toUpperCase().includes(s.toUpperCase())), rel.slice(0, 300));
  ok('relatório: cabeçalho, veredito e idade em inglês', /MetOcean report/i.test(rel) && /operational window\(s\) in the conservative scenario|No window of/.test(rel) && /Forecast generated/.test(rel));
  ok('relatório: datas em inglês (29 Oct) e números com ponto', /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{2} [A-Z][a-z]{2} \d{2}:\d{2}/.test(rel) && !/\d,\d+ m\b/.test(rel.replace(/\d{1,2},\d{3}/g, '')), '');
  ok('relatório: equipamento e limites', /Equipment: Stern crane/.test(rel) && /Blocked wind direction/.test(rel) && /NE to E/.test(rel));
  ok('mapa da região em inglês', /View regional map/.test(rel));
  const [dh] = await Promise.all([p.waitForEvent('download'), p.click('#rp-download')]);
  const html = fs.readFileSync(await dh.path(), 'utf8');
  const htmlTxt = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/Ernani Vilela/g, '');
  ok('HTML baixado em inglês: idioma, seções e rodapé', /<html lang="en">/.test(html) && /Windows — conservative scenario/.test(html) && /Developed by <b>Ernani Vilela<\/b> · Surveyor Oceanographer/.test(html), '');
  ok('HTML baixado: idade da previsão com textos em inglês', /data-a="Forecast generated \{0\} ago/.test(html) && /data-d="days"/.test(html), (html.match(/data-a="[^"]*"/) || [''])[0]);
  ok('HTML baixado sem português', !PT_WORDS.test(htmlTxt), (htmlTxt.match(PT_WORDS) || [''])[0] + ' → ' + htmlTxt.slice(Math.max(0, (htmlTxt.match(PT_WORDS) || { index: 0 }).index - 60), (htmlTxt.match(PT_WORDS) || { index: 0 }).index + 60));
  ok('HTML baixado: nome do arquivo', /\.html$/.test(dh.suggestedFilename()));
  const [pd] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#rp-pdf')]);
  const pdfPath = await pd.path(); fs.copyFileSync(pdfPath, '/tmp/idiomas-en.pdf');
  let txt = ''; try { txt = execFileSync('pdftotext', ['-layout', '/tmp/idiomas-en.pdf', '-'], { encoding: 'utf8' }); } catch (e) { txt = fs.readFileSync('/tmp/idiomas-en.pdf', 'latin1'); }
  ok('PDF em inglês: título e seções', /METOCEAN REPORT/.test(txt) && /WINDOWS — CONSERVATIVE SCENARIO/i.test(txt) && /COMPARISON BETWEEN SOURCES/i.test(txt) && /APPLIED LIMITS/i.test(txt), txt.slice(0, 400));
  ok('PDF em inglês: bússola com E e W', /\bW\b[\s\S]{0,80}\bE\b/.test(txt.slice(txt.indexOf('WIND AND WAVES TOGETHER'))) && !/\bO\b\s+\bL\b/.test(txt), '');
  ok('PDF em inglês: rodapé e identidade', /Surveyor Oceanographer/.test(txt) && /decision support/i.test(txt) && /page 1 of/.test(txt));
  const ptpdf = txt.replace(/Ernani Vilela/g, '').match(PT_WORDS);
  ok('PDF em inglês sem português', !ptpdf, ptpdf ? ptpdf[0] + ' → ' + txt.slice(Math.max(0, ptpdf.index - 60), ptpdf.index + 60) : '');
  ok('sem textos sem tradução depois do relatório completo', (await faltaTraducao(p)).length === 0, JSON.stringify(await faltaTraducao(p)));

  // ---- 6. troca de idioma refaz tudo sem perder o que foi digitado ----
  await p.fill('#q-name', 'My point'); await p.fill('#q-hs', '2.4');
  await p.click('button.flag[data-lang="pt"]');
  ok('troca para português: abas, relatório e campos', /Análise/.test(await p.innerText('nav.tabs')) && /Janelas — cenário conservador/i.test(await p.innerText('#report')) && (await p.inputValue('#q-hs')) === '2.4' && (await p.inputValue('#q-name')) === 'My point' && (await p.getAttribute('html', 'lang')) === 'pt-BR');
  ok('troca: seletores de direção em português (L/O) com valor mantido', await p.evaluate(() => [...document.querySelectorAll('#q-dfrom option')].map(o => o.textContent).includes('SSO')) && (await p.inputValue('#e-dfrom')) === '2');
  ok('troca: nota do equipamento e rodapé em português', /Limite combinado/.test(await p.textContent('#q-equip-note')) && /Desenvolvido por Ernani Vilela · Oceanógrafo Surveyor/.test(await p.innerText('#appfoot')));
  ok('troca: escolha fica salva', (await p.evaluate(() => localStorage.getItem('mco:lang'))) === 'pt');
  await p.click('button.flag[data-lang="en"]');
  ok('volta para inglês: relatório refeito', /Windows — conservative scenario/i.test(await p.innerText('#report')) && /Quick analysis/i.test(await texto(p)));
  ok('sem erros de página (inglês)', errs.length === 0, JSON.stringify(errs));
  if (shots) { await p.screenshot({ path: path.join(shots, 'idiomas-en.png') }); }
  await ctx.close();

  // ---- 7. relatório resumido em inglês, com tudo marcado e o histórico ----
  ({ p, ctx, errs } = await abre({ lang: 'en' }));
  await gera(p, 'resumido');
  rel = await p.innerText('#report'); pt = rel.match(PT_WORDS);
  ok('resumido em inglês sem português', !pt, pt ? pt[0] + ' → ' + rel.slice(Math.max(0, pt.index - 50), pt.index + 50) : '');
  ok('resumido: blocos em inglês', ['Wind and waves together', 'Wind rose', 'Wave rose', 'Wind: intensity, gust and direction', 'Wave: Hs, Tp and direction', 'Current: speed and direction', 'Tide: sea level', 'Applied limits'].every(s => rel.toUpperCase().includes(s.toUpperCase())));
  ok('resumido: legenda e bússola em inglês', await p.evaluate(() => /pointing to where the wind is going|points to where the wind is going/.test(document.querySelector('#report .blk').innerHTML) && /<text[^>]*>E<\/text>/.test(document.querySelector('#report .bussola').outerHTML)));
  const [pdr] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#rp-pdf')]);
  fs.copyFileSync(await pdr.path(), '/tmp/idiomas-en-resumido.pdf');
  let t2 = ''; try { t2 = execFileSync('pdftotext', ['-layout', '/tmp/idiomas-en-resumido.pdf', '-'], { encoding: 'utf8' }); } catch (e) { t2 = ''; }
  ok('PDF resumido em inglês', /WIND AND WAVES TOGETHER/.test(t2) && /WIND ROSE AND WAVE ROSE/.test(t2) && /North up/.test(t2) && !t2.replace(/Ernani Vilela/g, '').match(PT_WORDS), (t2.replace(/Ernani Vilela/g, '').match(PT_WORDS) || [''])[0]);
  await p.click('#t-historico');
  const h = await p.innerText('#h-list');
  ok('histórico em inglês (com o nome automático do perfil)', /generated \d{2} [A-Z][a-z]{2} \d{2}:\d{2} · \d+ conservative window\(s\)/.test(h) && /Hs ≤ 2 m, wind ≤ 20 kn/.test(h) && /Open report/.test(h) && !PT_WORDS.test(h), h);
  await p.click('button.flag[data-lang="pt"]');
  ok('histórico: nome automático do perfil muda de idioma', /vento ≤ 20 nós/.test(await p.innerText('#h-list')) && /gerado/.test(await p.innerText('#h-list')), await p.innerText('#h-list'));
  await p.click('#h-list button.lnk >> nth=0');
  ok('abrir relatório do histórico em português', /Janelas — cenário conservador/i.test(await p.innerText('#report')) && /Limites: Hs ≤ 2 m, vento ≤ 20 nós/.test(await p.innerText('#report')), (await p.innerText('#report')).slice(0, 300));
  ok('sem textos sem tradução (resumido)', (await faltaTraducao(p)).length === 0, JSON.stringify(await faltaTraducao(p)));
  ok('sem erros de página (resumido)', errs.length === 0, JSON.stringify(errs));
  await ctx.close();

  // ---- 8. fontes, backup e mapa da região em inglês ----
  ({ p, ctx, errs } = await abre({ lang: 'en' }));
  await p.click('#t-analise'); await p.evaluate(() => { document.querySelector('#adv').open = true; });
  await p.click('#src-test'); await p.waitForFunction(() => /responded with data|with a problem/.test(document.querySelector('#src-test-msg').textContent), null, { timeout: 15000 });
  const st = await p.innerText('#adv'); ok('teste de fontes em inglês', /Testing|All \d+ source\(s\) responded with data|with a problem/.test(st) && /hours with data/.test(st) && !/horas com dado|fonte\(s\) responderam/.test(st), st.slice(0, 300));
  ok('tabela de fontes em inglês', /Open-Meteo \(best model\)/.test(await p.evaluate(() => [...document.querySelectorAll('#src-body input')].map(i => i.value).join('|'))) && (await p.getAttribute('#src-body input >> nth=1', 'placeholder')) === '(best model)');
  await p.click('#t-historico'); const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#b-export')]);
  ok('backup exportado: mensagem em inglês', /Backup created/.test(await p.textContent('#b-msg')));
  await p.click('#t-avisos'); await p.fill('#n-text', 'qualquer texto sem relacao com o assunto, so para testar a leitura do formato'); await p.click('#n-import');
  ok('avisos: formato não reconhecido em inglês', /Format not recognised/.test(await p.textContent('#n-msg')), await p.textContent('#n-msg'));
  await p.fill('#n-text', 'NAO HA AVISO DE MAU TEMPO NO MOMENTO PARA A METAREA V'); await p.click('#n-import');
  ok('avisos: importação em inglês', /ok: the page reports that there are no warnings/.test(await p.textContent('#n-msg')) || /new\./.test(await p.textContent('#n-msg')), await p.textContent('#n-msg'));
  await p.click('#t-analise'); await gera(p, 'completo');
  await p.click('#report .rmwrap button.primary'); await p.waitForSelector('#rm-info', { timeout: 15000 });
  const mp = await p.innerText('#report .rmwrap');
  ok('mapa da região em inglês: títulos e controles', /Regional map: waves and wind/i.test(mp) && /Selected cell/.test(mp) && /Play/.test(mp) && /Region \d+ km on a side/.test(mp), mp.replace(/\n1\.2/g, '').slice(0, 500));
  ok('mapa da região sem português', !PT_WORDS.test(mp), (mp.match(PT_WORDS) || [''])[0] + ' → ' + mp.replace(/\n1\.2/g, '').slice(Math.max(0, (mp.match(PT_WORDS) || { index: 0 }).index - 60), (mp.match(PT_WORDS) || { index: 0 }).index + 60));
  ok('sem textos sem tradução (fontes, backup, avisos, mapa)', (await faltaTraducao(p)).length === 0, JSON.stringify(await faltaTraducao(p)));
  ok('sem erros de página (fontes/mapa)', errs.length === 0, JSON.stringify(errs));
  await ctx.close();

  // ---- falha de rede: duas tentativas e mensagem clara ----
  { const ctx2 = await b.newContext({ locale: 'pt-BR' }); const p2 = await ctx2.newPage(); let n = 0;
    await p2.route('**/*open-meteo.com/**', r => { n++; r.abort(); });
    await p2.goto('file://' + path.resolve(__dirname, '../index.html')); await p2.waitForTimeout(500);
    await p2.fill('#q-coords', '-22.9519, -43.1859'); await p2.dispatchEvent('#q-coords', 'input'); await p2.click('#q-go');
    await p2.waitForFunction(() => /tente de novo em 1 minuto/.test(document.querySelector('#q-msg').textContent), null, { timeout: 15000 });
    ok('falha de rede: tenta duas vezes e explica o que fazer', n === 2 && /limite de uso da Open-Meteo/.test(await p2.textContent('#q-msg')), n + ' ' + await p2.textContent('#q-msg'));
    await ctx2.close(); }

  // ---- 9. celular: bandeiras visíveis e sem rolagem lateral ----
  ({ p, ctx } = await abre({ lang: 'en', w: 390, h: 800 }));
  ok('celular: bandeiras visíveis e clicáveis', await p.evaluate(() => [...document.querySelectorAll('button.flag')].every(b => { const r = b.getBoundingClientRect(); return r.width >= 30 && r.height >= 20 && r.right <= innerWidth && r.left >= 0; })));
  ok('celular: sem rolagem horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (shots) await p.screenshot({ path: path.join(shots, 'idiomas-celular.png'), clip: { x: 0, y: 0, width: 390, height: 260 } });
  await ctx.close();

  await b.close();
  console.log(fails ? `${fails} FALHA(S)` : 'ok: todos os testes dos idiomas passaram');
  process.exit(fails ? 1 : 0);
})();
