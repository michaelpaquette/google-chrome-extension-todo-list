(() => {
'use strict';

/* ================= State ================= */
const KEY = 'momentum-todo-v1';
const DEFAULT = () => ({
  tasks: [],
  cats: [{id:'today',name:'Today'},{id:'work',name:'Work'},{id:'followup',name:'Follow-up'}],
  theme: 0, auto: true, name: '', h24: false, docked: false,
  cat: 'all', status: 'active'
});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function normalize(d) {
  const base = DEFAULT();
  if (!d || typeof d !== 'object') return base;
  const s = Object.assign(base, d);
  s.cats = Array.isArray(s.cats) ? s.cats.filter(c => c && c.id && typeof c.name === 'string') : base.cats;
  s.tasks = Array.isArray(s.tasks) ? s.tasks.filter(t => t && typeof t.text === 'string').map(t => ({
    id: t.id || uid(), text: t.text, done: !!t.done,
    cat: s.cats.some(c => c.id === t.cat) ? t.cat : null, created: t.created || Date.now()
  })) : [];
  if (s.cat !== 'all' && !s.cats.some(c => c.id === s.cat)) s.cat = 'all';
  if (!['active','done','all'].includes(s.status)) s.status = 'active';
  s.auto = s.auto !== false;
  return s;
}
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return DEFAULT(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}
let S = load();

/* ================= Helpers ================= */
const $ = s => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};
const svgIcon = d => { const w = document.createElement('span'); w.innerHTML = `<svg viewBox="0 0 24 24">${d}</svg>`; return w.firstChild; };
const ICON_EDIT = '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>';
const ICON_X = '<path d="M6 6l12 12M18 6L6 18"/>';
const catName = id => (S.cats.find(c => c.id === id) || {}).name;

/* ---- links: [name](url) shows as "name"; bare URLs show as their host ---- */
const LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)|\b((?:https?:\/\/|www\.)[^\s<]*[^\s<.,;:!?)\]'"])/gi;
function safeUrl(u) {
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+/.test(u)) return 'https://' + u;
  return null;
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
function richText(node, text) {
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const href = safeUrl(m[2] || m[3]);
    if (!href) continue;
    if (m.index > last) node.append(text.slice(last, m.index));
    const a = el('a', {href, target: '_blank', rel: 'noopener noreferrer', title: href, draggable: false,
      textContent: m[1] || hostOf(href)});
    a.addEventListener('dblclick', e => e.stopPropagation());
    node.append(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) node.append(text.slice(last));
  return node;
}
const autoGrow = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const ta = el('textarea', {value: text}); ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
}

