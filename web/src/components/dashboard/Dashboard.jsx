import { Component, useRef, useState } from 'react';
import CurrentConditions from '../CurrentConditions.jsx';
import HourlyTimeline from '../HourlyTimeline.jsx';
import DailyForecast from '../DailyForecast.jsx';
import Details from '../Details.jsx';
import HealthSky from '../HealthSky.jsx';
import Coast from '../Coast.jsx';
import WhyNow from '../learn/WhyNow.jsx';
import { RainNext, AirUv, Wind } from '../NowCards.jsx';
import { RadarCard, CamerasCard, AlertsCard, RockyCard, DenDutyCard } from './SmallCards.jsx';
import Journal from './Journal.jsx';
import Stargazing from './Stargazing.jsx';
import GearChecklist from './GearChecklist.jsx';
import { useDashboard } from '../../dashboard/useDashboard.js';
import { CARD, SIZE_NAMES, hidden, addCard, removeCard, moveCard, nudgeCard, resizeCard } from '../../dashboard/layout.js';
import '../../dashboard/dashboard.css';

function renderCard(id, size, ctx) {
  const { weather, location, units, kidMode, user } = ctx;
  switch (id) {
    case 'current': return <CurrentConditions weather={weather} kidMode={kidMode} />;
    case 'forecast': return <DailyForecast daily={weather.forecast.daily} units={weather.forecast.units} />;
    case 'hourly': return <HourlyTimeline hourly={weather.forecast.hourly} units={weather.forecast.units} />;
    case 'details': return <Details weather={weather} />;
    case 'rain': return <RainNext forecast={weather.forecast} />;
    case 'wind': return <Wind forecast={weather.forecast} />;
    case 'air': return <AirUv air={weather.air} forecast={weather.forecast} />;
    case 'health': return <HealthSky weather={weather} />;
    case 'tides': return location ? <Coast location={location} units={units} onMap={() => ctx.onTab('map')} /> : null;
    case 'radar': return location ? <RadarCard location={location} size={size} onOpen={() => ctx.onTab('map')} /> : null;
    case 'cameras': return location ? <CamerasCard location={location} size={size} onOpen={() => ctx.onTab('map')} /> : null;
    case 'alerts': return <AlertsCard weather={weather} kidMode={kidMode} onAlerts={ctx.onAlerts} />;
    case 'why': return <WhyNow weather={weather} audience={kidMode ? 'kid' : 'adult'} onTopic={() => ctx.onTab('learn')} limit={size === 'l' ? 6 : 4} />;
    case 'rocky': return <RockyCard weather={weather} size={size} onKids={() => ctx.onTab('kids')} />;
    case 'denduty': return <DenDutyCard weather={weather} isAdmin={!!user?.isAdmin} onAdmin={ctx.onAdmin} />;
    case 'journal': return <Journal weather={weather} user={user} size={size} onSignIn={ctx.onSignIn} />;
    case 'stars': return location ? <Stargazing weather={weather} location={location} kidMode={kidMode} size={size} /> : null;
    case 'gear': return <GearChecklist weather={weather} kidMode={kidMode} size={size} />;
    default: return null;
  }
}

// One broken card should never take the whole page down.
class CardBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <section className="card"><h2>{this.props.title}</h2><p className="hint">This card hit a snag. Reload the page to try again.</p></section>;
    return this.props.children;
  }
}

