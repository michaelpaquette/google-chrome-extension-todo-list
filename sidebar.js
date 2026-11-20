(() => {
'use strict';

/* ================= State ================= */
const KEY = 'summit-sidebar-v1';
const CACHE = 'summit-sidebar-cache-v1';
const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const DEFAULT_STOCKS = [{sym: 'TSLA', name: 'Tesla'}, {sym: 'SPCX', name: 'SpaceX'}];
const P = Object.assign({open: false, unit: 'c', loc: null, stocks: DEFAULT_STOCKS}, read(KEY)); // loc: {lat, lon, name}
if (!Array.isArray(P.stocks)) P.stocks = DEFAULT_STOCKS;
const C = read(CACHE);                                                   // {wx: {at, key, data}}
const saveP = () => write(KEY, P);
const saveC = () => write(CACHE, C);

const MAX_STOCKS = 8;
const WX_TTL = 30 * 60e3, STK_EVERY = 60e3;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

/* ================= Open / close ================= */
const side = $('#sidebar');
function applyOpen() {
  document.body.classList.toggle('sb-open', P.open);
  side.inert = !P.open;
  $('#sbBtn').classList.toggle('on', P.open);
  if (P.open) refresh();
}
function toggle(force) { P.open = force != null ? force : !P.open; saveP(); applyOpen(); }
$('#sbBtn').addEventListener('click', () => toggle());
$('#sbClose').addEventListener('click', () => toggle(false));
document.addEventListener('keydown', e => {
  const a = document.activeElement || {};
  if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable || document.querySelector('.modal-bg.open')) return;
  e.preventDefault(); toggle();
});

/* ================= Location ================= */
function getGeo() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      p => res({lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3)}),
      rej, {timeout: 12000, maximumAge: 6 * 3600e3});
  });
}
async function placeName(lat, lon) {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    const d = await r.json();
    return d.city || d.locality || d.principalSubdivision || 'your area';
  } catch (e) { return 'your area'; }
}
async function locateMe() {
  $('#sbLocName').textContent = 'locating…';
  const g = await getGeo();
  P.loc = {...g, name: await placeName(g.lat, g.lon)}; saveP();
}
async function searchCity(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en`);
  const d = await r.json();
  const p = d.results && d.results[0];
  if (!p) throw new Error('not found');
  P.loc = {lat: p.latitude, lon: p.longitude, name: p.name}; saveP();
}

const locForm = $('#sbLocForm'), city = $('#sbCity');
const showLocForm = show => { locForm.hidden = !show; if (show) { city.value = ''; city.focus(); } };
$('#sbLoc').addEventListener('click', () => showLocForm(locForm.hidden));
async function setCity() {
  const q = city.value.trim(); if (!q) return city.focus();
  try { await searchCity(q); showLocForm(false); loadWeather(true); }
  catch (e) { city.value = ''; city.placeholder = `couldn’t find “${q}”`; city.focus(); }
}
$('#sbCityGo').addEventListener('click', setCity);
city.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') setCity();
  if (e.key === 'Escape') showLocForm(false);
});
$('#sbUseGeo').addEventListener('click', async () => {
  showLocForm(false);
  try { await locateMe(); loadWeather(true); } catch (e) { wxError('location blocked — set a city instead'); }
});

/* ================= Weather ================= */
// WMO weather codes → [label, day icon, night icon]
const WMO = {
  0: ['clear', '☀️', '🌙'], 1: ['mostly clear', '🌤️', '🌙'], 2: ['partly cloudy', '⛅', '☁️'], 3: ['cloudy', '☁️', '☁️'],
  45: ['fog', '🌫️'], 48: ['freezing fog', '🌫️'],
  51: ['light drizzle', '🌦️'], 53: ['drizzle', '🌦️'], 55: ['heavy drizzle', '🌧️'], 56: ['freezing drizzle', '🌧️'], 57: ['freezing drizzle', '🌧️'],
  61: ['light rain', '🌦️'], 63: ['rain', '🌧️'], 65: ['heavy rain', '🌧️'], 66: ['freezing rain', '🌧️'], 67: ['freezing rain', '🌧️'],
  71: ['light snow', '🌨️'], 73: ['snow', '🌨️'], 75: ['heavy snow', '❄️'], 77: ['snow grains', '🌨️'],
  80: ['showers', '🌦️'], 81: ['showers', '🌧️'], 82: ['heavy showers', '🌧️'], 85: ['snow showers', '🌨️'], 86: ['snow showers', '❄️'],
  95: ['thunderstorm', '⛈️'], 96: ['thunderstorm, hail', '⛈️'], 99: ['thunderstorm, hail', '⛈️'],
};
const wmo = (c, night) => { const w = WMO[c] || ['—', '·']; return {label: w[0], icon: (night && w[2]) || w[1]}; };
const deg = v => `${Math.round(v)}°`;
const hourLabel = h => { h %= 24; return h === 0 ? '12 am' : h === 12 ? 'noon' : h < 12 ? `${h} am` : `${h - 12} pm`; };
const dayName = iso => new Date(iso + 'T12:00').toLocaleDateString(undefined, {weekday: 'short'});

function wxError(msg) {
  $('#wx').innerHTML = `<div class="sb-msg">${esc(msg)} · <button id="wxRetry">retry</button></div>`;
  $('#wxRetry').addEventListener('click', () => loadWeather(true));
  if (!P.loc) $('#sbLocName').textContent = 'set location';
}

async function loadWeather(force) {
  if (!P.loc) {
    try { await locateMe(); } catch (e) { showLocForm(true); return wxError('allow location or set a city'); }
  }
  $('#sbLocName').textContent = P.loc.name;
  const key = `${P.loc.lat},${P.loc.lon},${P.unit}`;
  if (!force && C.wx && C.wx.key === key && Date.now() - C.wx.at < WX_TTL) return renderWeather(C.wx.data);
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${P.loc.lat}&longitude=${P.loc.lon}` +
      '&current=temperature_2m,apparent_temperature,weather_code,is_day' +
      '&hourly=temperature_2m,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      `&timezone=auto&forecast_days=7${P.unit === 'f' ? '&temperature_unit=fahrenheit' : ''}`;
    const r = await fetch(u); if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    C.wx = {at: Date.now(), key, data}; saveC();
    renderWeather(data);
  } catch (e) {
    if (C.wx && C.wx.key === key) renderWeather(C.wx.data); else wxError('weather unavailable');
  }
}

