// The Junior Storm Chaser section of the Kid Zone. Each part is one entry here,
// in its own component file, so live features and training can grow side by side.
//   group 'live'  : real storms happening now (Chase Day, target game, live feed, storm cards)
//   group 'train' : chaser school (radar lessons, logbook, spotter training, tornado lab)
// Every component gets { weather, user, location, kid, today } (kid = useKidData result).
import ChaseDay from '../../components/kid/chaser/ChaseDay.jsx';
import TargetGame from '../../components/kid/chaser/TargetGame.jsx';
import LiveChase from '../../components/kid/chaser/LiveChase.jsx';
import StormCards from '../../components/kid/chaser/StormCards.jsx';

export const CHASER_GROUPS = [
  ['live', '📡 Live storm chasing'],
  ['train', '🎓 Chaser training'],
];

export const CHASER_SECTIONS = [
  { id: 'chase-day', group: 'live', emoji: '🗺️', label: 'Chase Day', Component: ChaseDay },
  { id: 'target', group: 'live', emoji: '🎯', label: 'Pick your target', Component: TargetGame },
  { id: 'live-feed', group: 'live', emoji: '🎥', label: 'Live chase', Component: LiveChase },
  { id: 'storm-cards', group: 'live', emoji: '🃏', label: 'Storm cards', Component: StormCards },
];
