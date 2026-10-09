import { html, icon } from '../html.js';
import { counts, listCards, getSetting } from '../../data/repo.js';
import { relativeTime } from '../ui-kit.js';
import { cardTile } from './cards.js';

export async function home() {
  const c = await counts();
  const cards = await listCards();
  const active = cards.filter((x) => x.status === 'active');
  const lastBackupAt = await getSetting('lastBackupAt');
  const unverified = active.filter((x) => !x.lastVerifiedAt);
  const backupStale = c.totalCards > 0 && (!lastBackupAt || Date.now() - Date.parse(lastBackupAt) > 30 * 86400000);

  const alerts = [];
  if (backupStale) alerts.push(html`<a class="alert" href="#/settings">${icon('download')}<span><strong>Back up your wallet.</strong> Last backup: ${relativeTime(lastBackupAt)}.</span></a>`);
  if (unverified.length) alerts.push(html`<a class="alert alert--warn" href="#/sources">${icon('alert')}<span><strong>${unverified.length} card${unverified.length > 1 ? 's have' : ' has'} no verified benefit rules.</strong> Recommendations need them.</span></a>`);

  return {
    title: 'EKFBA',
    body: html`
      <a class="ask-cta" href="#/ask">
        <span class="ask-cta__q">Where are you spending, and how much?</span>
        <span class="ask-cta__hint">${icon('spark')} Ask EKFBA which card to use</span>
      </a>

      <div class="stats">
        <a class="stat" href="#/cards"><span class="stat__n">${c.activeCredit}</span><span class="stat__l">Credit cards</span></a>
        <a class="stat" href="#/cards"><span class="stat__n">${c.activeDebit}</span><span class="stat__l">Debit cards</span></a>
        <a class="stat" href="#/history"><span class="stat__n">${c.transactions}</span><span class="stat__l">Purchases logged</span></a>
      </div>

      ${alerts.length ? html`<div class="alerts">${alerts}</div>` : ''}

      ${active.length ? html`
        <h2 class="section-title">Your wallet <a class="link" href="#/cards">See all</a></h2>
        <div class="tiles tiles--scroll">${active.slice(0, 8).map(cardTile)}</div>`
      : html`<div class="empty empty--compact">
          <h2>Start with your wallet</h2>
          <p>Add the cards you own. Benefits and offers come next.</p>
          <a class="btn btn--primary" href="#/cards/new">${icon('plus')} Add a card</a>
        </div>`}

      <h2 class="section-title">Spending milestones</h2>
      <div class="panel panel--quiet">
        <p class="muted">Fee-waiver and lounge-access progress will show here once purchases and milestone rules are added (Phases 4–5).</p>
      </div>`,
  };
}