/* ================= Themes (offline SVG scenes) ================= */
const THEMES = [
  {name:'Dawn',   sky:['#f6a57f','#f4c7a1','#fbe3c5'], sun:'#fff3d6', sunY:470, layers:['#c98b8f','#9a6378','#5d3b57']},
  {name:'Alpine', sky:['#4f86c6','#86b4dc','#cfe3ef'], sun:'#ffffff', sunY:300, layers:['#8aa7c4','#56789c','#2c4766'], snow:true},
  {name:'Forest', sky:['#6e9a8a','#a9c6a8','#e3e6c4'], sun:'#fffbe0', sunY:380, layers:['#6f8f74','#43684f','#20392b']},
  {name:'Dusk',   sky:['#2e2a5a','#7b4f8e','#e3878a'], sun:'#ffc7a1', sunY:540, layers:['#6d4a7a','#43305a','#1f1736']},
  {name:'Night',  sky:['#070b1f','#18234a','#33406e'], sun:'#f2f0e1', sunY:200, layers:['#2b3660','#1a2245','#0b1028'], stars:true},
  {name:'Desert', sky:['#e98a5b','#f2b27b','#f7d9a6'], sun:'#fff0c9', sunY:430, layers:['#d08a5c','#a85f3e','#6e3826']},
  {name:'Ocean',  sky:['#1f5f86','#5fa3c4','#bfe0e8'], sun:'#ffffff', sunY:350, layers:['#4f8fae','#2c6c8f','#123f5c'], water:true},
];
let starsSVG = '';
(function makeStars() {
  let s = ''; let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 140; i++) s += `<circle cx="${(r()*1440).toFixed(0)}" cy="${(r()*520).toFixed(0)}" r="${(r()*1.4+.3).toFixed(2)}" fill="#fff" opacity="${(r()*.7+.2).toFixed(2)}"/>`;
  starsSVG = s;
})();
/* ---- Auto: the scene follows the day's energy, then settles into Night ---- */
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, f) => '#' + hexRGB(a).map((v, i) => Math.round(v + (hexRGB(b)[i] - v) * f).toString(16).padStart(2, '0')).join('');
const NIGHT = THEMES[4];
const kf = (h, name, sky, sun, sunY, layers, starsA = 0) => ({h, name, sky, sun, sunY, layers, starsA});
const DAY_KEYS = [
  kf(0,    'Night',       NIGHT.sky, NIGHT.sun, NIGHT.sunY, NIGHT.layers, 1),
  kf(4.5,  'Night',       NIGHT.sky, NIGHT.sun, NIGHT.sunY, NIGHT.layers, 1),
  kf(6.5,  'Dawn',        THEMES[0].sky, THEMES[0].sun, 470, THEMES[0].layers),
  kf(9,    'Morning',     ['#5b9bd5','#9cc7e6','#e4f0f5'], '#ffffff', 300, ['#93b3c9','#5f86a6','#34536f']),
  kf(12.5, 'Midday',      ['#2f7fc1','#6fb3e0','#cdeaf3'], '#fffdf2', 170, ['#7fb39a','#4f8a6c','#25523d']),
  kf(15.5, 'Afternoon',   ['#5f95c4','#e9c08c','#f7e1b0'], '#fff1c4', 300, ['#b99a74','#8a6a4f','#4f3a2c']),
  kf(18,   'Golden hour', ['#e0785a','#f2a36f','#fbd29a'], '#ffe2b0', 470, ['#b8707a','#8a4a64','#4f2a45']),
  kf(19.5, 'Dusk',        THEMES[3].sky, THEMES[3].sun, 540, THEMES[3].layers, .35),
  kf(21,   'Night',       NIGHT.sky, NIGHT.sun, NIGHT.sunY, NIGHT.layers, 1),
  kf(24,   'Night',       NIGHT.sky, NIGHT.sun, NIGHT.sunY, NIGHT.layers, 1),
];
const hourOverride = parseFloat(new URLSearchParams(location.search).get('hour')); // e.g. ?hour=13.5 to preview
function currentHour() {
  if (!isNaN(hourOverride)) return ((hourOverride % 24) + 24) % 24;
  const d = new Date(); return d.getHours() + d.getMinutes() / 60;
}
function autoTheme(h) {
  let i = 0; while (DAY_KEYS[i + 1].h <= h && i < DAY_KEYS.length - 2) i++;
  const a = DAY_KEYS[i], b = DAY_KEYS[i + 1];
  let f = (h - a.h) / (b.h - a.h); f = f * f * (3 - 2 * f); // ease between moments
  return {
    name: f < .5 ? a.name : b.name,
    sky: a.sky.map((c, k) => mixHex(c, b.sky[k], f)),
    sun: mixHex(a.sun, b.sun, f),
    sunY: Math.round(a.sunY + (b.sunY - a.sunY) * f),
    layers: a.layers.map((c, k) => mixHex(c, b.layers[k], f)),
    starsA: a.starsA + (b.starsA - a.starsA) * f,
  };
}
let sceneMinute = -1;
function renderScene() {
  sceneMinute = Math.floor(currentHour() * 60);
  const t = S.auto ? autoTheme(currentHour()) : THEMES[S.theme % THEMES.length];
  const starsA = t.starsA != null ? t.starsA : (t.stars ? 1 : 0);
  const [far, mid, near] = t.layers;
  const snow = t.snow ? `<path d="M520 380 L470 420 L500 415 L520 430 L545 412 L575 420 Z M880 360 L830 400 L860 395 L880 410 L905 392 L935 400 Z M1240 400 L1200 430 L1225 426 L1240 438 L1260 424 L1285 430 Z" fill="#f4f8fb" opacity=".9"/>` : '';
  const near_d = t.water
    ? 'M0 760 C200 748 400 772 640 758 C880 744 1080 770 1300 756 C1370 752 1410 754 1440 754 V900 H0Z'
    : 'M0 760 C240 700 420 780 640 740 C860 700 1040 780 1240 730 C1340 705 1400 720 1440 715 V900 H0Z';
  $('#scene').innerHTML = `
  <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${t.sky[0]}"/><stop offset=".55" stop-color="${t.sky[1]}"/><stop offset="1" stop-color="${t.sky[2]}"/>
      </linearGradient>
      <radialGradient id="glow"><stop offset="0" stop-color="${t.sun}" stop-opacity=".55"/><stop offset="1" stop-color="${t.sun}" stop-opacity="0"/></radialGradient>
      <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.sky[2]}" stop-opacity="0"/><stop offset="1" stop-color="${t.sky[2]}" stop-opacity=".35"/></linearGradient>
    </defs>
    <rect width="1440" height="900" fill="url(#sky)"/>
    ${starsA > 0.01 ? `<g opacity="${starsA.toFixed(2)}">${starsSVG}</g>` : ''}
    <circle cx="1060" cy="${t.sunY}" r="220" fill="url(#glow)"/>
    <circle cx="1060" cy="${t.sunY}" r="${Math.round(62 - 16 * starsA)}" fill="${t.sun}" opacity="${(.9 + .05 * starsA).toFixed(2)}"/>
    <path d="M0 560 L180 430 L330 520 L520 380 L700 500 L880 360 L1060 490 L1240 400 L1440 480 V900 H0Z" fill="${far}" opacity=".85"/>
    ${snow}
    <rect y="400" width="1440" height="300" fill="url(#haze)"/>
    <path d="M0 650 C200 560 340 640 480 590 C640 530 760 640 940 600 C1120 560 1260 620 1440 580 V900 H0Z" fill="${mid}"/>
    <path d="${near_d}" fill="${near}"/>
  </svg>`;
  $('#themeName').textContent = S.auto ? `Auto · ${t.name}` : t.name;
  $('#themeBtn').title = S.auto ? 'follows the time of day — click for fixed backgrounds' : 'next background';
}

