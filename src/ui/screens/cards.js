import { html, icon } from '../html.js';
import { listCards, getCard, saveCard, setCardStatus } from '../../data/repo.js';
import { NETWORKS, cardLabel } from '../../core/card.js';
import { formatPaise, parseRupeesToPaise } from '../../core/money.js';
import { go } from '../router.js';
import { toast, confirmDialog } from '../ui-kit.js';

const BANKS = ['American Express', 'AU Small Finance Bank', 'Axis Bank', 'Bank of Baroda', 'Canara Bank', 'Federal Bank', 'HDFC Bank',
  'HSBC', 'ICICI Bank', 'IDFC FIRST Bank', 'IndusInd Bank', 'Kotak Mahindra Bank', 'OneCard', 'Punjab National Bank', 'RBL Bank',
  'SBI Card', 'Standard Chartered', 'State Bank of India', 'Union Bank of India', 'Yes Bank'];

const STATUS_LABEL = { active: 'Active', deactivated: 'Deactivated', replaced: 'Replaced', archived: 'Archived' };

export function cardTile(c) {
  return html`
    <a class="card-tile net-${c.network.replace(/\s+/g, '-').toLowerCase()} ${c.status !== 'active' ? 'is-inactive' : ''}" href="#/cards/${c.id}">
      <div class="card-tile__top">
        <span class="card-tile__bank">${c.bank}</span>
        <span class="chip chip--${c.kind}">${c.kind === 'credit' ? 'Credit' : 'Debit'}</span>
      </div>
      <div class="card-tile__name">${c.nickname || c.name}</div>
      <div class="card-tile__bottom">
        <span>${c.nickname ? c.name : (c.variant || '')}</span>
        <span class="mono">${c.last4 ? '•••• ' + c.last4 : ''}</span>
      </div>
      <div class="card-tile__meta">
        <span>${c.network}</span>
        ${c.status !== 'active' ? html`<span class="chip chip--muted">${STATUS_LABEL[c.status]}</span>` : ''}
        ${!c.lastVerifiedAt ? html`<span class="chip chip--warn">Rules not added</span>` : ''}
      </div>
    </a>`;
}

export async function cardsList(_, q) {
  const showAll = q.all === '1';
  const cards = await listCards({ includeArchived: showAll });
  const credit = cards.filter((c) => c.kind === 'credit');
  const debit = cards.filter((c) => c.kind === 'debit');
  const section = (title, list) => list.length ? html`<h2 class="section-title">${title} <span class="count">${list.length}</span></h2><div class="tiles">${list.map(cardTile)}</div>` : '';
  return {
    title: 'My Cards',
    action: html`<a class="btn btn--primary btn--sm" href="#/cards/new">${icon('plus')} Add card</a>`,
    body: cards.length ? html`
      ${section('Credit cards', credit)}
      ${section('Debit cards', debit)}
      <p class="center"><a class="link" href="#/cards${showAll ? '' : '?all=1'}">${showAll ? 'Hide archived cards' : 'Show archived cards'}</a></p>`
      : html`
      <div class="empty">
        ${icon('card')}
        <h2>Your wallet is empty</h2>
        <p>Add each credit and debit card you own. Only a nickname or the last 4 digits are stored — never the full number, CVV or PIN.</p>
        <a class="btn btn--primary" href="#/cards/new">${icon('plus')} Add your first card</a>
        ${showAll ? '' : html`<p><a class="link" href="#/cards?all=1">Show archived cards</a></p>`}
      </div>`,
  };
}

const rupees = (p) => (p == null ? '' : String(p / 100));

