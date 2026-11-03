import { useEffect, useState } from 'react';

// Kids or grown-ups, remembered per browser and shared by Learn and Ocean.
// Kid Mode always means kids.
const AUDIENCE_KEY = 'weather-scout:learn-audience';

export function useAudience(kidMode) {
  const [audience, setAudience] = useState(() => {
    if (kidMode) return 'kid';
    try {
      return localStorage.getItem(AUDIENCE_KEY) || 'kid';
    } catch {
      return 'kid';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(AUDIENCE_KEY, audience);
    } catch {
      /* ignore */
    }
  }, [audience]);
  return [kidMode ? 'kid' : audience, setAudience];
}
