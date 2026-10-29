/* Lado JavaScript do teste de paridade com o Python. Lê casos em JSON no stdin, devolve resultados em JSON no stdout. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const grab = re => { const m = src.match(re); if (!m) throw new Error('trecho não encontrado: ' + re); return m[0]; };
const code = [
  'const tt = (s, ...a) => a.length ? s.replace(/\\{(\\d+)\\}/g, (_, i) => a[+i]) : s;',
  grab(/const HOUR = 3600;\n/),
  grab(/const PONTOS_PT = [^\n]*\n/), grab(/const PONTOS_EN = [^\n]*\n/), grab(/const PONTOS16 = [^\n]*\n/), grab(/const pontoDe = [^\n]*\n/), grab(/function dirBlocked\([\s\S]*?\n\}\n/), grab(/const rangesOf = [^\n]*\n/),
  grab(/function normalizeLimits\(raw\) \{[\s\S]*?\n\}\n/),
  grab(/function sunUtc\([\s\S]*?\n\}\n/), grab(/function daylightIntervals\([\s\S]*?\n\}\n/), grab(/const isDaylight = [^\n]*\n/),
  grab(/function evaluateHour\(row, L, day\) \{[\s\S]*?\n\}\n/),
  grab(/const maxv = [^\n]*\n/), grab(/function windowsOf\([\s\S]*?\n\}\n/), grab(/function analyze\([\s\S]*?\n\}\n/),
].join('\n') + '\nreturn { normalizeLimits, daylightIntervals, evaluateHour, analyze };';
const { normalizeLimits, daylightIntervals, evaluateHour, analyze } = new Function(code)();

const entrada = JSON.parse(fs.readFileSync(0, 'utf8'));
const tenta = f => { try { return { ok: f() }; } catch (e) { return { erro: String(e.message || e) }; } };
const saida = {
  limites: entrada.limites.map(l => tenta(() => normalizeLimits(l))),
  sol: entrada.sol.map(c => tenta(() => daylightIntervals(c.lat, c.lon, c.ini, c.fim))),
  horas: entrada.horas.map(c => tenta(() => { const L = normalizeLimits(c.limites); const dia = L.daylight_only ? daylightIntervals(c.lat, c.lon, c.row.ts, c.row.ts + 3600) : null; return evaluateHour(c.row, L, dia); })),
  analises: entrada.analises.map(c => tenta(() => analyze(c.fontes, c.limites, c.lat, c.lon, c.ini, c.fim))),
};
process.stdout.write(JSON.stringify(saida));