function cardForm(c = {}, errors = {}) {
  const err = (f) => (errors[f] ? html`<span class="field__error" role="alert">${errors[f]}</span>` : '');
  const opt = (v, cur, label = v) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  return html`
  <form id="card-form" class="form" novalidate>
    ${errors._form ? html`<div class="banner banner--error">${errors._form}</div>` : ''}
    <input type="hidden" name="id" value="${c.id || ''}">
    <input type="hidden" name="version" value="${c.version ?? ''}">
    <input type="hidden" name="status" value="${c.status || 'active'}">
    <fieldset class="segmented" aria-label="Card type">
      <label><input type="radio" name="kind" value="credit" ${c.kind !== 'debit' ? 'checked' : ''}><span>Credit card</span></label>
      <label><input type="radio" name="kind" value="debit" ${c.kind === 'debit' ? 'checked' : ''}><span>Debit card</span></label>
    </fieldset>
    <label class="field"><span>Bank</span>
      <input name="bank" list="bank-list" value="${c.bank || ''}" autocomplete="off" required placeholder="e.g. HDFC Bank">
      <datalist id="bank-list">${BANKS.map((b) => html`<option value="${b}">`)}</datalist>${err('bank')}</label>
    <label class="field"><span>Card name</span>
      <input name="name" value="${c.name || ''}" required placeholder="e.g. Millennia">${err('name')}</label>
    <div class="row2">
      <label class="field"><span>Variant / tier <em>optional</em></span>
        <input name="variant" value="${c.variant || ''}" placeholder="e.g. Signature">${err('variant')}</label>
      <label class="field"><span>Network</span>
        <select name="network" required>${opt('', c.network, 'Choose…')}${NETWORKS.map((n) => opt(n, c.network))}</select>${err('network')}</label>
    </div>
    <div class="row2">
      <label class="field"><span>Nickname</span>
        <input name="nickname" value="${c.nickname || ''}" maxlength="40" placeholder="e.g. Shopping card">${err('nickname')}</label>
      <label class="field"><span>Last 4 digits</span>
        <input name="last4" value="${c.last4 || ''}" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="off" placeholder="1234">${err('last4')}</label>
    </div>
    <p class="hint">${icon('shield')} Never enter the full card number, CVV, PIN or OTP. The app refuses to save them.</p>
    <label class="field"><span>Holder</span>
      <select name="holder">${opt('primary', c.holder || 'primary', 'Primary card')}${opt('add-on', c.holder, 'Add-on / supplementary')}</select></label>
    <div class="row2">
      <label class="field"><span>Joining fee (₹)</span>
        <input name="joiningFee" value="${rupees(c.joiningFeePaise)}" inputmode="decimal" placeholder="0">${err('joiningFeePaise')}</label>
      <label class="field"><span>Annual fee (₹)</span>
        <input name="annualFee" value="${rupees(c.annualFeePaise)}" inputmode="decimal" placeholder="0">${err('annualFeePaise')}</label>
    </div>
    <div class="row2">
      <label class="field"><span>Card issue / anniversary date <em>optional</em></span>
        <input type="date" name="issueDate" value="${c.issueDate || ''}">${err('issueDate')}</label>
      <label class="field"><span>Statement day <em>credit, optional</em></span>
        <input name="statementDay" value="${c.statementDay ?? ''}" inputmode="numeric" maxlength="2" placeholder="e.g. 15">${err('statementDay')}</label>
    </div>
    <label class="field"><span>Official benefit / T&amp;C links <em>one per line</em></span>
      <textarea name="sourceUrls" rows="2" placeholder="https://…">${(c.sourceUrls || []).join('\n')}</textarea>
      ${Object.keys(errors).filter((k) => k.startsWith('sourceUrls')).map((k) => err(k))}</label>
    <label class="field"><span>Notes <em>optional</em></span>
      <textarea name="notes" rows="3">${c.notes || ''}</textarea>${err('notes')}</label>
    <div class="form__actions">
      <a class="btn btn--ghost" href="${c.id ? `#/cards/${c.id}` : '#/cards'}">Cancel</a>
      <button class="btn btn--primary" type="submit">${c.id ? 'Save changes' : 'Add card'}</button>
    </div>
  </form>`;
}

function readForm(form) {
  const f = Object.fromEntries(new FormData(form));
  const fee = (v) => (v.trim() === '' ? null : parseRupeesToPaise(v) ?? -1);
  const sd = f.statementDay.trim();
  return {
    id: f.id || undefined,
    version: f.version === '' ? null : Number(f.version),
    status: f.status,
    kind: f.kind,
    bank: f.bank,
    name: f.name,
    variant: f.variant,
    network: f.network,
    nickname: f.nickname,
    last4: f.last4,
    holder: f.holder,
    joiningFeePaise: fee(f.joiningFee),
    annualFeePaise: fee(f.annualFee),
    issueDate: f.issueDate,
    statementDay: sd === '' ? null : (/^\d+$/.test(sd) ? Number(sd) : -1),
    sourceUrls: f.sourceUrls.split('\n'),
    notes: f.notes,
  };
}

function bindForm(container, initial) {
  const form = container.querySelector('#card-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const draft = readForm(form);
    const r = await saveCard(draft);
    if (!r.ok) {
      const body = container.querySelector('.screen__body');
      body.innerHTML = String(cardForm({ ...initial, ...draft, sourceUrls: draft.sourceUrls }, r.errors));
      bindForm(container, initial);
      body.querySelector('.field__error, .banner--error')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    toast(draft.id ? 'Card updated' : 'Card added');
    go(`/cards/${r.card.id}`);
  });
}

export async function cardNew() {
  return { title: 'Add card', back: '#/cards', body: cardForm(), after: (el) => bindForm(el, {}) };
}

export async function cardEdit({ id }) {
  const c = await getCard(id);
  if (!c) return notFound();
  return { title: 'Edit card', back: `#/cards/${id}`, body: cardForm(c), after: (el) => bindForm(el, c) };
}

