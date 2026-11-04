// The app's two menus and the address-bar route (#tab or #tab/section).
// Grown-ups and kids see different tab rows; Kid mode swaps one for the other.

export const ADULT_TABS = [
  { id: 'today', label: 'Today', short: 'Today', emoji: '🌤️' },
  { id: 'map', label: 'Radar & Cams', short: 'Radar', emoji: '🗺️' },
  { id: 'learn', label: 'Learn & Explore', short: 'Learn', emoji: '🎓' },
  { id: 'models', label: 'Models', short: 'Models', emoji: '📊' },
  { id: 'news', label: 'News & Videos', short: 'News', emoji: '📰' },
  { id: 'ask', label: 'Ask an Expert', short: 'Ask', emoji: '💬', ai: true },
];

export const KID_TABS = [
  { id: 'today', label: 'Today', short: 'Today', emoji: 'rocky' },
  { id: 'play', label: 'Play', short: 'Play', emoji: '🎲' },
  { id: 'explore', label: 'Explore', short: 'Explore', emoji: '🔭' },
  { id: 'chaser', label: 'Storm Chaser', short: 'Chase', emoji: '🌪️' },
  { id: 'school', label: 'Weather School', short: 'School', emoji: '🎓' },
  { id: 'ask', label: 'Ask Rocky', short: 'Ask', emoji: '💬', ai: true },
];

// Sections inside Learn & Explore (and the kids' Weather School).
export const LEARN_SECTIONS = [
  { id: 'lessons', label: 'Lessons', kidLabel: 'Lessons', emoji: '📚' },
  { id: 'storms', label: 'Storm Center', kidLabel: 'Storm Center', emoji: '⛈️' },
  { id: 'ocean', label: 'Ocean', kidLabel: "Rocky's Ocean Lab", emoji: '🌊' },
];

export const tabsFor = (kidMode, aiOn) => (kidMode ? KID_TABS : ADULT_TABS).filter((t) => !t.ai || aiOn);

// Old tab names (from bookmarks, notifications and the old menu) and the
// tabs that only exist in the other view, mapped to where they live now.
const MOVED = {
  adult: { ocean: ['learn', 'ocean'], storms: ['learn', 'storms'], school: ['learn', null], kids: ['today', null], play: ['today', null], explore: ['today', null], chaser: ['today', null], badges: ['today', null] },
  kid: { learn: ['school', null], ocean: ['school', 'ocean'], storms: ['school', 'storms'], kids: ['today', null], badges: ['today', null], map: ['chaser', null], models: ['today', null], news: ['today', null] },
};

// Turn "#learn/ocean" into { tab: 'learn', section: 'ocean' }, fitted to the
// view that is showing. Anything unknown lands on Today.
export function parseRoute(hash, { kidMode = false, aiOn = false } = {}) {
  const [rawTab = '', rawSection = ''] = String(hash || '').replace(/^#\/?/, '').split('/');
  let tab = rawTab.toLowerCase();
  let section = rawSection.toLowerCase() || null;
  const moved = MOVED[kidMode ? 'kid' : 'adult'][tab];
  if (moved) {
    tab = moved[0];
    section = moved[1] ?? section;
  }
  const tabs = tabsFor(kidMode, aiOn);
  if (!tabs.some((t) => t.id === tab)) return { tab: 'today', section: null };
  if (tab === 'learn' || tab === 'school') {
    if (!LEARN_SECTIONS.some((s) => s.id === section)) section = 'lessons';
  } else section = null;
  return { tab, section };
}

export const routeHash = ({ tab, section }) => `#${tab}${section && section !== 'lessons' ? `/${section}` : ''}`;
