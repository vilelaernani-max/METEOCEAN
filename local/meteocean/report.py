"""Gera o relatório estático: um único HTML autocontido (CSS + SVG embutidos, sem JS)."""
import html
from datetime import datetime, timezone, timedelta

HOUR = 3600
WD = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
LINE_CLASSES = ["l1", "l2", "l3", "l4", "l5"]

CSS = """
:root{--bg:#fff;--fg:#1c2530;--mut:#5b6773;--line:#d9dee4;--card:#f6f8fa;--go:#2e8b57;--nogo:#c8453b;--nod:#aeb6bf;
--c1:#1f6fb2;--c2:#d9822b;--c3:#7b4fa6;--c4:#2a9d8f;--c5:#b5476b;--warn:#b26a00;--warnbg:#fff4e0}
@media (prefers-color-scheme:dark){:root{--bg:#14181d;--fg:#e6eaee;--mut:#9aa5b1;--line:#2d353e;--card:#1c2229;
--go:#47b378;--nogo:#e0675d;--nod:#5d6773;--c1:#5aa9e6;--c2:#f0a050;--c3:#b08ae0;--c4:#4fc4b5;--c5:#e07a9c;--warn:#f0b050;--warnbg:#33290f}}
@media print{:root{--bg:#fff;--fg:#000;--card:#f4f4f4}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1020px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
.sub{color:var(--mut);margin:0 0 12px}.meta{display:flex;flex-wrap:wrap;gap:6px 24px;color:var(--mut);font-size:13px}
.meta b{color:var(--fg)}.tag{display:inline-block;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:0 9px;font-size:12px;margin-right:4px}
.verdict{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--go);border-radius:8px;padding:12px 16px;margin:16px 0}
.verdict.none{border-left-color:var(--nogo)}.verdict h3{margin:0 0 4px;font-size:16px}
.alert{background:var(--warnbg);border:1px solid var(--warn);color:var(--fg);border-radius:8px;padding:8px 14px;margin:8px 0;font-size:14px}
table{border-collapse:collapse;width:100%;font-size:13.5px;margin:8px 0}th,td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.03em}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
svg{width:100%;height:auto;display:block}svg text{fill:var(--fg);font-family:inherit}svg .mut{fill:var(--mut)}
.go{fill:var(--go)}.nogo{fill:var(--nogo)}.nod{fill:var(--nod)}.grid{stroke:var(--line);stroke-width:1}
.lim{stroke:var(--nogo);stroke-width:1.2;stroke-dasharray:5 4}
.l1{stroke:var(--c1)}.l2{stroke:var(--c2)}.l3{stroke:var(--c3)}.l4{stroke:var(--c4)}.l5{stroke:var(--c5)}
.k1{fill:var(--c1)}.k2{fill:var(--c2)}.k3{fill:var(--c3)}.k4{fill:var(--c4)}.k5{fill:var(--c5)}
.ln{fill:none;stroke-width:1.6}.legend{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:13px;margin:4px 0 8px}
.sw{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.sw.go{background:var(--go)}.sw.nogo{background:var(--nogo)}.sw.nod{background:var(--nod)}
details{margin:6px 0}summary{cursor:pointer}pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px;font-size:12.5px}
.foot{color:var(--mut);font-size:12.5px;margin-top:32px;border-top:1px solid var(--line);padding-top:12px}
.mine{color:var(--warn);font-weight:600}
"""


def esc(x):
    return html.escape("" if x is None else str(x))


def num(v, d=1, unit=""):
    return "–" if v is None else f"{v:.{d}f}{unit}"


def local(ts, tz):
    return datetime.fromtimestamp(ts, tz=timezone.utc) + timedelta(hours=tz)


def fmt(ts, tz, with_date=True):
    d = local(ts, tz)
    s = f"{d:%H:%M}"
    return f"{WD[d.weekday()]} {d:%d/%m} {s}" if with_date else s


def tzlabel(tz):
    sign = "+" if tz >= 0 else "−"
    return f"UTC{sign}{abs(tz):g}"


# ---------------- gráficos SVG ----------------

def _day_ticks(grid, tz):
    ticks = []
    for i, ts in enumerate(grid):
        d = local(ts, tz)
        if d.hour == 0 or i == 0:
            ticks.append((i, d, d.hour == 0))
    return ticks