function renderWeather(d) {
  const cur = d.current, H = d.hourly, D = d.daily;
  const today = cur.time.slice(0, 10);
  const base = H.time.indexOf(today + 'T00:00');
  const curHour = +cur.time.slice(11, 13);
  const at = h => ({t: H.temperature_2m[base + h], w: wmo(H.weather_code[base + h], !H.is_day[base + h])});
  const now = wmo(cur.weather_code, !cur.is_day);

  // tonight: 6 pm / 9 pm / midnight, or the next three 3-hour slots once evening has passed
  const slots = [18, 21, 24].filter(h => h > curHour);
  let h = slots.length ? slots[slots.length - 1] : Math.ceil((curHour + 1) / 3) * 3 - 3;
  while (slots.length < 3) slots.push(h += 3);
  const tonightLabel = slots[0] <= 21 ? 'tonight' : 'overnight';

  const tm = 1, tw = wmo(D.weather_code[tm]);
  const parts = [[9, 'morning'], [15, 'afternoon'], [21, 'evening']].map(([hh, n]) => ({n, ...at(24 + hh)}));

  const lo = Math.min(...D.temperature_2m_min.slice(2)), hi = Math.max(...D.temperature_2m_max.slice(2));
  const span = hi - lo || 1;
  const week = D.time.slice(2).map((iso, k) => {
    const i = k + 2, a = D.temperature_2m_min[i], b = D.temperature_2m_max[i];
    return `<div class="wx-day"><span>${esc(dayName(iso))}</span><span class="i">${wmo(D.weather_code[i]).icon}</span>
      <span class="bar"><i style="left:${(a - lo) / span * 100}%;right:${(hi - b) / span * 100}%"></i></span>
      <span class="r">${deg(a)} / ${deg(b)}</span></div>`;
  }).join('');

  $('#wx').innerHTML = `
    <div class="wx-now">
      <div class="wx-temp" id="wxUnit" title="switch °C / °F">${Math.round(cur.temperature_2m)}<sup>°${P.unit.toUpperCase()}</sup></div>
      <div class="wx-big-ico">${now.icon}</div>
    </div>
    <div class="wx-cond"><b>${esc(now.label)}</b> · feels ${deg(cur.apparent_temperature)} · today ${deg(D.temperature_2m_max[0])} / ${deg(D.temperature_2m_min[0])}</div>

    <div class="sb-label">${tonightLabel}</div>
    <div class="wx-slots">${slots.map(hh => { const s = at(hh); return `
      <div class="wx-slot"><span class="t">${hourLabel(hh)}</span><span class="i">${s.w.icon}</span><span class="v">${deg(s.t)}</span></div>`; }).join('')}
    </div>

    <div class="sb-label">tomorrow · ${esc(dayName(D.time[tm]))}</div>
    <div class="wx-tmrw">
      <div class="top">
        <span class="i">${tw.icon}</span>
        <div>
          <div class="hl">${deg(D.temperature_2m_max[tm])}<span>${deg(D.temperature_2m_min[tm])}</span></div>
          <div class="c">${esc(tw.label)}${D.precipitation_probability_max[tm] ? ` · ${D.precipitation_probability_max[tm]}% precip` : ''}</div>
        </div>
      </div>
      <div class="parts">${parts.map(p => `<div><small>${p.n}</small><span>${p.w.icon} ${deg(p.t)}</span></div>`).join('')}</div>
    </div>

    <div class="sb-label">this week</div>
    <div class="wx-week">${week}</div>`;
  $('#wxUnit').addEventListener('click', () => { P.unit = P.unit === 'c' ? 'f' : 'c'; saveP(); loadWeather(); });
}

