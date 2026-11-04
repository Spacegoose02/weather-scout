import Modal from './Modal.jsx';
import { ThemeChoices } from './ThemeChoices.jsx';
import { openSafety } from '../safety/useSafetyPlan.js';
import EasierToSee from './EasierToSee.jsx';

// The ⚙️ window: every setting a person can change, in one place. Alerts, the
// safety plan and Family & settings open their own windows from here.
export default function Settings({ user, sso, units, onUnits, theme, a11y, onProfile, onAlerts, onAdmin, onSignIn, onSignOut, onClose }) {
  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="prefs">
        <section className="prefs-group" aria-labelledby="set-me">
          <h3 id="set-me">👤 Me</h3>
          {user ? (
            <div className="prefs-row">
              <span>Signed in as <strong>{user.displayName}</strong>{user.displayName !== user.username && <> ({user.username})</>}</span>
              <span className="row-actions">
                <button className="ghost" onClick={onProfile}>✏️ Change my name</button>
                <button className="ghost" onClick={() => { onClose(); onSignOut(); }}>Sign out</button>
              </span>
            </div>
          ) : (
            <div className="prefs-row">
              <span>Not signed in. Sign in to keep your cards, theme and kid badges on every device.</span>
              {!sso && <button onClick={onSignIn}>Sign in</button>}
            </div>
          )}
          <div className="prefs-row">
            <span>Units</span>
            <span className="seg" role="group" aria-label="Units">
              <button className={units === 'imperial' ? 'active' : 'ghost'} aria-pressed={units === 'imperial'} onClick={() => onUnits('imperial')}>°F, mph</button>
              <button className={units === 'metric' ? 'active' : 'ghost'} aria-pressed={units === 'metric'} onClick={() => onUnits('metric')}>°C, km/h</button>
            </span>
          </div>
        </section>

        <section className="prefs-group" aria-labelledby="set-alerts">
          <h3 id="set-alerts">🔔 Alerts & safety</h3>
          <div className="prefs-row">
            <span>Push alerts on this device: warnings, watches, lightning and Rocky's morning briefing</span>
            <button className="ghost" onClick={onAlerts}>Alert settings</button>
          </div>
          <div className="prefs-row">
            <span>Family safety plan: your shelter spot, kit and where to go in a warning</span>
            <button className="ghost" onClick={() => { onClose(); openSafety('plan'); }}>🛡️ Open plan</button>
          </div>
        </section>

        {user?.isAdmin && (
          <section className="prefs-group" aria-labelledby="set-family">
            <h3 id="set-family">👪 Family & settings</h3>
            <div className="prefs-row">
              <span>People, AI and voice, app keys, connected apps, news, stations and camera feeds</span>
              <button className="ghost" onClick={onAdmin}>Open Family & settings</button>
            </div>
          </section>
        )}

        {theme && (
          <section className="prefs-group" aria-labelledby="set-theme">
            <h3 id="set-theme">🎨 Colors</h3>
            <ThemeChoices value={theme.value} why={theme.why} onChange={theme.onChange} signedIn={!!user} />
          </section>
        )}

        {a11y && (
          <section className="prefs-group" aria-labelledby="set-a11y">
            <h3 id="set-a11y">👁️ Easier to see</h3>
            <EasierToSee value={a11y.value} onChange={a11y.onChange} />
          </section>
        )}
      </div>
    </Modal>
  );
}
