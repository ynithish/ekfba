// Safe HTML templating: every interpolated value is escaped unless wrapped in raw().
// Imported data (backups, rule packs) can never inject markup or scripts.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));

function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === false || v === null || v === undefined) return '';
  return escapeHtml(v);
}

/** Tagged template: html`<p>${userText}</p>` returns a Raw (already-safe) fragment. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

export const icon = (name) => raw(`<svg class="i" aria-hidden="true"><use href="#i-${escapeHtml(name)}"></use></svg>`);
