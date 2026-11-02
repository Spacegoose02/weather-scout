import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Today's "on this day" history for a place. The server caches it, so the
// dashboard card and the Kid Zone can both ask.
export function useHistory(location, units) {
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    if (!location) return undefined;
    let live = true;
    setState({ data: null, error: '' });
    api(`/api/history/today?lat=${location.lat}&lon=${location.lon}&units=${units || 'imperial'}`)
      .then((data) => live && setState({ data, error: '' }))
      .catch((e) => live && setState({ data: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [location?.lat, location?.lon, units]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
