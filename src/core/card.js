// Card model: validation and normalisation for wallet cards.
// Benefit and offer rules are NOT stored on the card; they live in versioned rule records (Phase 2).

import { scanForSensitiveData, findExpiryDate } from './sensitive.js';
import { uuid } from './ids.js';

export const CARD_KINDS = ['credit', 'debit'];
export const NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'American Express', 'Diners Club', 'Other'];
export const HOLDER_TYPES = ['primary', 'add-on'];
export const CARD_STATUSES = ['active', 'deactivated', 'replaced', 'archived'];

const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const isUrl = (s) => { try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };
const isPaise = (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 1_00_00_000_00);

/**
 * Validates a card draft. Returns { ok: true, card } with a normalised record, or { ok: false, errors: {field: message} }.
 * `existing` is the stored record when editing, so ids, timestamps and version are preserved.
 */
export function validateCard(draft, existing = null) {
  const errors = {};
  const c = {
    bank: trim(draft.bank) || '',
    name: trim(draft.name) || '',
    kind: draft.kind,
    network: draft.network,
    variant: trim(draft.variant) || '',
    tier: trim(draft.tier) || '',
    holder: draft.holder || 'primary',
    holderName: trim(draft.holderName) || '',
    nickname: trim(draft.nickname) || '',
    last4: trim(draft.last4) || '',
    joiningFeePaise: draft.joiningFeePaise ?? null,
    annualFeePaise: draft.annualFeePaise ?? null,
    issueDate: trim(draft.issueDate) || '',
    statementDay: draft.statementDay ?? null,
    dueDay: draft.dueDay ?? null,
    status: draft.status || 'active',
    replacedById: draft.replacedById || null,
    sourceUrls: (draft.sourceUrls || []).map(trim).filter(Boolean),
    notes: trim(draft.notes) || '',
  };

  if (!c.bank) errors.bank = 'Bank is required';
  if (!c.name) errors.name = 'Card name is required';
  if (!CARD_KINDS.includes(c.kind)) errors.kind = 'Choose credit or debit';
  if (!NETWORKS.includes(c.network)) errors.network = 'Choose a card network';
  if (!HOLDER_TYPES.includes(c.holder)) errors.holder = 'Invalid holder type';
  if (!CARD_STATUSES.includes(c.status)) errors.status = 'Invalid status';
  if (c.last4 && !/^\d{4}$/.test(c.last4)) errors.last4 = 'Enter exactly the last 4 digits — never the full number';
  if (!c.last4 && !c.nickname) errors.nickname = 'Give a nickname or the last 4 digits so you can tell cards apart';
  if (c.nickname.length > 40) errors.nickname = 'Keep the nickname under 40 characters';
  if (c.holderName.length > 60) errors.holderName = 'Keep the name under 60 characters';
  if (!isPaise(c.joiningFeePaise)) errors.joiningFeePaise = 'Invalid amount';
  if (!isPaise(c.annualFeePaise)) errors.annualFeePaise = 'Invalid amount';
  if (c.issueDate && !isDate(c.issueDate)) errors.issueDate = 'Use a valid date';
  if (c.statementDay !== null && !(Number.isInteger(c.statementDay) && c.statementDay >= 1 && c.statementDay <= 31)) {
    errors.statementDay = 'Statement day must be 1–31';
  }
  if (c.dueDay !== null && !(Number.isInteger(c.dueDay) && c.dueDay >= 1 && c.dueDay <= 31)) {
    errors.dueDay = 'Payment due day must be 1–31';
  }
  c.sourceUrls.forEach((u, i) => { if (!isUrl(u)) errors[`sourceUrls.${i}`] = 'Not a valid web address'; });
  if (c.notes.length > 2000) errors.notes = 'Notes are too long (max 2000 characters)';

  const sensitive = scanForSensitiveData(c);
  if (sensitive) errors[sensitive.path] = `Not saved: ${sensitive.reason}. Never store full card numbers, expiry dates, CVV, PIN or OTP.`;
  for (const f of ['nickname', 'notes', 'variant', 'name']) {
    const e = findExpiryDate(c[f]);
    if (e && !errors[f]) errors[f] = `Not saved: ${e}. Card expiry dates are never stored.`;
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const ts = Date.now(); // milliseconds, same convention as the NLNLALD modules
  return {
    ok: true,
    card: {
      ...c,
      id: existing?.id || draft.id || uuid(),
      createdAt: existing?.createdAt || draft.createdAt || ts,
      updatedAt: ts,
      version: (existing?.version || 0) + 1,
      lastVerifiedAt: draft.lastVerifiedAt !== undefined ? draft.lastVerifiedAt : (existing?.lastVerifiedAt ?? null),
    },
  };
}

/** Human label used across the UI, e.g. "HDFC Millennia ••4417" or the nickname. */
export function cardLabel(card) {
  const base = card.nickname || `${card.bank} ${card.name}`.trim();
  return card.last4 ? `${base} ••${card.last4}` : base;
}