/* ================= Clock & greeting ================= */
function tick() {
  const d = new Date(); let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const c = $('#clock');
  if (S.auto && Math.floor(currentHour() * 60) !== sceneMinute) renderScene();
  if (S.h24) c.textContent = `${String(h).padStart(2,'0')}:${m}`;
  else {
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    c.innerHTML = `${h}:${m}<span class="ampm">${ap}</span>`;
  }
  const hr = d.getHours();
  $('#date').textContent = d.toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'});
}

/* ================= Rendering ================= */
function visibleTasks() {
  return S.tasks.filter(t =>
    (S.cat === 'all' || t.cat === S.cat) &&
    (S.status === 'all' || (S.status === 'done' ? t.done : !t.done)));
}

function renderPills() {
  const p = $('#pills'); p.innerHTML = '';
  const count = id => S.tasks.filter(t => !t.done && (id === 'all' || t.cat === id)).length;
  const mk = (id, name) => {
    const b = el('button', {class: 'pill' + (S.cat === id ? ' on' : ''), role: 'tab', dataset: {id},
      title: id === 'all' ? 'all tasks' : 'double-click to rename'},
      name, el('span', {class: 'n', textContent: count(id) || ''}));
    b.addEventListener('click', () => { S.cat = id; save(); render(); $('#newTask').focus(); });
    if (id !== 'all') b.addEventListener('dblclick', () => pillRename(b, id));
    return b;
  };
  p.append(mk('all', 'All'));
  S.cats.forEach(c => p.append(mk(c.id, c.name)));
  const add = el('button', {class: 'pill add', title: 'new category', textContent: '+'});
  add.addEventListener('click', () => pillCreate(add));
  p.append(add);
}

