// Insurance policies (moved in from the NLNLALD Policies page). Same record shape as NLNLALD:
// { insurer, type, people[], renewalDate, coverage, comments, documents[{kind,label,url}], createdAt, updatedAt }.
// Policy numbers are never stored. Pure functions only.

import { scanForSensitiveData } from './sensitive.js';

export const POLICY_TYPES = ['Life', 'Motor', 'Health', 'Home', 'Others'];
export const DOC_KINDS = ['Policy copy', 'E-card', 'Other'];

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const isHttps = (u) => /^https:\/\/\S+$/i.test(u || '');

/** Splits "Nithish, Nandini" (or a list) into unique trimmed names, keeping the first spelling. */
export function parsePeople(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(/[,;\n]/);
  const out = [];
  for (const raw of list) {
    const n = String(raw).trim().replace(/\s+/g, ' ');
    if (n && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out;
}

export function peopleOf(p) { return Array.isArray(p.people) ? p.people : p.holder ? [p.holder] : []; }

/** Validates a policy draft. Returns { ok, policy } or { ok: false, errors }. */
export function validatePolicy(d, existing = null, now = Date.now()) {
  const errors = {};
  const p = {
    insurer: String(d.insurer || '').trim(),
    type: String(d.type || '').trim(),
    people: parsePeople(d.people),
    renewalDate: String(d.renewalDate || '').trim(),
    coverage: String(d.coverage || '').trim(),
    comments: String(d.comments || '').trim(),
    documents: (d.documents || []).map((x) => ({ kind: DOC_KINDS.includes(x.kind) ? x.kind : 'Other', label: String(x.label || '').trim() || x.kind || 'Document', url: String(x.url || '').trim() })),
    vehicleId: typeof d.vehicleId === 'string' && d.vehicleId ? d.vehicleId : null,
  };
  if (!p.insurer) errors.insurer = 'Enter the insurance company.';
  if (p.insurer.length > 80) errors.insurer = 'Keep the name under 80 characters.';
  if (!p.type) errors.type = 'Pick the type of insurance.';
  if (p.type.length > 30) errors.type = 'Keep the type under 30 characters.';
  if (!isDate(p.renewalDate)) errors.renewalDate = 'Pick a valid renewal date.';
  if (p.coverage.length > 200) errors.coverage = 'Keep coverage under 200 characters.';
  if (p.comments.length > 1000) errors.comments = 'Comments are too long (1000 characters).';
  p.documents.forEach((x, i) => { if (!isHttps(x.url)) errors[`documents.${i}`] = 'Document links must start with https://'; });
  const s = scanForSensitiveData({ insurer: p.insurer, coverage: p.coverage, comments: p.comments, people: p.people });
  if (s) errors[s.path] = `Not saved: ${s.reason}.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, policy: { ...p, id: existing?.id || d.id, createdAt: existing?.createdAt || d.createdAt || now, updatedAt: now } };
}

/** Policies sorted by renewal date (no date last). */
export function sortPolicies(list) {
  return [...list].sort((a, b) => (a.renewalDate || '9999').localeCompare(b.renewalDate || '9999') || String(a.insurer).localeCompare(String(b.insurer)));
}

/** Everyone covered across policies, alphabetical. */
export function allPeople(list) {
  return [...new Set(list.flatMap(peopleOf).map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const compact = (d) => d.replace(/-/g, '');
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/** Google Calendar link for a renewal reminder `offset` days before; null if that day has passed. */
export function policyCalendarLink(p, offset, today) {
  if (!isDate(p.renewalDate)) return null;
  const start = addDays(p.renewalDate, -offset);
  if (start < today) return null;
  const text = `${p.type} insurance: ${p.insurer} renews ${offset ? `in ${offset} days` : 'today'}`;
  const details = 'Covered: ' + (peopleOf(p).join(', ') || '-');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(text)
    + '&dates=' + compact(start) + '/' + compact(addDays(start, 1)) + '&details=' + encodeURIComponent(details);
}
