import { useCallback, useEffect, useMemo } from 'react';
import { chaseBadges, chaseOf } from './live.js';

// The kid's chase data (targets, cards, briefing days) plus a saver, and any
// chase badges that progress has unlocked get awarded.
export function useChase(kid) {
  const chase = useMemo(() => chaseOf(kid.data), [kid.data]);
  const save = useCallback((fn) => kid.update((prev) => ({ chase: fn(chaseOf(prev)) })), [kid]);
  const have = kid.data.badges || {};
  const due = chaseBadges(chase).filter((id) => !have[id]);
  const dueKey = due.join(',');
  useEffect(() => {
    if (due.length) kid.earn(...due);
  }, [dueKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return [chase, save];
}