function pillInput(replaceEl, value, onDone) {
  const inp = el('input', {class: 'pill-input', value});
  replaceEl.replaceWith(inp); inp.focus(); inp.select();
  let finished = false;
  const finish = ok => { if (finished) return; finished = true; onDone(ok ? inp.value.trim() : null); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
}
function pillCreate(btn) {
  pillInput(btn, '', name => {
    if (name) { const c = createCat(name); if (c) S.cat = c.id; }
    save(); render();
  });
}
function pillRename(btn, id) {
  pillInput(btn, catName(id), name => { if (name) renameCat(id, name); save(); render(); });
}

function render() {
  renderPills();
  document.querySelectorAll('#statusSeg button').forEach(b => b.classList.toggle('on', b.dataset.s === S.status));
  const inCat = S.cat !== 'all' ? catName(S.cat) : null;
  $('#newTask').placeholder = inCat ? `Add to ${inCat}…` : 'Add a task…';
  document.body.classList.toggle('docked', S.docked);

  const list = $('#list'); list.innerHTML = '';
  const vis = visibleTasks();
  if (!vis.length) {
    const msg = S.status === 'done' ? 'No completed tasks yet.' : S.status === 'active' && S.tasks.some(t => t.done && (S.cat === 'all' || t.cat === S.cat)) ? 'All done. Nice work. ✨' : 'Nothing here yet — add a task above.';
    list.append(el('li', {class: 'empty', textContent: msg}));
  }
  vis.forEach(t => list.append(renderTask(t)));

  const scoped = S.tasks.filter(t => S.cat === 'all' || t.cat === S.cat);
  const left = scoped.filter(t => !t.done).length, done = scoped.length - left;
  $('#countLabel').textContent = `${left} left${done ? ` · ${done} done` : ''}`;
  $('#clearDone').style.visibility = done ? 'visible' : 'hidden';
}

function catSelect(t) {
  const sel = el('select', {class: 'catsel', title: 'change category'});
  sel.append(el('option', {value: '', textContent: 'no category'}));
  S.cats.forEach(c => sel.append(el('option', {value: c.id, textContent: c.name})));
  sel.value = t.cat || '';
  sel.addEventListener('change', () => { t.cat = sel.value || null; save(); render(); focusTask(t.id); });
  sel.addEventListener('keydown', e => e.stopPropagation());
  return sel;
}

function renderTask(t) {
  const li = el('li', {class: 'task' + (t.done ? ' done' : '') + (t.text.includes('\n') ? ' multi' : ''), tabIndex: 0, draggable: true, dataset: {id: t.id}});
  const cb = el('input', {type: 'checkbox', class: 'check', checked: t.done, title: 'mark done'});
  cb.addEventListener('change', () => { t.done = cb.checked; save(); setTimeout(() => { render(); }, t.done && S.status === 'active' ? 250 : 0); });
  const text = richText(el('span', {class: 'ttext'}), t.text);
  text.addEventListener('dblclick', () => startEdit(li, t));

  li.append(el('span', {class: 'grip', textContent: '⋮⋮', title: 'drag to reorder'}), cb, text);
  if (S.cat === 'all' && t.cat) li.append(el('span', {class: 'badge', textContent: catName(t.cat)}));

  const editBtn = el('button', {class: 'icon-btn', title: 'edit (enter)'}, svgIcon(ICON_EDIT));
  editBtn.addEventListener('click', () => startEdit(li, t));
  const delBtn = el('button', {class: 'icon-btn del', title: 'delete (del)'}, svgIcon(ICON_X));
  delBtn.addEventListener('click', () => deleteTask(t.id));
  li.append(el('div', {class: 'actions'}, catSelect(t), editBtn, delBtn));

  li.addEventListener('keydown', e => onTaskKey(e, li, t));
  attachDrag(li, t);
  return li;
}

function focusTask(id) {
  const n = document.querySelector(`.task[data-id="${CSS.escape(id)}"]`);
  if (n) n.focus();
}

/* ================= Task CRUD ================= */
function cleanLine(line) {
  const m = line.match(/^\s*(?:[-*•+–]\s+)?(?:\[([ xX]?)\]\s*)?(?:\d+[.)]\s+)?([\s\S]*)$/);
  return {text: (m ? m[2] : line).trim(), done: !!(m && m[1] && m[1].trim())};
}
function addTasks(lines) {
  const cat = S.cat === 'all' ? null : S.cat;
  const items = lines.map(cleanLine).filter(x => x.text);
  items.forEach(x => S.tasks.push({id: uid(), text: x.text, done: x.done, cat, created: Date.now()}));
  if (items.length && S.status === 'done') S.status = 'active';
  save(); render();
  return items.length;
}
function deleteTask(id) {
  const i = S.tasks.findIndex(t => t.id === id); if (i < 0) return;
  const vis = visibleTasks(); const vi = vis.findIndex(t => t.id === id);
  const next = vis[vi + 1] || vis[vi - 1];
  S.tasks.splice(i, 1); save(); render();
  if (next) focusTask(next.id);
}
function startEdit(li, t) {
  if (li.classList.contains('editing')) return;
  li.classList.add('editing', 'multi'); li.draggable = false;
  const text = li.querySelector('.ttext');
  const inp = el('textarea', {class: 'edit-input', value: t.text, rows: 1});
  text.replaceWith(inp); autoGrow(inp); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
  inp.addEventListener('input', () => autoGrow(inp));
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (ok && v) t.text = v;
    save(); render(); focusTask(t.id);
  };
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', () => setTimeout(() => {
    if (!li.contains(document.activeElement)) finish(true);
  }, 0));
}
function moveTask(t, dir) {
  const vis = visibleTasks(); const vi = vis.findIndex(x => x.id === t.id);
  const other = vis[vi + dir]; if (!other) return;
  const a = S.tasks.indexOf(t), b = S.tasks.indexOf(other);
  S.tasks.splice(a, 1);
  const nb = S.tasks.indexOf(other);
  S.tasks.splice(dir > 0 ? nb + 1 : nb, 0, t);
  save(); render(); focusTask(t.id);
}
function onTaskKey(e, li, t) {
  if (e.target !== li) return;
  const vis = visibleTasks(); const vi = vis.findIndex(x => x.id === t.id);
  if ((e.altKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault(); moveTask(t, e.key === 'ArrowUp' ? -1 : 1);
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const n = vis[vi + (e.key === 'ArrowUp' ? -1 : 1)];
    if (n) focusTask(n.id); else if (e.key === 'ArrowUp') $('#newTask').focus();
  } else if (e.key === 'Enter' || e.key === 'F2') {
    e.preventDefault(); startEdit(li, t);
  } else if (e.key === ' ') {
    e.preventDefault(); t.done = !t.done; save(); render(); focusTask(t.id);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault(); deleteTask(t.id);
  }
}

/* ---- drag & drop ---- */
let dragId = null;
function attachDrag(li, t) {
  li.addEventListener('dragstart', e => {
    dragId = t.id; li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', t.text); } catch (_) {}
  });
  li.addEventListener('dragend', () => { dragId = null; clearDropMarks(); li.classList.remove('dragging'); });
  li.addEventListener('dragover', e => {
    if (!dragId || dragId === t.id) return;
    e.preventDefault();
    const r = li.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2;
    clearDropMarks(); li.classList.add(after ? 'drop-after' : 'drop-before');
  });
  li.addEventListener('drop', e => {
    if (!dragId || dragId === t.id) return;
    e.preventDefault();
    const after = li.classList.contains('drop-after');
    const moving = S.tasks.find(x => x.id === dragId);
    S.tasks.splice(S.tasks.indexOf(moving), 1);
    const ti = S.tasks.indexOf(t);
    S.tasks.splice(after ? ti + 1 : ti, 0, moving);
    dragId = null; save(); render();
  });
}
function clearDropMarks() { document.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after')); }

/* ================= Category CRUD ================= */
function createCat(name) {
  name = name.trim(); if (!name) return null;
  if (S.cats.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast(`“${name}” already exists`); return null; }
  const c = {id: uid(), name}; S.cats.push(c); return c;
}
function renameCat(id, name) {
  const c = S.cats.find(x => x.id === id); if (c && name.trim()) c.name = name.trim();
}
function deleteCat(id) {
  const c = S.cats.find(x => x.id === id); if (!c) return;
  const n = S.tasks.filter(t => t.cat === id).length;
  if (!confirm(`delete category “${c.name.toLowerCase()}”?${n ? `\n${n} task${n > 1 ? 's' : ''} in it will also be deleted.` : ''}`)) return;
  S.cats = S.cats.filter(x => x.id !== id);
  S.tasks = S.tasks.filter(t => t.cat !== id);
  if (S.cat === id) S.cat = 'all';
  save(); render(); renderCatRows();
}
function renderCatRows() {
  const box = $('#catRows'); box.innerHTML = '';
  if (!S.cats.length) box.append(el('p', {textContent: 'No categories yet.'}));
  S.cats.forEach((c, i) => {
    const inp = el('input', {value: c.name, 'aria-label': 'Category name'});
    inp.addEventListener('change', () => { if (inp.value.trim()) { renameCat(c.id, inp.value); save(); render(); } else inp.value = c.name; });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    const n = S.tasks.filter(t => t.cat === c.id).length;
    const up = el('button', {class: 'icon-btn', title: 'move up', disabled: i === 0}, svgIcon('<path d="M6 15l6-6 6 6"/>'));
    up.addEventListener('click', () => { S.cats.splice(i - 1, 0, S.cats.splice(i, 1)[0]); save(); render(); renderCatRows(); });
    const del = el('button', {class: 'icon-btn del', title: 'delete category'}, svgIcon(ICON_X));
    del.addEventListener('click', () => deleteCat(c.id));
    box.append(el('div', {class: 'cat-row'}, inp, el('span', {class: 'count', textContent: `${n} task${n === 1 ? '' : 's'}`}), up, del));
  });
}

/* ================= Modals ================= */
function openModal(id) {
  const m = $(id); m.classList.add('open');
  const f = m.querySelector('input,textarea,button:not([data-close])'); if (f) setTimeout(() => f.focus(), 30);
}
function closeModals() { document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open')); }
document.querySelectorAll('.modal-bg').forEach(m => {
  m.addEventListener('mousedown', e => { if (e.target === m) closeModals(); });
  m.querySelector('[data-close]').addEventListener('click', closeModals);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.querySelector('.modal-bg.open')) { closeModals(); return; }
  // "/" or "n" to jump to the input
  const tag = (document.activeElement || {}).tagName;
  if ((e.key === '/' || e.key === 'n') && !e.metaKey && !e.ctrlKey && !['INPUT','TEXTAREA','SELECT'].includes(tag) && !document.activeElement.isContentEditable && !document.querySelector('.modal-bg.open')) {
    e.preventDefault(); $('#newTask').focus();
  }
});

/* ================= Wiring ================= */
const newTask = $('#newTask');
newTask.addEventListener('input', () => autoGrow(newTask));
let shiftHeld = false;
newTask.addEventListener('keydown', e => {
  shiftHeld = e.shiftKey;
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (newTask.value.trim()) { addTasks([newTask.value]); newTask.value = ''; autoGrow(newTask); }
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); openLinkPop();
  } else if (e.key === 'ArrowDown' && !newTask.value.slice(newTask.selectionEnd).includes('\n')) {
    const v = visibleTasks(); if (v.length) { e.preventDefault(); focusTask(v[0].id); }
  } else if (e.key === 'Escape') newTask.blur();
});
newTask.addEventListener('keyup', e => { shiftHeld = e.shiftKey; });
newTask.addEventListener('paste', e => {
  const txt = (e.clipboardData || window.clipboardData).getData('text');
  if (shiftHeld || !/\r?\n/.test(txt.trim())) return; // single line, or ⌘⇧V → paste as one entry
  e.preventDefault();
  const lines = txt.split(/\r?\n/);
  if (newTask.value.trim()) lines.unshift(newTask.value);
  const n = addTasks(lines); newTask.value = ''; autoGrow(newTask);
  const where = S.cat === 'all' ? '' : ` to ${catName(S.cat)}`;
  toast(`Added ${n} task${n === 1 ? '' : 's'}${where}`);
});