function notFound() {
  return { title: 'Not found', back: '#/cards', body: html`<div class="empty"><h2>Card not found</h2><a class="btn" href="#/cards">Back to My Cards</a></div>` };
}

export async function cardDetail({ id }) {
  const c = await getCard(id);
  if (!c) return notFound();
  const others = (await listCards()).filter((x) => x.id !== c.id && x.status === 'active');
  const row = (k, v) => (v === '' || v == null ? '' : html`<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`);
  const actions = [];
  if (c.status === 'active') actions.push(html`<button class="btn btn--ghost" data-status="deactivated">Deactivate</button>`);
  else actions.push(html`<button class="btn btn--ghost" data-status="active">Reactivate</button>`);
  if (c.status !== 'replaced' && others.length) actions.push(html`<button class="btn btn--ghost" data-replace>Mark as replaced</button>`);
  if (c.status !== 'archived') actions.push(html`<button class="btn btn--ghost btn--danger" data-status="archived">Archive</button>`);
  const replacement = c.replacedById ? await getCard(c.replacedById) : null;

  return {
    title: cardLabel(c),
    back: '#/cards',
    action: html`<a class="btn btn--sm" href="#/cards/${c.id}/edit">${icon('edit')} Edit</a>`,
    body: html`
      <div class="tiles tiles--single">${cardTile(c)}</div>
      ${replacement ? html`<div class="banner">Replaced by <a href="#/cards/${replacement.id}">${cardLabel(replacement)}</a></div>` : ''}
      <section class="panel">
        <h2 class="panel__title">Card details</h2>
        <dl>
          ${row('Bank', c.bank)}${row('Card', c.name)}${row('Variant / tier', c.variant)}
          ${row('Type', c.kind === 'credit' ? 'Credit card' : 'Debit card')}${row('Network', c.network)}
          ${row('Holder', c.holder === 'add-on' ? 'Add-on / supplementary' : 'Primary')}
          ${row('Joining fee', c.joiningFeePaise != null ? formatPaise(c.joiningFeePaise) : '')}
          ${row('Annual fee', c.annualFeePaise != null ? formatPaise(c.annualFeePaise) : '')}
          ${row('Issue / anniversary', c.issueDate)}${row('Statement day', c.statementDay)}
          ${row('Status', STATUS_LABEL[c.status])}
        </dl>
        ${c.notes ? html`<p class="notes">${c.notes}</p>` : ''}
      </section>
      <section class="panel">
        <h2 class="panel__title">Benefits, offers &amp; milestones</h2>
        <div class="banner banner--warn">${icon('alert')} No verified benefit rules yet. Share this card's official benefit page or T&amp;C PDF in your Claude project chat; the rule pack you import (Phase 2) will appear here with sources and verification dates.</div>
        ${c.sourceUrls.length ? html`<h3 class="sub">Official sources you added</h3><ul class="links">${c.sourceUrls.map((u) => html`<li><a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a></li>`)}</ul>` : ''}
      </section>
      <div class="actions">${actions}</div>`,
    after: (el) => {
      el.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
        const s = b.dataset.status;
        if (s === 'archived' && !(await confirmDialog('Archive this card? It will be hidden from recommendations but its history is kept.', 'Archive'))) return;
        const r = await setCardStatus(c.id, s);
        if (r.ok) { toast(`Card ${STATUS_LABEL[s].toLowerCase()}`); go(`/cards/${c.id}?t=${Date.now()}`); }
      }));
      el.querySelector('[data-replace]')?.addEventListener('click', async () => {
        const choice = await confirmDialog(html`Which card replaced it?
          <select id="replace-with" class="select-block">${others.map((o) => html`<option value="${o.id}">${cardLabel(o)}</option>`)}</select>`, 'Mark replaced', () => document.getElementById('replace-with').value);
        if (!choice) return;
        const r = await setCardStatus(c.id, 'replaced', { replacedById: choice });
        if (r.ok) { toast('Card marked as replaced'); go(`/cards/${c.id}?t=${Date.now()}`); }
      });
    },
  };
}