export default function Dashboard({ weather, location, units, kidMode, user, loading, onTab, onSignIn, onAlerts, onAdmin }) {
  const dash = useDashboard(user);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [adding, setAdding] = useState(false);
  const dragRef = useRef(null);
  const ctx = { weather, location, units, kidMode, user, onTab, onSignIn, onAlerts, onAdmin };
  const { layout, update } = dash;
  const canEdit = !!user;
  const isEditing = editing && canEdit;
  const offList = hidden(layout);

  // Pointer-based dragging works the same for mouse, pen and touch.
  const startDrag = (e, id) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = id;
    setDragging(id);
  };
  const onDragMove = (e) => {
    const id = dragRef.current;
    if (!id) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-card]');
    const target = over?.dataset.card;
    if (!target || target === id) return;
    update((l) => moveCard(l, id, l.cards.findIndex((c) => c.id === target)));
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(null);
  };

  const t = weather.fetchedAt ? new Date(weather.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <div className="dash">
      <div className="dash-bar">
        {canEdit ? (
          <>
            <button className={isEditing ? '' : 'ghost'} onClick={() => { setEditing(!isEditing); setAdding(false); }} aria-pressed={isEditing}>
              {isEditing ? '✓ Done' : '✏️ Customize'}
            </button>
            {isEditing && (
              <>
                <button className="ghost" onClick={() => setAdding(!adding)} aria-expanded={adding}>＋ Add cards{offList.length ? ` (${offList.length})` : ''}</button>
                {dash.custom && <button className="link" onClick={() => dash.reset().catch(() => {})}>Reset to {dash.houseDefault ? 'house' : 'standard'} layout</button>}
                {user.isAdmin && <button className="link" onClick={() => dash.shareAsDefault().catch(() => {})} title="Guests and new accounts start with this layout">Use for guests</button>}
                {user.isAdmin && dash.houseDefault && <button className="link" onClick={() => dash.clearHouseDefault().catch(() => {})}>Clear guest layout</button>}
                <span className="hint dash-save" aria-live="polite">
                  {dash.saving === 'saving' ? 'Saving…' : dash.saving === 'saved' ? 'Saved' : dash.saving === 'error' ? 'Could not save. Check your connection.' : ''}
                </span>
              </>
            )}
          </>
        ) : (
          <span className="hint">Want your own cards? <button className="link" onClick={onSignIn}>Sign in</button> to pick, move and resize them.</span>
        )}
      </div>

      {isEditing && adding && (
        <div className="card dash-add">
          <h2>Add a card</h2>
          {offList.length === 0 ? <p className="hint">Every card is already on your page.</p> : (
            <ul>
              {offList.map((c) => (
                <li key={c.id}>
                  <button className="ghost" onClick={() => update((l) => addCard(l, c.id, 0))}>
                    <span className="dash-add-emoji" aria-hidden>{c.emoji}</span>
                    <span><strong>{c.title}</strong><small>{c.blurb}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isEditing && <p className="hint dash-help">Drag a card by ⠿ (or use the arrows) to move it, pick S, M or L to resize, and ✕ to hide it. Changes save on their own.</p>}

      <div className={`dash-grid ${isEditing ? 'editing' : ''}`} onPointerMove={dragging ? onDragMove : undefined} onPointerUp={endDrag} onPointerCancel={endDrag}>
        {layout.cards.map((c, i) => {
          const def = CARD[c.id];
          return (
            <div key={c.id} data-card={c.id} className={`dash-item size-${c.size}${dragging === c.id ? ' dragging' : ''}`}>
              {isEditing && (
                <div className="dash-tools">
                  <button className="dash-handle" onPointerDown={(e) => startDrag(e, c.id)} aria-label={`Drag ${def.title}`} title="Drag to move">⠿</button>
                  <span className="dash-name"><span aria-hidden>{def.emoji}</span> {def.title}</span>
                  <button className="dash-icon" onClick={() => update((l) => nudgeCard(l, c.id, -1))} disabled={i === 0} aria-label={`Move ${def.title} earlier`}>◀</button>
                  <button className="dash-icon" onClick={() => update((l) => nudgeCard(l, c.id, 1))} disabled={i === layout.cards.length - 1} aria-label={`Move ${def.title} later`}>▶</button>
                  <span className="dash-sizes" role="group" aria-label={`${def.title} size`}>
                    {def.sizes.map((s) => (
                      <button key={s} className={c.size === s ? 'on' : ''} aria-pressed={c.size === s} title={SIZE_NAMES[s]} onClick={() => update((l) => resizeCard(l, c.id, s))}>{s.toUpperCase()}</button>
                    ))}
                  </span>
                  <button className="dash-icon dash-remove" onClick={() => update((l) => removeCard(l, c.id))} aria-label={`Hide ${def.title}`}>✕</button>
                </div>
              )}
              <div className="dash-body">
                <CardBoundary title={def.title}>{renderCard(c.id, c.size, ctx)}</CardBoundary>
              </div>
            </div>
          );
        })}
        {layout.cards.length === 0 && (
          <div className="card dash-empty">
            <p>Your page is empty. {canEdit ? 'Tap “Add cards” to pick some.' : ''}</p>
            {canEdit && !isEditing && <button onClick={() => { setEditing(true); setAdding(true); }}>Add cards</button>}
          </div>
        )}
      </div>

      <p className="source">
        Forecast: {weather.forecast.source}. Alerts: National Weather Service.
        {loading ? ' Updating…' : ` Updated ${t}.`}
      </p>
    </div>
  );
}
