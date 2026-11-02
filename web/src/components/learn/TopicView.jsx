import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { CLOUD_TYPES, likelyCloud } from '../../learn/topics.js';
import SpeakButton from '../kid/SpeakButton.jsx';
import Quiz from './Quiz.jsx';
import { BADGE_EVENT, localDay, localProgress, trackProgress } from '../../kid/badges.js';

// Cloud types this kid has ticked off, kept fresh when a badge save lands.
function useSpotted() {
  const [spotted, setSpotted] = useState(() => localProgress().clouds || {});
  useEffect(() => {
    const on = (e) => setSpotted({ ...localProgress().clouds, ...(e.detail.data?.progress?.clouds || {}) });
    window.addEventListener(BADGE_EVENT, on);
    return () => window.removeEventListener(BADGE_EVENT, on);
  }, []);
  return spotted;
}

function TopicNews({ pattern }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    api('/api/news')
      .then((d) => setItems((d.news || []).filter((n) => pattern.test(`${n.title} ${n.summary}`)).slice(0, 5)))
      .catch(() => setItems([]));
  }, [pattern]);
  if (!items) return <p className="hint">Checking the news…</p>;
  if (!items.length) return <p className="hint">No El Niño or La Niña stories in your news feeds right now. The NOAA links below always have the latest outlook.</p>;
  return (
    <ul className="topic-news">
      {items.map((n) => (
        <li key={n.link || n.title}>
          <a href={n.link} target="_blank" rel="noreferrer">{n.title}</a>
          {n.source && <span className="hint"> · {n.source}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function TopicView({ topic, audience, weather, onBack }) {
  const kid = audience === 'kid';
  const pick = (x) => (kid ? x.kid : x.adult);
  const c = weather?.forecast?.current;
  const today = c ? likelyCloud(c.code ?? 0, c.cloudCover ?? 0) : null;
  const [cloud, setCloud] = useState(today || CLOUD_TYPES[0].id);
  const shownCloud = CLOUD_TYPES.find((t) => t.id === cloud);
  const spotted = useSpotted();
  const spottedCount = CLOUD_TYPES.filter((t) => spotted[t.id]).length;
  const spot = (id) => trackProgress({ clouds: { [id]: localDay() } });

  return (
    <article className="card topic-view" style={{ '--topic': topic.color }}>
      <button className="link back" onClick={onBack}>← All topics</button>
      <h2><span aria-hidden>{topic.emoji}</span> {kid ? topic.kidTitle : topic.title}</h2>
      <p className="topic-intro">{pick(topic)}</p>
      <SpeakButton text={pick(topic)} />

      {topic.id === 'clouds' && (
        <div className="cloud-spotter">
          <h3>Cloud spotter</h3>
          {today && <p className="hint">Based on the weather right now, look up for <strong>{CLOUD_TYPES.find((t) => t.id === today).name}</strong> clouds.</p>}
          <div className="cloud-chips" role="tablist" aria-label="Cloud types">
            {CLOUD_TYPES.map((t) => (
              <button key={t.id} role="tab" aria-selected={cloud === t.id} className={`chip ${cloud === t.id ? 'active' : ''} ${today === t.id ? 'today' : ''}`} onClick={() => setCloud(t.id)}>
                <span aria-hidden>{t.emoji}</span> {t.name}{spotted[t.id] && <span className="spotted-tick" aria-label=" (spotted)"> ✓</span>}
              </button>
            ))}
          </div>
          {shownCloud && (
            <div className="cloud-card">
              <p><strong>{shownCloud.name}</strong> · {shownCloud.level} clouds</p>
              <p>{pick(shownCloud)}</p>
              <p className="hint">What it means: {shownCloud.means}</p>
              <SpeakButton text={`${shownCloud.name}. ${pick(shownCloud)} ${shownCloud.means}`} />
              <div className="dash-row cloud-spot-row">
                {spotted[shownCloud.id]
                  ? <span className="hint">👀 You spotted {shownCloud.name} clouds!</span>
                  : <button onClick={() => spot(shownCloud.id)}>I spotted it outside! 👀</button>}
              </div>
            </div>
          )}
          <p className="hint">🏅 Cloud spotting badges: {spottedCount} of {CLOUD_TYPES.length} cloud types spotted.</p>
        </div>
      )}

      {topic.creatures && (
        <div className="creatures">
          <h3>Meet the ocean creatures</h3>
          <ul>
            {topic.creatures.map((cr) => (
              <li key={cr.name}>
                <span className="emoji" aria-hidden>{cr.emoji}</span>
                <div><strong>{cr.name}</strong><p>{pick(cr)}</p></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {topic.sections.map((s) => (
        <section key={s.title} className="topic-section">
          <h3>{s.title}</h3>
          <p>{pick(s)}</p>
          <SpeakButton text={`${s.title}. ${pick(s)}`} label="Read" />
        </section>
      ))}

      {topic.news && (
        <section className="topic-section">
          <h3>In the news</h3>
          <TopicNews pattern={topic.news} />
        </section>
      )}

      <section className="topic-section">
        <h3>Did you know?</h3>
        <ul className="facts">{topic.facts.map((f) => <li key={f}>💡 {f}</li>)}</ul>
      </section>

      <Quiz key={topic.id} questions={topic.quiz} quizId={topic.id} />

      {topic.links?.length > 0 && (
        <p className="topic-links">
          Learn more: {topic.links.map((l, i) => (
            <span key={l.url}>{i > 0 && ' · '}<a href={l.url} target="_blank" rel="noreferrer">{l.label}</a></span>
          ))}
        </p>
      )}
    </article>
  );
}
