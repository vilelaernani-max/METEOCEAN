'use strict';
/* MetOcean OP — interface. Sem frameworks; todo texto de usuário entra via textContent. */

const $ = (s, r = document) => r.querySelector(s);

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}

async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (method !== 'GET') { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body || {}); }
  const r = await fetch(url, opt);
  let data = null;
  try { data = await r.json(); } catch (e) { /* sem corpo */ }
  if (!r.ok) throw new Error((data && data.error) || `Erro HTTP ${r.status}`);
  return data;
}

const fmtDT = ts => new Date(ts * 1000).toLocaleString('pt-BR',
  { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const STATUS = { queued: 'Na fila', collecting: 'Coletando previsões…', analyzing: 'Analisando…', done: 'Pronto', error: 'Erro' };

const state = { locations: [], profiles: [], tags: [], selLoc: null, selProf: null, app: {} };
let map = null, pick = null, savedLayer = null, pollTimer = null;

/* ---------- tags ---------- */
function refreshTagList() {
  let dl = $('#taglist');
  if (!dl) { dl = el('datalist', { id: 'taglist' }); document.body.append(dl); }
  dl.replaceChildren(...state.tags.map(t => el('option', { value: t })));
}

function TagInput(host) {
  let tags = [];
  const input = el('input', { type: 'text', placeholder: 'adicionar tag e Enter', list: 'taglist', 'aria-label': 'Adicionar tag' });
  const wrap = el('div', { class: 'tags' });
  host.replaceChildren(wrap);
  function draw() {
    wrap.replaceChildren(
      ...tags.map(t => el('span', { class: 'chip' }, t,
        el('button', { type: 'button', 'aria-label': `Remover tag ${t}`, onclick: () => { tags = tags.filter(x => x !== t); draw(); } }, '×'))),
      input);
  }
  function add(raw) {
    for (const t of raw.split(',')) {
      const v = t.trim().slice(0, 30);
      if (v && !tags.some(x => x.toLowerCase() === v.toLowerCase())) tags.push(v);
    }
    draw();
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); input.value = ''; input.focus(); }
    else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); draw(); input.focus(); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) { add(input.value); input.value = ''; } });
  draw();
  return { get: () => { if (input.value.trim()) { add(input.value); input.value = ''; } return [...tags]; },
           set: arr => { tags = [...(arr || [])]; draw(); } };
}

/* ---------- abas ---------- */
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tabpanel').forEach(p => { p.hidden = p.id !== `tab-${name}`; });
  if (name === 'historico') loadHistory();
  if (name === 'marinha') loadNavy();
}
const currentTab = () => (document.querySelector('.tabs button[aria-selected=true]') || {}).dataset?.tab;