/* link popover: inserts [name](url) at the cursor */
const linkPop = $('#linkPop'), linkName = $('#linkName'), linkUrl = $('#linkUrl'), linkBtn = $('#linkBtn');
let linkSel = [0, 0];
function openLinkPop() {
  linkSel = [newTask.selectionStart, newTask.selectionEnd];
  linkName.value = newTask.value.slice(...linkSel).trim();
  linkUrl.value = '';
  linkPop.hidden = false; linkBtn.classList.add('on');
  (linkName.value ? linkUrl : linkName).focus();
}
function closeLinkPop(refocus) {
  linkPop.hidden = true; linkBtn.classList.remove('on');
  if (refocus) newTask.focus();
}
function insertLink() {
  const url = linkUrl.value.trim().replace(/\s/g, '%20').replace(/\)/g, '%29');
  if (!url) return linkUrl.focus();
  const name = linkName.value.replace(/[\[\]\n]/g, ' ').trim();
  const md = name ? `[${name}](${url})` : url;
  const v = newTask.value, [a, b] = linkSel;
  const pre = v.slice(0, a), post = v.slice(b);
  const pad = pre && !/\s$/.test(pre) ? ' ' : '';
  newTask.value = pre + pad + md + (post && !/^\s/.test(post) ? ' ' : '') + post;
  const caret = (pre + pad + md).length;
  closeLinkPop(true); newTask.setSelectionRange(caret, caret); autoGrow(newTask);
}
linkBtn.addEventListener('mousedown', e => e.preventDefault()); // keep the textarea selection
linkBtn.addEventListener('click', () => linkPop.hidden ? openLinkPop() : closeLinkPop(true));
[linkName, linkUrl].forEach(i => i.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); insertLink(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeLinkPop(true); }
}));
$('#linkAdd').addEventListener('click', insertLink);

