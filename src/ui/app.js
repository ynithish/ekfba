import { html, icon } from './html.js';
import { route, match, currentPath, query } from './router.js';
import { toast } from './ui-kit.js';
import { home } from './screens/home.js';
import { cardsList, cardNew, cardEdit, cardDetail } from './screens/cards.js';
import { settings } from './screens/settings.js';
import { ask, logPurchase, milestones, history as historyScreen, offers, reminders, sources } from './screens/upcoming.js';
import { openDb } from '../data/db.js';

let installPrompt = null;

async function more() {
  const item = (href, ic, label, sub) => html`<a class="menu__item" href="${href}">${icon(ic)}<span><strong>${label}</strong><small>${sub}</small></span>${icon('chevron')}</a>`;
  return {
    title: 'More',
    body: html`
      <nav class="menu">
        ${item('#/milestones', 'target', 'Milestones', 'Fee reversal & lounge access')}
        ${item('#/offers', 'tag', 'Offers & terms', 'Benefits and conditions per card')}
        ${item('#/log', 'receipt', 'Log a purchase', 'Record a transaction')}
        ${item('#/reminders', 'bell', 'Reminders', 'Deadlines and expiring offers')}
        ${item('#/sources', 'refresh', 'Data freshness', 'Sources and verification')}
        ${item('#/settings', 'gear', 'Settings & backup', 'Export, restore, privacy')}
      </nav>
      ${installPrompt ? html`<button class="btn btn--primary btn--block" id="install">${icon('download')} Install EKFBA on this device</button>` : ''}`,
    after: (el) => el.querySelector('#install')?.addEventListener('click', async () => {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      render();
    }),
  };
}

route('/home', home);
route('/cards', cardsList);
route('/cards/new', cardNew);
route('/cards/:id', cardDetail);
route('/cards/:id/edit', cardEdit);
route('/ask', ask);
route('/log', logPurchase);
route('/milestones', milestones);
route('/history', historyScreen);
route('/offers', offers);
route('/reminders', reminders);
route('/sources', sources);
route('/settings', settings);
route('/more', more);

const NAV = [
  ['/home', 'home', 'Home'],
  ['/cards', 'card', 'Cards'],
  ['/ask', 'spark', 'Ask'],
  ['/history', 'list', 'History'],
  ['/more', 'menu', 'More'],
];

function navHtml(path) {
  const section = '/' + (path.split('/')[1] || 'home');
  const moreSections = ['/milestones', '/offers', '/log', '/reminders', '/sources', '/settings', '/more'];
  return NAV.map(([href, ic, label]) => {
    const active = section === href || (href === '/more' && moreSections.includes(section));
    return html`<a href="#${href}" class="nav__item ${href === '/ask' ? 'nav__item--ask' : ''}" ${active ? html`aria-current="page"` : ''}>${icon(ic)}<span>${label}</span></a>`;
  });
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const path = currentPath();
  const m = match(path);
  const main = document.getElementById('screen');
  let view;
  try {
    view = m ? await m.handler(m.params, query()) : { title: 'Not found', body: html`<div class="empty"><h2>Page not found</h2><a class="btn" href="#/home">Go home</a></div>` };
  } catch (err) {
    console.error(err);
    view = { title: 'Something went wrong', body: html`<div class="empty"><h2>Something went wrong</h2><p>${err.message}</p><a class="btn" href="#/home">Go home</a></div>` };
  }
  if (seq !== renderSeq) return; // a newer navigation started
  document.title = view.title === 'EKFBA' ? 'EKFBA Card Manager' : `${view.title} · EKFBA`;
  main.innerHTML = String(html`
    <header class="topbar">
      ${view.back ? html`<a class="topbar__back" href="${view.back}" aria-label="Back">${icon('back')}</a>` : html`<span class="topbar__logo" aria-hidden="true">${icon('logo')}</span>`}
      <h1 class="topbar__title">${view.title}</h1>
      <div class="topbar__action">${view.action || ''}</div>
    </header>
    <div class="screen__body">${view.body}</div>`);
  document.getElementById('nav').innerHTML = String(navHtml(path));
  view.after?.(main);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function updateOnline() {
  const off = !navigator.onLine;
  document.body.classList.toggle('is-offline', off);
  document.getElementById('net').textContent = off ? 'Offline — using data saved on this device' : '';
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const offerUpdate = (worker) => toast('A new version of EKFBA is ready.', {
      timeout: 0,
      action: { label: 'Update', onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
    });
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  } catch (err) {
    console.warn('Service worker registration failed', err);
  }
}

async function start() {
  try { await openDb(); } catch (err) {
    document.getElementById('screen').innerHTML = String(html`<div class="empty"><h2>Storage unavailable</h2>
      <p>This browser is blocking local storage (private/incognito mode can do this). EKFBA needs it to keep your wallet on the device.</p><p class="muted">${err.message}</p></div>`);
    return;
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  updateOnline();
  if (!location.hash) history.replaceState(null, '', '#/home');
  await render();
  registerSW();
  document.documentElement.dataset.ready = '1';
}

start();
