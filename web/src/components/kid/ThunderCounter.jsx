import { useEffect, useRef, useState } from 'react';
import SpeakButton from './SpeakButton.jsx';
import { THUNDER_TIP, thunderCount } from '../../../../shared/lightning.js';
import '../../lightning/lightning.css';

// "Count to 30": tap when you see the flash, tap again at the boom, and Rocky
// says how far away the storm is and whether it is time to go inside.
export default function ThunderCounter({ compact = false }) {
  const [start, setStart] = useState(null);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState(null);
  const tick = useRef();

  useEffect(() => {
    if (start == null) return undefined;
    tick.current = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tick.current);
  }, [start]);

  const seconds = start == null ? 0 : Math.max(0, Math.floor((now - start) / 1000));
  const flash = () => { setResult(null); setStart(Date.now()); setNow(Date.now()); };
  const boom = () => { setResult(thunderCount(Math.max(1, Math.round((Date.now() - start) / 1000)))); setStart(null); };
  const Heading = compact ? 'h3' : 'h2';
  const words = [THUNDER_TIP.title, THUNDER_TIP.short, ...THUNDER_TIP.steps, THUNDER_TIP.why, THUNDER_TIP.rhyme].join(' ');

  return (
    <section className={`${compact ? '' : 'card '}thunder-counter`} aria-label="Count to 30 thunder tip">
      <Heading>⚡ {THUNDER_TIP.title}</Heading>
      <p>{THUNDER_TIP.short}</p>
      {!compact && <ol>{THUNDER_TIP.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
      <div className="tc-big">
        {start == null
          ? <button className="tc-btn flash" onClick={flash}>⚡ I saw lightning!</button>
          : <button className="tc-btn boom" onClick={boom}>💥 I heard thunder!</button>}
        <span className="tc-count" aria-live="off">{start == null ? (result ? result.seconds : 0) : seconds}</span>
        <span>{start == null ? 'seconds' : seconds < 30 ? 'counting…' : 'keep counting…'}</span>
      </div>
      {result && (
        <p className={`tc-result ${result.inside ? 'inside' : ''}`} role="status">
          {result.inside ? '🏠 ' : '👀 '}{result.say}
        </p>
      )}
      {!compact && <p className="tc-why">{THUNDER_TIP.why} {THUNDER_TIP.rhyme}</p>}
      <SpeakButton text={result ? result.say : words} />
    </section>
  );
}