def timeline_svg(res, tz, rows):
    """rows: [(rótulo, lista_de_status)]. Uma célula por hora."""
    grid = res["grid"]
    n = len(grid)
    left, right, rowh, top = 178, 12, 22, 34
    W = 980
    cw = (W - left - right) / n
    H = top + rowh * len(rows) + 8
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Linha do tempo GO / NO-GO por fonte">']
    for i, d, midnight in _day_ticks(grid, tz):
        x = left + i * cw
        out.append(f'<line class="grid" x1="{x:.1f}" y1="{top - 6}" x2="{x:.1f}" y2="{H - 6}"/>')
        if midnight and (n - i) * cw > 34:
            out.append(f'<text class="mut" x="{x + 3:.1f}" y="{top - 12}" font-size="11">{WD[d.weekday()]} {d:%d/%m}</text>')
    for r, (label, status) in enumerate(rows):
        y = top + r * rowh
        bold = ' font-weight="600"' if r == 0 else ""
        out.append(f'<text x="{left - 8}" y="{y + 14}" font-size="12" text-anchor="end"{bold}>{esc(label)}</text>')
        for i, s in enumerate(status):
            cls = {"go": "go", "nogo": "nogo"}.get(s, "nod")
            out.append(f'<rect class="{cls}" x="{left + i * cw:.2f}" y="{y}" width="{cw + 0.35:.2f}" height="{rowh - 5}"/>')
    out.append("</svg>")
    return "".join(out)


def _nice_max(v):
    for c in (1, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200):
        if v <= c:
            return float(c)
    return float(int(v) + 1)


def line_chart_svg(res, tz, key, title, unit, limit, aria):
    grid = res["grid"]
    n = len(grid)
    series = [(s["label"], s[key]) for s in res["sources"]]
    vals = [v for _, arr in series for v in arr if v is not None]
    if limit is not None:
        vals.append(limit)
    if not vals:
        return f'<p class="sub">Sem dados de {esc(title.lower())} neste ponto.</p>'
    ymax = _nice_max(max(vals) * 1.08)
    W, H, left, right, top, bot = 980, 230, 46, 12, 14, 26
    pw, ph = W - left - right, H - top - bot

    def X(i):
        return left + (i / max(n - 1, 1)) * pw

    def Y(v):
        return top + ph - (v / ymax) * ph

    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(aria)}">']
    steps = 5
    for k in range(steps + 1):
        v = ymax * k / steps
        y = Y(v)
        out.append(f'<line class="grid" x1="{left}" y1="{y:.1f}" x2="{W - right}" y2="{y:.1f}"/>')
        out.append(f'<text class="mut" x="{left - 6}" y="{y + 4:.1f}" font-size="11" text-anchor="end">{v:g}</text>')
    out.append(f'<text class="mut" x="4" y="10" font-size="11">{esc(unit)}</text>')
    for i, d, midnight in _day_ticks(grid, tz):
        if midnight:
            x = X(i)
            out.append(f'<line class="grid" x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + ph}"/>')
            if (n - i) / n * pw > 40:
                out.append(f'<text class="mut" x="{x + 3:.1f}" y="{H - 8}" font-size="11">{WD[d.weekday()]} {d:%d/%m}</text>')
    if limit is not None:
        out.append(f'<line class="lim" x1="{left}" y1="{Y(limit):.1f}" x2="{W - right}" y2="{Y(limit):.1f}"/>')
        out.append(f'<text x="{W - right - 4}" y="{Y(limit) - 4:.1f}" font-size="11" text-anchor="end" style="fill:var(--nogo)">limite {limit:g} {esc(unit)}</text>')
    for si, (label, arr) in enumerate(series):
        cls = LINE_CLASSES[si % len(LINE_CLASSES)]
        seg = []
        for i, v in enumerate(arr + [None]):
            if v is None:
                if len(seg) > 1:
                    out.append(f'<polyline class="ln {cls}" points="{" ".join(seg)}"/>')
                elif len(seg) == 1:
                    x, y = seg[0].split(",")
                    out.append(f'<circle class="k{cls[1]}" cx="{x}" cy="{y}" r="1.8"/>')
                seg = []
            else:
                seg.append(f"{X(i):.1f},{Y(v):.1f}")
    out.append("</svg>")
    leg = "".join(f'<span><i class="sw" style="background:var(--c{(i % 5) + 1})"></i>{esc(lbl)}</span>'
                  for i, (lbl, _) in enumerate(series))
    return f'<div class="legend">{leg}</div>' + "".join(out)


