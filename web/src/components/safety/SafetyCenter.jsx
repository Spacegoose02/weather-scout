import { useCallback, useEffect, useState } from 'react';
import ShelterGuide from './ShelterGuide.jsx';
import SafetyPlan from './SafetyPlan.jsx';
import { SAFETY_EVENT, safetyActions, useSafetyPlan } from '../../safety/useSafetyPlan.js';
import { markSeen, readSeen, shelterWatch } from '../../safety/watch.js';
import '../../safety/safety.css';

// Owns the family safety plan window and the "where to shelter" pop-up. It
// opens the pop-up by itself when a new shelter-worthy warning arrives, when a
// warning push notification is tapped, and whenever something calls
// openSafety() (the alerts banner, the dashboard card, the Kid Zone).
export default function SafetyCenter({ alerts, kidMode, user, onSignIn }) {
  const safety = useSafetyPlan(user?.id);
  const [view, setView] = useState(null); // null | 'plan' | 'shelter'
  const [practice, setPractice] = useState(null); // hazard id for a practice run
  const [focus, setFocus] = useState(null); // which warning's tab to show first
  const { active, fresh } = shelterWatch(alerts, readSeen());
  const activeKey = active.map((x) => x.alert.id).join(',');

  // A new warning: open the guide (once per warning, per device).
  useEffect(() => {
    if (fresh) {
      setPractice(null);
      setView('shelter');
    }
  }, [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const open = (e) => {
      const { view: v = 'plan', hazard } = e.detail || {};
      setPractice(v === 'shelter' && hazard && !active.some((x) => x.hazard.id === hazard) ? hazard : null);
      setFocus(hazard || null);
      setView(v);
    };
    const fromPush = (e) => e.data?.type === 'weather-scout:shelter' && setView('shelter');
    window.addEventListener(SAFETY_EVENT, open);
    navigator.serviceWorker?.addEventListener?.('message', fromPush);
    return () => {
      window.removeEventListener(SAFETY_EVENT, open);
      navigator.serviceWorker?.removeEventListener?.('message', fromPush);
    };
  }, [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a warning notification (/?shelter=1).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('shelter') === '1') {
      url.searchParams.delete('shelter');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      setView('shelter');
    }
  }, []);

  const closeShelter = useCallback(() => {
    markSeen(active.map((x) => x.alert.id));
    setView(null);
    setPractice(null);
  }, [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (view === 'shelter') {
    return (
      <ShelterGuide
        active={practice ? [] : active}
        practice={practice || 'tornado'}
        focus={focus}
        plan={safety.plan}
        kidMode={kidMode}
        onClose={closeShelter}
        onPlan={() => { markSeen(active.map((x) => x.alert.id)); setView('plan'); }}
        onDrillDone={safety.canTick ? () => safetyActions.drill().catch(() => {}).finally(() => setView(null)) : null}
      />
    );
  }
  if (view === 'plan') {
    return (
      <SafetyPlan
        safety={safety}
        user={user}
        kidMode={kidMode}
        onClose={() => setView(null)}
        onPractice={(h) => { setPractice(h); setFocus(h); setView('shelter'); }}
        onSignIn={() => { setView(null); onSignIn?.(); }}
      />
    );
  }
  return null;
}