/* ---------- mapa ---------- */
function initMap() {
  if (typeof L === 'undefined') {
    $('#map').replaceChildren(el('p', { class: 'hint', style: 'padding:16px' },
      'Mapa indisponível (sem acesso a unpkg.com / OpenStreetMap). Digite as coordenadas na aba Locais.'));
    return;
  }
  map = L.map('map').setView([-15, -47], 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  savedLayer = L.layerGroup().addTo(map);
  map.on('click', e => { setPoint(e.latlng.lat, e.latlng.lng, true); if (currentTab() === 'analise') showTab('locais'); $('#loc-name').focus(); });
}

function setPoint(lat, lon, fromMap) {
  lat = Math.round(lat * 10000) / 10000; lon = Math.round(lon * 10000) / 10000;
  $('#loc-lat').value = lat; $('#loc-lon').value = lon;
  if (!map) return;
  if (!pick) {
    pick = L.marker([lat, lon], { draggable: true }).addTo(map);
    pick.on('dragend', () => { const p = pick.getLatLng(); setPoint(p.lat, p.lng, true); });
  } else pick.setLatLng([lat, lon]);
  if (!fromMap) map.setView([lat, lon], Math.max(map.getZoom(), 7));
}

function drawSaved() {
  if (!savedLayer) return;
  savedLayer.clearLayers();
  for (const l of state.locations) {
    const m = L.circleMarker([l.lat, l.lon], { radius: 6, weight: 2, color: '#0f4c75', fillOpacity: .6 }).addTo(savedLayer);
    m.bindTooltip(l.name);
    m.on('click', () => selectLocation(l.id));
  }
}

/* ---------- locais ---------- */
let locTags, anTags;

function locationsChanged() {
  $('#an-location').replaceChildren(...state.locations.map(l => el('option', { value: l.id }, l.name)));
  if (state.selLoc) $('#an-location').value = state.selLoc;
  $('#loc-list').replaceChildren(...state.locations.map(l =>
    el('li', { class: l.id === state.selLoc ? 'sel' : '' },
      el('div', { class: 't' }, l.name),
      el('div', { class: 'm' }, `${l.lat.toFixed(4)}°, ${l.lon.toFixed(4)}° · UTC${l.tz_offset >= 0 ? '+' : ''}${l.tz_offset}`),
      el('div', {}, ...(l.tags || []).map(t => el('span', { class: 'tag' }, t))),
      el('div', { class: 'act' }, el('button', { class: 'lnk', onclick: () => selectLocation(l.id) }, 'Editar / ver no mapa')))));
  if (!state.locations.length) $('#loc-list').replaceChildren(el('li', {}, 'Nenhum local salvo ainda. Clique no mapa para começar.'));
  drawSaved();
}

function selectLocation(id) {
  const l = state.locations.find(x => x.id === id);
  if (!l) return;
  state.selLoc = id;
  $('#loc-name').value = l.name; $('#loc-tz').value = l.tz_offset; $('#loc-areas').value = l.areas || '';
  locTags.set(l.tags);
  setPoint(l.lat, l.lon, false);
  $('#an-location').value = id;
  anTags.set(l.tags);
  locationsChanged();
}

function newLocation() {
  state.selLoc = null;
  $('#form-local').reset(); $('#loc-tz').value = -3; locTags.set([]);
  locationsChanged();
}

async function loadLocations() {
  state.locations = await api('GET', '/api/locations');
  state.tags = await api('GET', '/api/tags');
  refreshTagList();
  locationsChanged();
}

async function saveLocation(e) {
  e.preventDefault();
  const body = { name: $('#loc-name').value, lat: $('#loc-lat').value, lon: $('#loc-lon').value,
    tz_offset: $('#loc-tz').value, areas: $('#loc-areas').value, tags: locTags.get() };
  try {
    const saved = state.selLoc ? await api('PUT', `/api/locations/${state.selLoc}`, body) : await api('POST', '/api/locations', body);
    state.selLoc = saved.id;
    await loadLocations();
    selectLocation(saved.id);
  } catch (err) { alert(err.message); }
}

async function deleteLocation() {
  if (!state.selLoc || !confirm('Excluir este local? As análises antigas continuam no histórico.')) return;
  try { await api('DELETE', `/api/locations/${state.selLoc}`); newLocation(); await loadLocations(); } catch (err) { alert(err.message); }
}

/* ---------- perfis ---------- */
const numOrNull = id => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };

function profilesChanged() {
  const opts = state.profiles.map(p => el('option', { value: p.id }, p.name));
  $('#pf-select').replaceChildren(...opts.map(o => o.cloneNode(true)));
  $('#an-profile').replaceChildren(...opts);
  if (state.selProf) { $('#pf-select').value = state.selProf; $('#an-profile').value = state.selProf; }
}

function fillProfile(id) {
  const p = state.profiles.find(x => x.id === Number(id));
  if (!p) return;
  state.selProf = p.id;
  const l = p.limits;
  $('#pf-name').value = p.name; $('#pf-hs').value = l.hs_max ?? ''; $('#pf-tp').value = l.tp_min ?? '';
  $('#pf-wind').value = l.wind_max ?? ''; $('#pf-gust').value = l.gust_max ?? '';
  $('#pf-win').value = l.min_window_h; $('#pf-day').checked = !!l.daylight_only;
  $('#pf-select').value = p.id; $('#an-profile').value = p.id;
}

function newProfile() {
  state.selProf = null;
  $('#form-perfil').reset(); $('#pf-hs').value = 1.5; $('#pf-wind').value = 20; $('#pf-win').value = 4;
}

async function loadProfiles() {
  state.profiles = await api('GET', '/api/profiles');
  if (!state.selProf && state.profiles.length) state.selProf = state.profiles[0].id;
  profilesChanged();
  fillProfile(state.selProf);
}

async function saveProfile(e) {
  e.preventDefault();
  const body = { name: $('#pf-name').value, limits: { hs_max: numOrNull('#pf-hs'), tp_min: numOrNull('#pf-tp'),
    wind_max: numOrNull('#pf-wind'), gust_max: numOrNull('#pf-gust'),
    min_window_h: $('#pf-win').value, daylight_only: $('#pf-day').checked } };
  try {
    const saved = state.selProf ? await api('PUT', `/api/profiles/${state.selProf}`, body) : await api('POST', '/api/profiles', body);
    state.selProf = saved.id;
    await loadProfiles();
  } catch (err) { alert(err.message); }
}

