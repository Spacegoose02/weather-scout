import { useEffect, useState } from 'react';
import { useAudience } from '../../learn/useAudience.js';
import { OCEAN_QUIZ } from '../../ocean/ocean.js';
import { stopSpeaking } from '../../kid/speak.js';
import Raccoon from '../Raccoon.jsx';
import Quiz from '../learn/Quiz.jsx';
import Discoveries from './Discoveries.jsx';
import Creatures from './Creatures.jsx';
import DepthExplorer from './DepthExplorer.jsx';
import LiveOcean from './LiveOcean.jsx';
import '../../learn/learn.css';
import '../../ocean/ocean.css';

const SECTIONS = [
  ['news', '🔭', 'New discoveries'],
  ['creature', '🐙', 'Creature of the week'],
  ['dive', '🤿', 'Depth explorer'],
  ['live', '🛟', 'Live ocean'],
  ['quiz', '🧠', 'Ocean quiz'],
];
const SECTION_KEY = 'weather-scout:ocean-section';

// The Ocean section: the newest ocean discoveries, a creature for every week, a
// dive from the surface to the deepest trench, live buoys and tides, and a quiz.
export default function Ocean({ location, units, kidMode, ai }) {
  const [audience, setAudience] = useAudience(kidMode);
  const kid = audience === 'kid';
  const [creature, setCreature] = useState(null);
  const [section, setSection] = useState(() => {
    try {
      const s = localStorage.getItem(SECTION_KEY);
      return SECTIONS.some(([id]) => id === s) ? s : 'news';
    } catch {
      return 'news';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SECTION_KEY, section);
    } catch {
      /* ignore */
    }
    return () => stopSpeaking();
  }, [section]);

  return (
    <div className="learn ocean">
      <div className="ocean-head card">
        <div className="learn-rocky" aria-hidden><Raccoon size={96} items={['t-shirt', 'swim-trunks', 'sunglasses']} /></div>
        <div>
          <h2>{kid ? "Rocky's Ocean Lab" : 'Ocean discoveries'}</h2>
          <p className="hint">{kid
            ? 'Scientists find new creatures and places in the ocean all the time. Come explore with me!'
            : 'The latest from ocean exploration teams, life in each depth zone, and live sea conditions near you.'}
          </p>
        </div>
        {!kidMode && (
          <div className="audience-toggle" role="group" aria-label="Who is learning?">
            <button className={kid ? 'active' : 'ghost'} aria-pressed={kid} onClick={() => setAudience('kid')}>🧒 Kids</button>
            <button className={!kid ? 'active' : 'ghost'} aria-pressed={!kid} onClick={() => setAudience('adult')}>🧑 Grown-ups</button>
          </div>
        )}
      </div>

      <nav className="ocean-tabs" role="tablist" aria-label="Ocean sections">
        {SECTIONS.map(([id, emoji, label]) => (
          <button key={id} role="tab" aria-selected={section === id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
            <span aria-hidden>{emoji}</span> {label}
          </button>
        ))}
      </nav>

      {section === 'news' && <Discoveries kid={kid} kidMode={kidMode} ai={ai} location={location} units={units} />}
      {section === 'creature' && <Creatures kid={kid} initial={creature} />}
      {section === 'dive' && <DepthExplorer kid={kid} units={units} onCreature={(id) => { setCreature(id); setSection('creature'); }} />}
      {section === 'live' && location && <LiveOcean kid={kid} location={location} units={units} />}
      {section === 'quiz' && (
        <section className="card ocean-quiz">
          <h2>🧠 Ocean quiz</h2>
          <p className="hint">{kid ? 'Get them all right to earn the Ocean Scholar badge!' : 'Six quick questions. A perfect score earns the Ocean Scholar badge.'}</p>
          <Quiz questions={OCEAN_QUIZ} quizId="ocean-explorer" />
        </section>
      )}
    </div>
  );
}
