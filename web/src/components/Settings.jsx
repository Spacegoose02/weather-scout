import Modal from './Modal.jsx';
import { ThemeChoices } from './ThemeChoices.jsx';
import { openSafety } from '../safety/useSafetyPlan.js';
import EasierToSee from './EasierToSee.jsx';
import DataFeeds from './DataFeeds.jsx';
import { t, LANGS } from '../i18n.js';
import { inAndroidApp, CHANGE_SERVER_URL } from '../androidApp.js';

// The ⚙️ window: every setting a person can change, in one place. Alerts, the
// safety plan and Family & settings open their own windows from here.
export default function Settings({ user, sso, units, onUnits, language = 'en', onLanguage, theme, a11y, places, onProfile, onAlerts, onAdmin, onSignIn, onSignOut, onClose }) {
  return (
    <Modal title={t('Settings')} onClose={onClose} wide>
      <div className="prefs">
        <section className="prefs-group" aria-labelledby="set-me">
          <h3 id="set-me">{t('👤 Me')}</h3>
          {user ? (
            <div className="prefs-row">
              <span>{t('Signed in as')} <strong>{user.displayName}</strong>{user.displayName !== user.username && <> ({user.username})</>}</span>
              <span className="row-actions">
                <button className="ghost" onClick={onProfile}>{t('✏️ Change my name')}</button>
                <button className="ghost" onClick={() => { onClose(); onSignOut(); }}>{t('Sign out')}</button>
              </span>
            </div>
          ) : (
            <div className="prefs-row">
              <span>{t('Not signed in. Sign in to keep your cards, theme and kid badges on every device.')}</span>
              {!sso && <button onClick={onSignIn}>{t('Sign in')}</button>}
            </div>
          )}
          <div className="prefs-row">
            <span>{t('Units')}</span>
            <span className="seg" role="group" aria-label={t('Units')}>
              <button className={units === 'imperial' ? 'active' : 'ghost'} aria-pressed={units === 'imperial'} onClick={() => onUnits('imperial')}>°F, mph</button>
              <button className={units === 'metric' ? 'active' : 'ghost'} aria-pressed={units === 'metric'} onClick={() => onUnits('metric')}>°C, km/h</button>
            </span>
          </div>
          {onLanguage && (
            <div className="prefs-row">
              <span>{t('🌐 Language')}<small className="hint" style={{ display: 'block' }}>{t('The menus, main cards and dates. Some cards and the forecasts written by the National Weather Service stay in English.')}</small></span>
              <span className="seg" role="group" aria-label={t('Language')}>
                {LANGS.map((l) => <button key={l.id} lang={l.id} className={language === l.id ? 'active' : 'ghost'} aria-pressed={language === l.id} onClick={() => onLanguage(l.id)}>{l.label}</button>)}
              </span>
            </div>
          )}
          {inAndroidApp() && (
            <div className="prefs-row">
              <span>{t('📱 This app opens {server}', { server: window.location.host })}<small className="hint" style={{ display: 'block' }}>{t('Switch the Android app to a different Weather Scout server. You can also long-press the app icon and pick Change server.')}</small></span>
              <a className="button ghost" href={CHANGE_SERVER_URL}>{t('Change server')}</a>
            </div>
          )}
        </section>

        {places && (
          <section className="prefs-group" aria-labelledby="set-places">
            <h3 id="set-places">{t('📍 Saved places')}</h3>
            {places.list.length === 0 ? (
              <div className="prefs-row"><span className="hint">{t('No saved places yet. Places you search for are saved here.')}</span></div>
            ) : (
              <>
                {places.list.map((p, i) => (
                  <div className="prefs-row" key={`${p.lat},${p.lon}`}>
                    <span>{p.name}</span>
                    <button className="ghost" onClick={() => places.onChange(places.list.filter((_, j) => j !== i))} aria-label={`Remove ${p.name}`}>{t('✕ Remove')}</button>
                  </div>
                ))}
                <div className="prefs-row">
                  <span className="hint">{user ? t('Saved to your account.') : t('Saved on this device.')}</span>
                  <button className="ghost" onClick={() => { if (window.confirm(t('Remove all saved places?'))) places.onChange([]); }}>{t('🗑️ Clear all')}</button>
                </div>
              </>
            )}
          </section>
        )}

        <section className="prefs-group" aria-labelledby="set-alerts">
          <h3 id="set-alerts">{t('🔔 Alerts & safety')}</h3>
          <div className="prefs-row">
            <span>{t("Push alerts on this device: warnings, watches, lightning and Rocky's morning briefing")}</span>
            <button className="ghost" onClick={onAlerts}>{t('Alert settings')}</button>
          </div>
          <div className="prefs-row">
            <span>{t('Family safety plan: your shelter spot, kit and where to go in a warning')}</span>
            <button className="ghost" onClick={() => { onClose(); openSafety('plan'); }}>{t('🛡️ Open plan')}</button>
          </div>
        </section>

        {user?.isAdmin && (
          <section className="prefs-group" aria-labelledby="set-family">
            <h3 id="set-family">{t('👪 Family & settings')}</h3>
            <div className="prefs-row">
              <span>{t('People, AI and voice, app keys, connected apps, news, stations and camera feeds')}</span>
              <button className="ghost" onClick={onAdmin}>{t('Open Family & settings')}</button>
            </div>
          </section>
        )}

        {theme && (
          <section className="prefs-group" aria-labelledby="set-theme">
            <h3 id="set-theme">{t('🎨 Colors')}</h3>
            <ThemeChoices value={theme.value} why={theme.why} onChange={theme.onChange} signedIn={!!user} />
          </section>
        )}

        {a11y && (
          <section className="prefs-group" aria-labelledby="set-a11y">
            <h3 id="set-a11y">{t('👁️ Easier to see')}</h3>
            <EasierToSee value={a11y.value} onChange={a11y.onChange} />
          </section>
        )}

        <section className="prefs-group" aria-labelledby="set-class">
          <h3 id="set-class">{t('🏫 Classroom board')}</h3>
          <p className="hint">{t("A big-screen view for a class projector or smartboard: clock, today's weather, the recess call, what to wear, a question of the day and the class weather log.")}</p>
          <a className="button" href="#classroom" onClick={onClose}>{t('Open the classroom board')}</a>
        </section>

        <section className="prefs-group" aria-labelledby="set-feeds">
          <h3 id="set-feeds">{t('📶 Data feeds')}</h3>
          <DataFeeds />
        </section>
      </div>
    </Modal>
  );
}