/* ================= Stocks ================= */
async function quote(sym) {
  let last;
  for (const host of ['query1', 'query2']) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=5m`);
      if (!r.ok) throw new Error(r.status);
      const res = (await r.json()).chart.result[0];
      return {
        price: res.meta.regularMarketPrice, currency: res.meta.currency || 'USD',
        prev: res.meta.chartPreviousClose ?? res.meta.previousClose,
        time: res.meta.regularMarketTime,
        period: res.meta.currentTradingPeriod.regular,
        ts: res.timestamp || [], close: (res.indicators.quote[0] || {}).close || [],
      };
    } catch (e) { last = e; }
  }
  throw last;
}

function spark(q) {
  const pts = q.ts.map((t, i) => [t, q.close[i]]).filter(p => p[1] != null);
  if (pts.length < 2) return '';
  const t0 = q.period.start, t1 = q.period.end;
  const vals = pts.map(p => p[1]).concat(q.prev);
  const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const x = t => Math.max(0, Math.min(92, (t - t0) / (t1 - t0) * 92));
  const y = v => 30 - (v - lo) / r * 28;
  const up = q.price >= q.prev;
  return `<svg viewBox="0 0 92 32" aria-hidden="true">
    <line x1="0" x2="92" y1="${y(q.prev)}" y2="${y(q.prev)}" stroke="rgba(255,255,255,.3)" stroke-dasharray="2 3" stroke-width="1"/>
    <polyline fill="none" stroke="${up ? '#8ee6a8' : '#ffa3a3'}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"
      points="${pts.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}"/></svg>`;
}

const money = (v, cur) => {
  try { return new Intl.NumberFormat(undefined, {style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2}).format(v); }
  catch (e) { return v.toFixed(2); }
};
const stockBox = $('#stocks');
let stkTimer, lastResults = [], editing = false;

async function loadStocks() {
  clearTimeout(stkTimer);
  lastResults = await Promise.all(P.stocks.map(s => quote(s.sym).then(q => ({s, q}), () => ({s}))));
  renderStocks();
  if (P.open && !document.hidden) stkTimer = setTimeout(loadStocks, STK_EVERY);
}

function renderStocks() {
  const results = P.stocks.map(s => lastResults.find(r => r.s.sym === s.sym) || {s});
  const parts = [];
  if (!P.stocks.length) parts.push('<div class="sb-msg">no stocks yet — click edit to add one</div>');
  else if (!editing && results.length && results.every(r => !r.q)) parts.push('<div class="sb-msg">quotes unavailable · <button data-act="retry">retry</button></div>');
  else {
    parts.push(results.map(({s, q}) => {
      const label = `<div><div class="nm">${esc(s.name)}</div><div class="sym">${esc(s.sym)}</div></div>`;
      const rm = editing ? `<button class="icon-btn stk-rm" data-rm="${esc(s.sym)}" title="remove ${esc(s.sym)}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : '';
      if (!q) return `<div class="stk">${label}<span></span><div class="px">—</div>${rm}</div>`;
      const ch = q.price - q.prev, pct = ch / q.prev * 100, cls = ch >= 0 ? 'up' : 'dn', sign = ch >= 0 ? '+' : '−';
      return `<div class="stk${editing ? ' editing' : ''}" title="previous close ${money(q.prev, q.currency)}">
        ${label}${spark(q)}
        <div><div class="px">${money(q.price, q.currency)}</div><div class="ch ${cls}">${sign}${Math.abs(ch).toFixed(2)} (${sign}${Math.abs(pct).toFixed(2)}%)</div></div>
        ${rm}</div>`;
    }).join(''));
    const ok = results.filter(r => r.q);
    if (!editing && ok.length) {
      const nowS = Date.now() / 1000;
      const open = ok.some(r => nowS >= r.q.period.start && nowS < r.q.period.end);
      const latest = Math.max(...ok.map(r => r.q.time));
      parts.push(`<div class="stk-foot">${open ? 'live · ' : 'market closed · '}as of ${
        new Date(latest * 1000).toLocaleString(undefined, {weekday: open ? undefined : 'short', hour: 'numeric', minute: '2-digit'})}</div>`);
    }
  }
  if (editing) parts.push(P.stocks.length >= MAX_STOCKS
    ? `<div class="sb-msg">that’s the max of ${MAX_STOCKS} — remove one to add another</div>`
    : `<div class="stk-add"><input id="stkQ" placeholder="add a stock — name or ticker" autocomplete="off" spellcheck="false"><div id="stkHits" class="stk-hits"></div></div>`);
  stockBox.innerHTML = parts.join('');
  $('#stkEdit').textContent = editing ? 'done' : 'edit';
  if (editing && $('#stkQ')) wireSearch($('#stkQ'));
}

