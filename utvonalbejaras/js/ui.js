// Közös UI segédek: értesítés, modális űrlap, megerősítés, letöltés

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

let toastTimer = null;
export function toast(message, kind = 'info') {
  let box = $('#toast');
  if (!box) {
    box = el('div', { id: 'toast' });
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.className = ''), 3200);
}

/**
 * Modális űrlap. mezők: {name, label, type, value, placeholder, options, hint, rows}
 * Visszatérés: értékobjektum, vagy null ha megszakították.
 */
export function modal({ title, fields = [], okText = 'Mentés', cancelText = 'Mégse', text }) {
  return new Promise((resolve) => {
    const inputs = {};
    const form = el('form', { class: 'modal-form' });

    if (text) form.appendChild(el('p', { class: 'modal-text', text }));

    for (const f of fields) {
      const id = 'f-' + f.name;
      const row = el('label', { class: 'field', for: id });
      row.appendChild(el('span', { class: 'field-label', text: f.label }));
      let input;
      if (f.type === 'textarea') {
        input = el('textarea', { id, rows: f.rows || 3, placeholder: f.placeholder || '' });
        input.value = f.value || '';
      } else if (f.type === 'select') {
        input = el('select', { id });
        for (const o of f.options || []) {
          const opt = el('option', { value: o.value, text: o.label });
          if (o.value === f.value) opt.selected = true;
          input.appendChild(opt);
        }
      } else {
        input = el('input', {
          id,
          type: f.type || 'text',
          placeholder: f.placeholder || '',
          inputmode: f.inputmode || null,
          step: f.step || null,
        });
        input.value = f.value == null ? '' : f.value;
      }
      inputs[f.name] = input;
      row.appendChild(input);
      if (f.hint) row.appendChild(el('span', { class: 'field-hint', text: f.hint }));
      form.appendChild(row);
    }

    const actions = el('div', { class: 'modal-actions' });
    const cancel = el('button', { type: 'button', class: 'btn ghost', text: cancelText });
    const ok = el('button', { type: 'submit', class: 'btn primary', text: okText });
    actions.append(cancel, ok);
    form.appendChild(actions);

    const sheet = el('div', { class: 'modal-sheet' }, [
      el('h2', { class: 'modal-title', text: title || '' }),
      form,
    ]);
    const back = el('div', { class: 'modal-backdrop' }, [sheet]);

    const close = (value) => {
      back.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };

    cancel.addEventListener('click', () => close(null));
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    document.addEventListener('keydown', onKey);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      for (const [k, node] of Object.entries(inputs)) out[k] = node.value.trim();
      close(out);
    });

    document.body.appendChild(back);
    const first = Object.values(inputs)[0];
    if (first) setTimeout(() => first.focus(), 50);
    else setTimeout(() => ok.focus(), 50);
  });
}

export async function confirmDialog(text, { title = 'Biztos benne?', okText = 'Igen', danger = true } = {}) {
  const res = await modal({ title, text, fields: [], okText, cancelText: 'Mégse' });
  if (res && danger) return true;
  return res != null;
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function formatDateTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