$('#statusSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.status = b.dataset.s; save(); render();
});
$('#clearDone').addEventListener('click', () => {
  const before = S.tasks.length;
  S.tasks = S.tasks.filter(t => !(t.done && (S.cat === 'all' || t.cat === S.cat)));
  const n = before - S.tasks.length; save(); render();
  if (n) toast(`Cleared ${n} completed task${n === 1 ? '' : 's'}`);
});
$('#copyBtn').addEventListener('click', async () => {
  const vis = visibleTasks();
  if (!vis.length) return toast('Nothing to copy');
  let md;
  if (S.cat === 'all' && S.cats.length) {
    const groups = new Map();
    vis.forEach(t => { const k = t.cat || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    const order = [...S.cats.map(c => c.id), ''].filter(k => groups.has(k));
    md = order.map(k => (groups.size > 1 || k ? `### ${k ? catName(k) : 'Uncategorized'}\n` : '') +
      groups.get(k).map(t => `- [${t.done ? 'x' : ' '}] ${t.text.replace(/\n/g, '\n  ')}`).join('\n')).join('\n\n');
  } else md = vis.map(t => `- [${t.done ? 'x' : ' '}] ${t.text.replace(/\n/g, '\n  ')}`).join('\n');
  toast(await copyText(md) ? `Copied ${vis.length} task${vis.length === 1 ? '' : 's'} as Markdown` : 'Copy failed');
});
$('#catsBtn').addEventListener('click', () => { renderCatRows(); openModal('#catsModal'); });
$('#addCatBtn').addEventListener('click', () => {
  const inp = $('#newCat'); if (createCat(inp.value)) { inp.value = ''; save(); render(); renderCatRows(); }
  inp.focus();
});
$('#newCat').addEventListener('keydown', e => { if (e.key === 'Enter') $('#addCatBtn').click(); });
$('#dockBtn').addEventListener('click', () => { S.docked = !S.docked; save(); render(); });
$('#themeBtn').addEventListener('click', () => {
  // Auto → Dawn → … → Ocean → Auto
  if (S.auto) { S.auto = false; S.theme = 0; }
  else if (S.theme >= THEMES.length - 1) S.auto = true;
  else S.theme++;
  save(); renderScene();
});
$('#clock').addEventListener('click', () => { S.h24 = !S.h24; save(); tick(); });

/* backup */
$('#backupBtn').addEventListener('click', () => {
  $('#backupText').value = JSON.stringify({app: 'momentum-todo', version: 1, exported: new Date().toISOString(), data: S}, null, 2);
  openModal('#backupModal');
});
$('#bCopy').addEventListener('click', async () => toast(await copyText($('#backupText').value) ? 'Backup JSON copied' : 'Copy failed'));
$('#bDownload').addEventListener('click', () => {
  const blob = new Blob([$('#backupText').value], {type: 'application/json'});
  const a = el('a', {href: URL.createObjectURL(blob), download: `momentum-todo-${new Date().toISOString().slice(0, 10)}.json`});
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#bFile').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  $('#backupText').value = await f.text(); e.target.value = '';
  toast('File loaded — click Restore to apply');
});
$('#bRestore').addEventListener('click', () => {
  let parsed;
  try { parsed = JSON.parse($('#backupText').value); } catch (err) { return toast('That isn’t valid JSON'); }
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || !Array.isArray(data.tasks)) return toast('No tasks found in that backup');
  if (!confirm(`replace all current data with this backup (${data.tasks.length} tasks)?`)) return;
  S = normalize(data); save(); nameEl.textContent = S.name;
  renderScene(); tick(); render(); closeModals(); toast('Backup restored');
});

/* sync across tabs */
window.addEventListener('storage', e => {
  if (e.key !== KEY) return;
  if (document.querySelector('.task.editing')) return;
  S = load(); nameEl.textContent = S.name; renderScene(); tick(); render();
});

/* ================= Boot ================= */
renderScene(); tick(); render();
setInterval(tick, 1000);
newTask.focus();
})();
