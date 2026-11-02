import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../api.js';
import { cleanPlan, defaultPlan } from '../../../shared/safety-plan.js';

// The family safety plan, shared by every part of the app that shows it (the
// plan editor, the pop-up shelter guide, the dashboard card, Rocky's storm
// steps). A copy stays in localStorage so the shelter spot still shows when the
// internet goes out in the middle of a storm.
const KEY = 'weather-scout:safety-plan';
const readLocal = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw ? { ...raw, plan: cleanPlan(raw.plan) } : null;
  } catch {
    return null;
  }
};
const writeLocal = (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
};

let state = { plan: defaultPlan(), canEdit: false, canTick: false, contactsHidden: false, updatedAt: null, updatedBy: '', ...readLocal(), loaded: false, error: '' };
const subs = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
const accept = (r) => {
  const next = { plan: cleanPlan(r.plan), canEdit: !!r.canEdit, canTick: !!r.canTick, contactsHidden: !!r.contactsHidden, updatedAt: r.updatedAt || null, updatedBy: r.updatedBy || '' };
  // Keep the contacts we already had offline when signed out; never write a
  // guest copy over a signed-in one's phone numbers.
  if (next.canTick || !state.plan.contacts.length) writeLocal(next);
  set({ ...next, loaded: true, error: '' });
  return next;
};

let inflight = null;
export function refreshSafetyPlan() {
  inflight ||= api('/api/safety-plan')
    .then(accept)
    .catch((e) => set({ loaded: true, error: e.status === 401 ? '' : e.message }))
    .finally(() => { inflight = null; });
  return inflight;
}

const call = (path, opts) => api(path, opts).then(accept);
export const safetyActions = {
  save: (plan) => call('/api/safety-plan', { method: 'PUT', body: plan }),
  reset: () => call('/api/safety-plan', { method: 'DELETE' }),
  tick: (id, done) => {
    // Show the tick straight away; the server answer replaces it.
    set({ plan: { ...state.plan, kit: state.plan.kit.map((k) => (k.id === id ? { ...k, done } : k)) } });
    return call(`/api/safety-plan/kit/${encodeURIComponent(id)}`, { method: 'PUT', body: { done } }).catch((e) => {
      refreshSafetyPlan();
      throw e;
    });
  },
  drill: () => call('/api/safety-plan/drill', { method: 'POST', body: {} }),
};

/** The plan, plus who may change it. Pass the signed-in user so it reloads on sign-in. */
export function useSafetyPlan(userId) {
  const s = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
  useEffect(() => {
    refreshSafetyPlan();
  }, [userId]);
  return s;
}

// Anything can open the plan or the shelter guide without threading props
// through App: SafetyCenter listens for this event.
export const SAFETY_EVENT = 'weather-scout:safety';
export function openSafety(view = 'plan', hazard) {
  window.dispatchEvent(new CustomEvent(SAFETY_EVENT, { detail: { view, hazard } }));
}