# ---------------- seções ----------------

def _windows_table(wins, grid, tz, show_sources=False):
    if not wins:
        return '<p class="sub">Nenhuma janela.</p>'
    head = ("<tr><th>Início</th><th>Fim</th><th class='n'>Duração</th><th class='n'>Hs máx (m)</th>"
            "<th class='n'>Vento máx (kn)</th><th class='n'>Rajada máx (kn)</th>"
            + ("<th class='n'>Fontes</th>" if show_sources else "") + "</tr>")
    rows = []
    for w in wins:
        start, end = grid[w["i0"]], grid[w["i1"] - 1] + HOUR
        rows.append(f"<tr><td>{fmt(start, tz)}</td><td>{fmt(end, tz)}</td><td class='n'>{w['hours']} h</td>"
                    f"<td class='n'>{num(w['max_hs'])}</td><td class='n'>{num(w['max_wind'], 0)}</td>"
                    f"<td class='n'>{num(w['max_gust'], 0)}</td>"
                    + (f"<td class='n'>{w['min_sources']}</td>" if show_sources else "") + "</tr>")
    return f"<table>{head}{''.join(rows)}</table>"


def _limits_table(lm):
    def v(x, u=""):
        return "não usado" if x is None else f"{x:g} {u}".strip()
    rows = [("Hs máxima", v(lm["hs_max"], "m")), ("Tp mínima", v(lm["tp_min"], "s")),
            ("Vento máximo (10 m)", v(lm["wind_max"], "kn")), ("Rajada máxima", v(lm["gust_max"], "kn")),
            ("Somente diurno", "sim" if lm["daylight_only"] else "não"),
            ("Janela mínima", f"{lm['min_window_h']} h seguidas")]
    return "<table>" + "".join(f"<tr><td>{a}</td><td>{esc(b)}</td></tr>" for a, b in rows) + "</table>"


def _navy_section(ctx, tz):
    ws, info = ctx["navy_warnings"], ctx["navy_info"]
    mine = [a.strip().upper() for a in (ctx["location"].get("areas") or "").split(",") if a.strip()]
    out = []
    if not ws:
        out.append('<p class="sub">Nenhum aviso de mau tempo registrado com vigência dentro do período.</p>')
    for w in ws:
        text_up = (w["text"] or "").upper()
        is_mine = bool(mine) and any(a in (w["areas"] or []) or a in text_up for a in mine)
        v_from = fmt(w["valid_from_ts"], tz) if w["valid_from_ts"] else "?"
        v_to = fmt(w["valid_to_ts"], tz) if w["valid_to_ts"] else "não identificada"
        areas = ", ".join(w["areas"]) if w["areas"] else "não identificadas"
        flag = ' <span class="mine">· na sua área</span>' if is_mine else ""
        out.append(f"<details {'open' if is_mine else ''}><summary><b>Aviso {esc(w['number'])}</b> — {esc(w['kind'] or '')}"
                   f"{flag}<br><small class='sub'>vigência {v_from} → {v_to} ({tzlabel(tz)}) · áreas: {esc(areas)}</small></summary>"
                   f"<pre>{esc(w['text'])}</pre></details>")
    if ws and not mine:
        out.append('<p class="sub">Dica: informe a(s) área(s) da Marinha no cadastro do local (ex.: GOLF, COSTEIRA) '
                   'para destacar os avisos relevantes. Os avisos abaixo valem para toda a METAREA V.</p>')
    last = info.get("last_fetch")
    last_s = (datetime.fromtimestamp(last, tz=timezone.utc).strftime("%d/%m/%Y %H:%MZ") if last else "nunca")
    out.append(f'<p class="sub">Fonte: <a href="{esc(info.get("url"))}">Marinha do Brasil / CHM — Avisos de Mau Tempo</a> · '
               f'última coleta: {last_s} · situação: {esc(info.get("status"))}</p>')
    return "".join(out)