stockBox.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'retry') loadStocks();
  if (b.dataset.rm) { P.stocks = P.stocks.filter(s => s.sym !== b.dataset.rm); saveP(); renderStocks(); }
  if (b.dataset.add) addStock({sym: b.dataset.add, name: b.dataset.name});
});
$('#stkEdit').addEventListener('click', () => {
  editing = !editing; renderStocks();
  if (editing && $('#stkQ')) $('#stkQ').focus();
  if (!editing) loadStocks();
});

/* ---- ticker search ---- */
const cleanName = n => n.trim().replace(/,?\s+(inc\.?|corp\.?|corporation|ltd\.?|plc|co\.|company|holdings?)$/i, '').trim();
async function searchTickers(q) {
  const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`);
  const d = await r.json();
  return (d.quotes || [])
    .filter(x => x.symbol && ['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND', 'CRYPTOCURRENCY'].includes(x.quoteType))
    .slice(0, 6)
    .map(x => ({sym: x.symbol, name: cleanName(x.shortname || x.longname || x.symbol), exch: x.exchDisp || ''}));
}
function wireSearch(inp) {
  const hits = $('#stkHits');
  let t, seq = 0, list = [];
  inp.addEventListener('input', () => {
    clearTimeout(t);
    const q = inp.value.trim();
    if (!q) { hits.innerHTML = ''; list = []; return; }
    t = setTimeout(async () => {
      const my = ++seq;
      try { list = await searchTickers(q); } catch (e) { list = []; }
      if (my !== seq) return;
      hits.innerHTML = list.length ? list.map(x => {
        const have = P.stocks.some(s => s.sym === x.sym);
        return `<button data-add="${esc(x.sym)}" data-name="${esc(x.name)}" ${have ? 'disabled' : ''}>
          <span class="sym">${esc(x.sym)}</span><span class="nm">${esc(x.name)}</span><span class="ex">${have ? 'added' : esc(x.exch)}</span></button>`;
      }).join('') : '<div class="sb-msg">no matches</div>';
    }, 250);
  });
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const x = list.find(x => !P.stocks.some(s => s.sym === x.sym)); if (x) addStock(x); }
    if (e.key === 'Escape') { editing = false; renderStocks(); loadStocks(); }
  });
}
async function addStock(x) {
  if (P.stocks.some(s => s.sym === x.sym) || P.stocks.length >= MAX_STOCKS) return;
  P.stocks.push({sym: x.sym, name: x.name}); saveP();
  const q = await quote(x.sym).catch(() => null);
  lastResults = lastResults.filter(r => r.s.sym !== x.sym).concat([{s: {sym: x.sym, name: x.name}, ...(q ? {q} : {})}]);
  renderStocks();
  if ($('#stkQ')) $('#stkQ').focus();
}

/* ================= Refresh ================= */
function refresh() { loadWeather(); loadStocks(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && P.open) refresh(); });
setInterval(() => { if (P.open && !document.hidden) loadWeather(); }, 5 * 60e3);

applyOpen();
})();
