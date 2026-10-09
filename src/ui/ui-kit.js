// Small shared UI helpers: toasts, confirm dialog, file download/pick.

import { html } from './html.js';

export function toast(message, { action = null, timeout = 3500 } = {}) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = String(html`<span>${message}</span>${action ? html`<button class="toast__btn">${action.label}</button>` : ''}`);
  if (action) el.querySelector('button').addEventListener('click', () => { action.onClick(); el.remove(); });
  host.appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

/**
 * Shows a modal confirm. `message` may be a string or html`` fragment.
 * Resolves to false on cancel; otherwise to `getValue()` (if given) or true.
 */
export function confirmDialog(message, okLabel = 'OK', getValue = null) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dialog';
    d.innerHTML = String(html`<form method="dialog"><div class="dialog__msg">${message}</div>
      <div class="dialog__actions"><button value="cancel" class="btn btn--ghost">Cancel</button>
      <button value="ok" class="btn btn--primary">${okLabel}</button></div></form>`);
    document.body.appendChild(d);
    let value = false;
    d.querySelector('button[value=ok]').addEventListener('click', () => { value = getValue ? getValue() : true; });
    d.addEventListener('close', () => { d.remove(); resolve(d.returnValue === 'ok' ? value : false); });
    d.showModal();
  });
}

export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 20 * 1024 * 1024) { reject(new Error('File is larger than 20 MB.')); return; }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function relativeTime(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - Date.parse(iso);
  const day = 86400000;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < day) return `${Math.floor(diff / 3600000)} h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