async function deleteProfile() {
  if (!state.selProf || !confirm('Excluir este perfil de limites?')) return;
  try { await api('DELETE', `/api/profiles/${state.selProf}`); state.selProf = null; await loadProfiles(); } catch (err) { alert(err.message); }
}

/* ---------- análises ---------- */
function summaryLine(a) {
  const s = a.summary;
  if (a.status !== 'done' || !s) return null;
  const parts = [`${s.conservative_windows} janela(s) conservadora(s)`];
  if (s.longest_window_h) parts.push(`mais longa ${s.longest_window_h} h`);
  if (s.agreement_pct !== null && s.agreement_pct !== undefined) parts.push(`concordância ${Math.round(s.agreement_pct)}%`);
  if (s.sources_failed) parts.push(`${s.sources_failed} fonte(s) falharam`);
  return parts.join(' · ');
}

function analysisItem(a, withDelete) {
  const cls = a.status === 'done' ? 'st-done' : a.status === 'error' ? 'st-error' : 'st-run';
  return el('li', {},
    el('div', { class: 't' }, `${a.location_name} — ${a.profile_name}`),
    el('div', { class: 'm' }, `${fmtDT(a.start_ts)} → ${fmtDT(a.end_ts)}`),
    el('div', { class: cls }, STATUS[a.status] || a.status, a.error ? ` — ${a.error}` : ''),
    summaryLine(a) ? el('div', { class: 'm' }, summaryLine(a)) : null,
    el('div', {}, ...(a.tags || []).map(t => el('span', { class: 'tag' }, t))),
    el('div', { class: 'act' },
      a.report_url ? el('a', { href: a.report_url, target: '_blank', rel: 'noopener' }, 'Abrir relatório') : null,
      withDelete ? el('button', { class: 'lnk del', onclick: () => deleteAnalysis(a.id) }, 'Excluir') : null));
}

async function submitAnalysis(e) {
  e.preventDefault();
  const btn = $('#an-submit');
  btn.disabled = true;
  try {
    const a = await api('POST', '/api/analyses', { location_id: Number($('#an-location').value),
      profile_id: Number($('#an-profile').value), days: Number($('#an-days').value), tags: anTags.get() });
    $('#an-status').replaceChildren(el('div', { class: 'box' }, analysisItem(a, false)));
    trackAnalysis(a.id);
  } catch (err) { $('#an-status').replaceChildren(el('div', { class: 'box st-error' }, err.message)); }
  finally { btn.disabled = false; }
}

async function trackAnalysis(id) {
  clearTimeout(pollTimer);
  try {
    const a = await api('GET', `/api/analyses/${id}`);
    $('#an-status').replaceChildren(el('div', { class: 'box' }, el('ul', { class: 'list' }, analysisItem(a, false))));
    if (!['done', 'error'].includes(a.status)) pollTimer = setTimeout(() => trackAnalysis(id), 2000);
    else { state.tags = await api('GET', '/api/tags'); refreshTagList(); }
  } catch (err) { $('#an-status').replaceChildren(el('div', { class: 'box st-error' }, err.message)); }
}

async function loadHistory() {
  try {
    const tag = $('#hist-tag').value;
    const list = await api('GET', '/api/analyses' + (tag ? `?tag=${encodeURIComponent(tag)}` : ''));
    state.tags = await api('GET', '/api/tags'); refreshTagList();
    const sel = $('#hist-tag'), keep = sel.value;
    sel.replaceChildren(el('option', { value: '' }, 'todas'), ...state.tags.map(t => el('option', { value: t }, t)));
    sel.value = keep;
    $('#hist-list').replaceChildren(...(list.length ? list.map(a => analysisItem(a, true)) : [el('li', {}, 'Nenhuma análise ainda.')]));
    if (list.some(a => !['done', 'error'].includes(a.status)) && currentTab() === 'historico') setTimeout(loadHistory, 3000);
  } catch (err) { $('#hist-list').replaceChildren(el('li', { class: 'st-error' }, err.message)); }
}

async function deleteAnalysis(id) {
  if (!confirm('Excluir esta análise e o relatório gerado?')) return;
  try { await api('DELETE', `/api/analyses/${id}`); loadHistory(); } catch (err) { alert(err.message); }
}