def build_html(ctx):
    res, tz = ctx["result"], ctx["location"]["tz_offset"]
    grid, lm = res["grid"], res["limits"]
    errors = ctx["errors"]
    cons = res["conservative"]
    cw = cons["windows"]
    start_l, end_l = fmt(grid[0], tz), fmt(grid[-1] + HOUR, tz)
    tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in ctx["tags"]) or "—"

    # alertas
    alerts = []
    if any((s.get("meta") or {}).get("demo") for s in res["sources"]):
        alerts.append("<b>DADOS DE DEMONSTRAÇÃO (sintéticos).</b> Este relatório não reflete previsão real "
                      "e não deve ser usado para decisão.")
    for e in errors:
        alerts.append(f"<b>Fonte indisponível:</b> {esc(e['label'])} — {esc(e['error'])}")
    for s in res["sources"]:
        if s.get("note") and not (s.get("meta") or {}).get("demo"):
            alerts.append(f"<b>{esc(s['label'])}:</b> {esc(s['note'])}")
        if s["n_nodata"]:
            alerts.append(f"<b>{esc(s['label'])}:</b> {s['n_nodata']} h sem dado de algum parâmetro limitado "
                          "(tratadas como não-GO).")
    ni = ctx["navy_info"]
    if ni.get("status", "").startswith("formato_nao_reconhecido"):
        alerts.append("<b>Avisos da Marinha:</b> a página foi baixada, mas o formato não foi reconhecido. "
                      "Confira os avisos no site oficial antes de decidir.")
    elif ni.get("status", "").startswith("erro"):
        alerts.append(f"<b>Avisos da Marinha:</b> falha na última coleta ({esc(ni['status'])}). "
                      "Os avisos abaixo podem estar desatualizados.")
    elif ctx["navy_stale"]:
        alerts.append("<b>Avisos da Marinha:</b> última coleta há mais de 7 dias ou nunca feita; "
                      "confira o site oficial.")
    if len(res["sources"]) == 1:
        alerts.append("Apenas <b>uma fonte</b> disponível: não há comparação nem cenário conservador real.")
    for w in cw:
        if w["min_sources"] < len(res["sources"]):
            alerts.append(f"A janela de {fmt(grid[w['i0']], tz)} tem horas com menos fontes do que o total "
                          f"(mínimo {w['min_sources']} de {len(res['sources'])}); previsão mais incerta.")
            break
    alert_html = "".join(f'<div class="alert">{a}</div>' for a in alerts)

    # veredito
    if cw:
        longest = max(cw, key=lambda w: w["hours"])
        verdict = (f'<div class="verdict"><h3>{len(cw)} janela(s) operacional(is) no cenário conservador</h3>'
                   f'Primeira: {fmt(grid[cw[0]["i0"]], tz)} · mais longa: {longest["hours"]} h '
                   f'({fmt(grid[longest["i0"]], tz)}). Cenário conservador = todas as fontes dentro dos limites.</div>')
    else:
        extra = ""
        if res["optimistic"]["windows"]:
            extra = (f' Há {len(res["optimistic"]["windows"])} janela(s) se considerar a fonte mais favorável '
                     '(veja a tabela otimista).')
        verdict = (f'<div class="verdict none"><h3>Nenhuma janela de {lm["min_window_h"]} h seguidas '
                   f'no cenário conservador</h3>Nenhum período atende simultaneamente a todas as fontes.{extra}</div>')

    rows = [("Conservador", cons["status"]), ("Otimista", res["optimistic"]["status"])] + \
           [(s["label"], s["status"]) for s in res["sources"]]
    legend = ('<div class="legend"><span><i class="sw go"></i>GO</span><span><i class="sw nogo"></i>NO-GO</span>'
              '<span><i class="sw nod"></i>sem dado</span></div>')

    # fontes
    src_rows = []
    for s in res["sources"]:
        fa = (datetime.fromtimestamp(s["fetched_at"], tz=timezone.utc).strftime("%d/%m %H:%MZ")
              if s.get("fetched_at") else "–")
        m = s.get("meta") or {}
        model = (f"{m.get('wind_model')} / {m.get('wave_model')}" if "wind_model" in m
                 else ("demonstração" if m.get("demo") else "–"))
        src_rows.append(f"<tr><td>{esc(s['label'])}</td><td>{esc(model)}</td><td>{fa}</td>"
                        f"<td class='n'>{s['n_go']}</td><td class='n'>{s['n_nogo']}</td><td class='n'>{s['n_nodata']}</td>"
                        f"<td class='n'>{len(s['windows'])}</td></tr>")
    src_table = ("<table><tr><th>Fonte</th><th>Modelos (vento / onda)</th><th>Coletado (UTC)</th>"
                 "<th class='n'>h GO</th><th class='n'>h NO-GO</th><th class='n'>h sem dado</th>"
                 "<th class='n'>Janelas</th></tr>" + "".join(src_rows) + "</table>")

    ag = res["agreement"]
    if ag["pct"] is None:
        ag_txt = "Concordância não calculável (menos de duas fontes com dados)."
    else:
        ag_txt = (f"As fontes decidiram igual (GO ou NO-GO) em <b>{ag['pct']:.0f}%</b> das {ag['compared']} horas "
                  f"comparáveis; divergiram em {ag['disagree']} h. Divergência alta significa previsão incerta: "
                  "prefira o cenário conservador.")

    per_source = "".join(
        f"<h3 style='font-size:14px;margin:14px 0 2px'>{esc(s['label'])}</h3>"
        f"{_windows_table(s['windows'], grid, tz)}"
        + (f"<p class='sub'>{s['dropped_short']} trecho(s) GO menor(es) que {lm['min_window_h']} h descartado(s).</p>"
           if s["dropped_short"] else "")
        for s in res["sources"])

    gen = datetime.fromtimestamp(ctx["generated_ts"], tz=timezone.utc)
    body = f"""
<h1>Relatório MetOcean — {esc(ctx['location']['name'])}</h1>
<p class="sub">Análise sob demanda de janelas operacionais</p>
<div class="meta">
 <span>Ponto: <b>{ctx['location']['lat']:.4f}°, {ctx['location']['lon']:.4f}°</b></span>
 <span>Operação: <b>{esc(ctx['profile_name'])}</b></span>
 <span>Período: <b>{start_l} → {end_l}</b> ({tzlabel(tz)})</span>
 <span>Tags: {tags}</span>
 <span>Gerado: <b>{gen:%d/%m/%Y %H:%M}Z</b></span>
</div>
{alert_html}
{verdict}
<h2>Janelas — cenário conservador</h2>
{_windows_table(cw, grid, tz, show_sources=True)}
<h2>Linha do tempo por fonte</h2>
{legend}
{timeline_svg(res, tz, rows)}
<h2>Altura significativa de onda (Hs)</h2>
{line_chart_svg(res, tz, 'hs', 'Hs', 'm', lm['hs_max'], 'Hs por fonte com o limite operacional')}
<h2>Vento a 10 m</h2>
{line_chart_svg(res, tz, 'wind', 'Vento', 'kn', lm['wind_max'], 'Vento por fonte com o limite operacional')}
<h2>Comparação entre fontes</h2>
<p>{ag_txt}</p>
{src_table}
<details><summary>Janelas de cada fonte</summary>{per_source}</details>
<details><summary>Cenário otimista (qualquer fonte dentro dos limites)</summary>
{_windows_table(res['optimistic']['windows'], grid, tz, show_sources=True)}</details>
<h2>Avisos de Mau Tempo da Marinha</h2>
{_navy_section(ctx, tz)}
<h2>Limites aplicados</h2>
{_limits_table(lm)}
<p class="foot">Apoio à decisão: não substitui o julgamento do responsável pela operação, os boletins oficiais
nem a observação local. Horários exibidos em {tzlabel(tz)}; dados originais em UTC. Previsões de vento e onda:
Open-Meteo (modelos NOAA, ECMWF e outros). Previsão envelhece: gere de novo perto da operação.</p>"""
    return (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>MetOcean — {esc(ctx["location"]["name"])} — {gen:%d/%m/%Y}</title>'
            f'<style>{CSS}</style></head><body><main>{body}</main></body></html>')
