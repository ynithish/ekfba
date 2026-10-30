// Family members: the people policies cover and cards belong to. Names only (and an optional relation).

import { scanForSensitiveData } from './sensitive.js';

export const RELATIONS = ['Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Other'];

/** Validates a family member. `others` are the existing members, to stop duplicate names. */
export function validateMember(d, others = [], existing = null, now = Date.now()) {
  const errors = {};
  const m = { name: String(d.name || '').trim().replace(/\s+/g, ' '), relation: RELATIONS.includes(d.relation) ? d.relation : '' };
  if (!m.name) errors.name = 'Enter a name.';
  if (m.name.length > 40) errors.name = 'Keep the name under 40 characters.';
  if (m.name && others.some((o) => o.id !== (existing?.id || d.id) && o.name.toLowerCase() === m.name.toLowerCase())) errors.name = `${m.name} is already in the family list.`;
  const s = scanForSensitiveData({ name: m.name });
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
