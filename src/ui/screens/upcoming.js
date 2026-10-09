// Screens whose features arrive in later phases. Each says honestly what is and isn't built yet.

import { html, icon } from '../html.js';
import { listCards } from '../../data/repo.js';
import { cardLabel } from '../../core/card.js';
import { relativeTime } from '../ui-kit.js';

const soon = (title, phase, what, iconName) => async () => ({
  title,
  body: html`
    <div class="empty">
      ${icon(iconName)}
      <h2>Coming in Phase ${phase}</h2>
      <p>${what}</p>
      <p class="muted">Not built yet — this screen is a placeholder so navigation is complete.</p>
    </div>`,
});

export const ask = soon('Ask EKFBA', 3, 'Type where you are spending and how much — for example “₹65,000 TV at Croma” — and get the best card from your wallet with the savings, rewards, milestone impact and how fresh the offer data is. Works offline.', 'spark');
export const logPurchase = soon('Log a purchase', 4, 'Confirm a purchase after a recommendation, or add one manually. Edits, cancellations and refunds update your milestones; duplicates are detected.', 'receipt');
export const milestones = soon('Milestones', 5, 'Track annual-fee reversal and lounge-access spending for each card, in its own measurement period, with deadline warnings.', 'target');
export const history = soon('Purchase history', 4, 'Search and filter every purchase by card, bank, merchant, category, date, status and eligibility. Export to CSV or JSON.', 'list');
export const offers = soon('Offers & terms', 2, 'Browse benefits and offers per card with their conditions, validity dates, sources and verification status.', 'tag');
export const reminders = soon('Reminders', 5, 'Fee deadlines, lounge qualification periods, expiring offers and stale information, in-app and as notifications where your phone allows.', 'bell');

export async function sources() {
  const cards = (await listCards()).filter((c) => c.status === 'active');
  return {
    title: 'Data freshness',
    body: html`
      <p class="lead">Every benefit and offer will show where it came from and when it was last checked. Rule-pack import arrives in Phase 2.</p>
      ${cards.length ? html`<ul class="fresh-list">${cards.map((c) => html`
        <li>
          <a href="#/cards/${c.id}">${cardLabel(c)}</a>
          ${c.lastVerifiedAt
            ? html`<span class="chip chip--ok">Verified ${relativeTime(c.lastVerifiedAt)}</span>`
            : html`<span class="chip chip--warn">No verified rules</span>`}
          <span class="muted small">${c.sourceUrls.length} official link${c.sourceUrls.length === 1 ? '' : 's'} saved</span>
        </li>`)}</ul>`
      : html`<div class="empty empty--compact">${icon('card')}<p>No active cards yet.</p></div>`}`,
  };
}
