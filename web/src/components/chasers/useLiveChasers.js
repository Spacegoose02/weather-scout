import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Live storm chaser streams from the server, refreshed every 5 minutes while on.
export function useLiveChasers({ kid, enabled = true }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return undefined;
    let stop = false;
    const load = () => api(`/api/chasers/live?kid=${kid ? 1 : 0}`)
      .then((d) => { if (!stop) { setData(d); setError(''); } })
      .catch((e) => { if (!stop) setError(e.message); });
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [kid, enabled]);
  return { data, error };
}
