(() => {
'use strict';

/* Daily brief: renders summary.md from the extension folder.
   An unpacked extension serves its files straight from disk, so anything
   written to <extension folder>/summary.md shows up on the next open. */

const FILE = 'summary.md';
const SEEN = 'summit-brief-seen-v1';
const AUTO = 'summit-brief-auto-v1';   // date the brief last opened itself
const AUTO_HOUR = 8;                   // open automatically from 8 am onward
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

/* ================= Markdown ================= */
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => /^(https?:|data:image\/)/i.test(u) ? `<img alt="${a}" src="${u}">` : a)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => /^(https?:|mailto:)/i.test(u) ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : t)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)|(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, (_, p1, a, p2, b) => `${p1 ?? p2}<em>${a ?? b}</em>`)
    .replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

function md(src) {
  const lines = src.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  const out = [];
  let i = 0;
  const isBlockStart = l => /^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s|\s*(-{3,}|\*{3,}|_{3,})\s*$|\|)/.test(l);

  function list(indent) {
    const ordered = /^\s*\d+[.)]\s/.test(lines[i]);
    const items = [];
    while (i < lines.length) {
      const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (!m || m[1].length < indent) break;
      if (m[1].length > indent && items.length) { items[items.length - 1] += list(m[1].length); continue; }
      let text = m[3]; i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i].trim()) && /^\s+/.test(lines[i])) text += ' ' + lines[i++].trim();
      const task = text.match(/^\[([ xX])\]\s+(.*)$/);
      items.push(task
        ? `<li class="task-item"><span class="cb${task[1] === ' ' ? '' : ' on'}"></span><span>${inline(task[2])}</span>`
        : `<li>${inline(text)}`);
      while (i < lines.length && !lines[i].trim() && /^\s*([-*+]|\d+[.)])\s/.test(lines[i + 1] || '')) i++;
    }
    const tag = ordered ? 'ol' : 'ul';
    return `<${tag}>${items.map(x => x + '</li>').join('')}</${tag}>`;
  }

  while (i < lines.length) {
    const l = lines[i], t = l.trim();
    if (!t) { i++; continue; }
    let m;
    if ((m = t.match(/^```(\S*)/))) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
    } else if ((m = t.match(/^(#{1,6})\s+(.*?)\s*#*$/))) {
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++;
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t.replace(/\s/g, ''))) {
      out.push('<hr>'); i++;
    } else if (t.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) buf.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`);
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      out.push(list(l.match(/^\s*/)[0].length));
    } else if (t.startsWith('|') && /^\s*\|?\s*:?-+/.test(lines[i + 1] || '')) {
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(t); i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      out.push(`<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else {
      const buf = [t]; i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i].trim())) buf.push(lines[i++].trim());
      out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

/* ================= Load / show ================= */
const modal = $('#briefModal'), body = $('#briefBody'), btn = $('#briefBtn');
let text = null;

const today = () => new Date().toLocaleDateString('en-CA');

// From 8 am, the first time a visible new tab sees an unread summary, open it — once per day.
function maybeAutoOpen() {
  if (document.hidden || text == null || modal.classList.contains('open')) return;
  if (new Date().getHours() < AUTO_HOUR || localStorage.getItem(AUTO) === today()) return;
  if (localStorage.getItem(SEEN) === hash(text) || document.querySelector('.modal-bg.open')) return;
  const a = document.activeElement || {};
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) && a.value) return; // don't interrupt typing
  localStorage.setItem(AUTO, today());
  show();
}

async function load() {
  try {
    const r = await fetch(`${FILE}?t=${Date.now()}`, {cache: 'no-store'});
    text = r.ok ? await r.text() : null;
  } catch (e) { text = null; }
  if (text != null && !text.trim()) text = null;
  btn.classList.toggle('new', text != null && localStorage.getItem(SEEN) !== hash(text));
  if (modal.classList.contains('open')) render(); else maybeAutoOpen();
}

function render() {
  if (text == null) {
    body.innerHTML = `<div class="brief-empty">No summary yet.<br>Write markdown to <code>${FILE}</code> in the extension folder and it appears here.</div>`;
  } else {
    body.innerHTML = md(text);
    localStorage.setItem(SEEN, hash(text));
    btn.classList.remove('new');
  }
  body.scrollTop = 0;
}

function show() {
  render();
  modal.classList.add('open');
  modal.querySelector('.modal').focus();
}
async function open() { await load(); show(); }

btn.addEventListener('click', open);
$('#briefReload').addEventListener('click', async () => { await load(); render(); });
document.addEventListener('keydown', e => {
  const a = document.activeElement || {};
  if (e.key !== ']' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable || document.querySelector('.modal-bg.open')) return;
  e.preventDefault(); open();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
setInterval(() => { if (!document.hidden) load(); }, 60e3); // picks up the morning file in an already-open tab

load();
})();
