import { useEffect, useState } from 'react';
import { useAudience } from '../../learn/useAudience.js';
import { TOPICS, topicById } from '../../learn/topics.js';
import { HAZARDS } from '../../learn/storms.js';
import SkyScene from './SkyScene.jsx';
import WhyNow from './WhyNow.jsx';
import TopicView from './TopicView.jsx';
import StormCenter from './StormCenter.jsx';
import Raccoon from '../Raccoon.jsx';
import { stopSpeaking } from '../../kid/speak.js';
import '../../learn/learn.css';

// The Learn tab: a live sky, today's "why" lessons, the topic library and the Storm Center.
export default function Learn({ weather, location, kidMode, onOcean }) {
  const [audience, setAudience] = useAudience(kidMode);
  const [view, setView] = useState(null); // null | topic id | 'storms' | 'storms:<hazard>'
  const open = (id) => {
    setView(id);
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };
  // Stop reading aloud when switching topics or leaving the tab.
  useEffect(() => () => stopSpeaking(), [view]);
  const kid = audience === 'kid';
  const live = (weather?.alerts || []).filter((a) => HAZARDS.some((h) => h.alerts.test(a.event || ''))).length;

  const toggle = !kidMode && (
    <div className="audience-toggle" role="group" aria-label="Who is learning?">
      <button className={kid ? 'active' : 'ghost'} aria-pressed={kid} onClick={() => setAudience('kid')}>🧒 Kids</button>
      <button className={!kid ? 'active' : 'ghost'} aria-pressed={!kid} onClick={() => setAudience('adult')}>🧑 Grown-ups</button>
    </div>
  );

  if (view?.startsWith('storms')) {
    return (
      <div className="learn">
        {toggle}
        <StormCenter audience={audience} weather={weather} location={location} onBack={() => open(null)} initial={view.split(':')[1] || 'tornado'} />
      </div>
    );
  }
  const topic = view && topicById(view);
  if (topic) {
    return (
      <div className="learn">
        {toggle}
        <TopicView topic={topic} audience={audience} weather={weather} onBack={() => open(null)} />
      </div>
    );
  }

  return (
    <div className="learn">
      <div className="learn-head card">
        <div className="learn-rocky" aria-hidden><Raccoon size={96} /></div>
        <div>
          <h2>{kid ? "Rocky's Weather School" : 'Learn the science'}</h2>
          <p className="hint">{kid ? 'Look at the sky, ask why, and become a weather scientist!' : 'How today\'s weather works, plus the science of clouds, storms, climate and the ocean.'}</p>
        </div>
        {toggle}
      </div>

      {weather && <SkyScene weather={weather} kidMode={kid} />}
      {weather && <WhyNow weather={weather} audience={audience} onTopic={open} />}

      <section className="learn-topics" aria-label="Topics">
        <button className="topic-tile storm-tile" style={{ '--topic': '#6b5bd6' }} onClick={() => open('storms')}>
          <span className="tile-emoji" aria-hidden>⛈️</span>
          <span className="tile-title">Storm Center</span>
          <span className="tile-sub">{HAZARDS.map((h) => h.emoji).join(' ')} Tornadoes, wildfires & hurricanes</span>
          {live > 0 && <span className="tile-badge">Live alert</span>}
        </button>
        {onOcean && (
          <button className="topic-tile storm-tile ocean-tile" style={{ '--topic': '#1b7fc4' }} onClick={onOcean}>
            <span className="tile-emoji" aria-hidden>🌊</span>
            <span className="tile-title">{kid ? "Rocky's Ocean Lab" : 'Ocean discoveries'}</span>
            <span className="tile-sub">🔭 🐙 🤿 New discoveries, creature of the week & a dive to the deepest trench</span>
          </button>
        )}
        {TOPICS.map((t) => (
          <button key={t.id} className="topic-tile" style={{ '--topic': t.color }} onClick={() => open(t.id)}>
            <span className="tile-emoji" aria-hidden>{t.emoji}</span>
            <span className="tile-title">{kid ? t.kidTitle : t.title}</span>
            <span className="tile-sub">{kid ? t.title : `${t.sections.length} lessons + quiz`}</span>
          </button>
        ))}
      </section>
    </div>
  );
}
