// Family members: the people policies cover and cards belong to. Names only (and an optional relation).

import { scanForSensitiveData } from './sensitive.js';

export const ID_DOC_TYPES = ['Aadhaar', 'PAN', 'Driving Licence', 'Passport', 'Voter ID', 'Other'];
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const isHttps = (u) => /^https:\/\/\S+$/i.test(u || '');

/** Shows only the last 4 characters of an ID number: "•••• •••• 1234". */
export function maskId(n) {
  const s = String(n || '').replace(/\s+/g, '');
  if (s.length <= 4) return s;
  return '•'.repeat(Math.min(8, s.length - 4)).replace(/(.{4})/g, '$1 ').trim() + ' ' + s.slice(-4);
}

/** Normalises and checks one ID document row: { type, number, url }. Returns [doc, error|null]. */
export function checkIdDoc(x) {
  const doc = { type: ID_DOC_TYPES.includes(x.type) ? x.type : 'Other', number: String(x.number || '').trim().toUpperCase().replace(/\s+/g, ' '), url: String(x.url || '').trim(), label: String(x.label || '').trim() };
  const compact = doc.number.replace(/[\s-]/g, '');
  if (!doc.number && !doc.url) return [doc, 'Add the number, the link, or both.'];
  if (doc.type === 'Aadhaar' && doc.number && !/^\d{12}$/.test(compact)) return [doc, 'Aadhaar numbers have 12 digits.'];
  if (doc.type === 'Aadhaar' && doc.number) doc.number = compact.replace(/(\d{4})(?=\d)/g, '$1 ');
  if (doc.type === 'PAN' && doc.number && !/^[A-Z]{5}\d{4}[A-Z]$/.test(compact)) return [doc, 'PAN looks like ABCDE1234F.'];
  if (doc.type === 'PAN') doc.number = compact;
  if (doc.number.length > 30) return [doc, 'Keep the number under 30 characters.'];
  if (doc.url && !isHttps(doc.url)) return [doc, 'Paste a link that starts with https://'];
  if (doc.label.length > 40) return [doc, 'Keep the name under 40 characters.'];
  return [doc, null];
}

/** Normalises and checks one vaccination row: { name, dose, givenOn, nextDue, url, notes }. Returns [row, error|null]. */
export function checkVaccination(x) {
  const v = { name: String(x.name || '').trim(), dose: String(x.dose || '').trim(), givenOn: String(x.givenOn || '').trim(),
    nextDue: String(x.nextDue || '').trim(), url: String(x.url || '').trim(), notes: String(x.notes || '').trim() };
  if (!v.name) return [v, 'Enter the vaccine name.'];
  if (v.name.length > 60 || v.dose.length > 30) return [v, 'Keep the vaccine name under 60 and the dose under 30 characters.'];
  if (!v.givenOn && !v.nextDue) return [v, 'Add the date it was given, the next due date, or both.'];
  if (v.givenOn && !isDate(v.givenOn)) return [v, 'Use a valid date for “Given on”.'];
  if (v.nextDue && !isDate(v.nextDue)) return [v, 'Use a valid date for “Next due”.'];
  if (v.givenOn && v.nextDue && v.nextDue <= v.givenOn) return [v, 'The next due date must be after the date given.'];
  if (v.url && !isHttps(v.url)) return [v, 'Paste a link that starts with https://'];
  if (v.notes.length > 200) return [v, 'Keep the notes under 200 characters.'];
  return [v, null];
}

/** The next vaccination due for a member (earliest nextDue), or null. */
export function nextVaccination(member) {
  return (member.vaccinations || []).filter((v) => v.nextDue).sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0] || null;
}

export const RELATIONS = ['Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Other'];

/** Validates a family member. `others` are the existing members, to stop duplicate names. */
export function validateMember(d, others = [], existing = null, now = Date.now()) {
  const errors = {};
  const m = { name: String(d.name || '').trim().replace(/\s+/g, ' '), relation: RELATIONS.includes(d.relation) ? d.relation : '' };
  m.documents = (d.documents || []).filter((x) => String(x.number || '').trim() || String(x.url || '').trim()).map((x, i) => {
    const [doc, err] = checkIdDoc(x);
    if (err) errors[`documents.${i}`] = err;
    return doc;
  });
  m.vaccinations = (d.vaccinations || []).filter((x) => ['name', 'givenOn', 'nextDue', 'url'].some((k) => String(x[k] || '').trim())).map((x, i) => {
    const [v, err] = checkVaccination(x);
    if (err) errors[`vaccinations.${i}`] = err;
    return v;
  });
  if (!m.name) errors.name = 'Enter a name.';
  if (m.name.length > 40) errors.name = 'Keep the name under 40 characters.';
  if (m.name && others.some((o) => o.id !== (existing?.id || d.id) && o.name.toLowerCase() === m.name.toLowerCase())) errors.name = `${m.name} is already in the family list.`;
  const s = scanForSensitiveData({ name: m.name, docs: m.documents.map((x) => x.url), vacc: m.vaccinations.map((v) => v.notes) });
  if (s) errors[s.path] = `Not saved: ${s.reason}.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, member: { ...m, id: existing?.id || d.id, createdAt: existing?.createdAt || d.createdAt || now, updatedAt: now } };
}

/** Policies with a renamed person, for applying a rename everywhere. Returns only the changed policies. */
export function renameInPolicies(policies, from, to) {
  const lc = from.toLowerCase();
  return policies.filter((p) => (p.people || []).some((n) => n.toLowerCase() === lc))
    .map((p) => ({ ...p, people: [...new Set(p.people.map((n) => (n.toLowerCase() === lc ? to : n)))] }));
}
