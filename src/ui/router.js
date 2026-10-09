// Hash router: works on any static host (GitHub Pages) and offline, with no server rewrites.

const routes = [];

/** Register a route pattern like "/cards/:id/edit" with an async handler(params) returning {title, body, after?}. */
export function route(pattern, handler, meta = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ pattern, re, keys, handler, meta });
}

export function currentPath() {
  const h = location.hash.replace(/^#/, '') || '/home';
  return h.split('?')[0];
}

export function query() {
  const q = location.hash.split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(q));
}

export function match(path) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) return { ...r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export const go = (path) => { location.hash = path; };