/* ---------- Marinha ---------- */
function navyBanner(info, stale) {
  const b = $('#navy-banner');
  const st = info.status || '';
  let msg = null;
  if (st.startsWith('formato_nao_reconhecido')) msg = 'Avisos da Marinha: a página mudou de formato e não foi reconhecida. Confira o site oficial.';
  else if (st.startsWith('erro')) msg = `Avisos da Marinha: falha na última coleta (${st}).`;
  else if (stale) msg = 'Avisos da Marinha: sem coleta recente (mais de 7 dias). Abra a aba Marinha e clique em Buscar agora.';
  b.hidden = !msg;
  if (msg) b.textContent = msg;
}

async function loadNavy() {
  try {
    const d = await api('GET', '/api/navy');
    const last = d.info.last_fetch ? new Date(d.info.last_fetch * 1000).toLocaleString('pt-BR') : 'nunca';
    $('#navy-info').textContent = `Última coleta: ${last} · ${d.info.status}`;
    $('#navy-list').replaceChildren(...(d.warnings.length ? d.warnings.map(w => el('li', {},
      el('div', { class: 't' }, `Aviso ${w.number} — ${w.kind || ''}`),
      el('div', { class: 'm' }, `Áreas: ${(w.areas || []).join(', ') || 'não identificadas'}`
        + (w.valid_to_ts ? ` · válido até ${fmtDT(w.valid_to_ts)}` : ' · validade não identificada')),
      el('details', {}, el('summary', {}, 'Texto original'), el('pre', { style: 'white-space:pre-wrap;font-size:12px' }, w.text))))
      : [el('li', {}, 'Nenhum aviso vigente registrado.')]));
    navyBanner(d.info, d.stale && !state.app.demo);
  } catch (err) { $('#navy-info').textContent = err.message; }
}

async function refreshNavy() {
  const b = $('#navy-refresh'); b.disabled = true; $('#navy-info').textContent = 'Buscando…';
  try { const r = await api('POST', '/api/navy/refresh', {}); await loadNavy(); $('#navy-info').textContent += ` · ${r.found} aviso(s) lido(s), ${r.new} novo(s)`; }
  catch (err) { $('#navy-info').textContent = err.message; } finally { b.disabled = false; }
}

async function pasteNavy() {
  try { const r = await api('POST', '/api/navy/paste', { text: $('#navy-text').value }); $('#navy-text').value = ''; await loadNavy(); $('#navy-info').textContent += ` · ${r.found} aviso(s) lido(s), ${r.new} novo(s)`; }
  catch (err) { alert(err.message); }
}

/* ---------- início ---------- */
async function init() {
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  locTags = TagInput($('#loc-tags')); anTags = TagInput($('#an-tags'));
  initMap();
  $('#form-local').addEventListener('submit', saveLocation);
  $('#loc-new').addEventListener('click', newLocation);
  $('#loc-del').addEventListener('click', deleteLocation);
  ['#loc-lat', '#loc-lon'].forEach(s => $(s).addEventListener('change', () => {
    const la = parseFloat($('#loc-lat').value), lo = parseFloat($('#loc-lon').value);
    if (isFinite(la) && isFinite(lo)) setPoint(la, lo, false);
  }));
  $('#form-perfil').addEventListener('submit', saveProfile);
  $('#pf-select').addEventListener('change', e => fillProfile(e.target.value));
  $('#an-profile').addEventListener('change', e => fillProfile(e.target.value));
  $('#an-location').addEventListener('change', e => selectLocation(Number(e.target.value)));
  $('#pf-new').addEventListener('click', newProfile);
  $('#pf-del').addEventListener('click', deleteProfile);
  $('#form-analise').addEventListener('submit', submitAnalysis);
  $('#hist-tag').addEventListener('change', loadHistory);
  $('#navy-refresh').addEventListener('click', refreshNavy);
  $('#navy-paste').addEventListener('click', pasteNavy);
  try {
    state.app = await api('GET', '/api/state');
    $('#demo-badge').hidden = !state.app.demo;
    $('#an-days').max = state.app.max_days;
    navyBanner(state.app.navy, state.app.navy_stale && !state.app.demo);
    await Promise.all([loadLocations(), loadProfiles()]);
    if (state.locations.length) selectLocation(state.locations[0].id);
  } catch (err) { $('#an-status').replaceChildren(el('div', { class: 'box st-error' }, `Falha ao carregar: ${err.message}`)); }
}

init();
