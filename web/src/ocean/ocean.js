// Ocean section content: the depth zones, landmarks on the way down, a creature
// for every week, and the ocean quiz. Plain data with a kid and a grown-up version,
// like the Learn library, so it is easy to edit.

export const MAX_DEPTH = 10935; // Challenger Deep, meters

export const ZONES = [
  {
    id: 'sunlight', name: 'Sunlight Zone', science: 'Epipelagic', top: 0, bottom: 200, color: '#2f9be0', emoji: '☀️',
    light: 'Bright sunlight, fading to 1% by the bottom', temp: 'Warm to cool, set by the weather above',
    kid: 'This is where sunlight shines in. Tiny ocean plants called phytoplankton use it to grow, and they make about half the oxygen you breathe!',
    adult: 'Enough light for photosynthesis reaches the top ~200 m, so nearly all primary production happens here. It holds a small slice of the ocean\'s volume but most of its familiar life, and it trades heat and gases with the atmosphere.',
  },
  {
    id: 'twilight', name: 'Twilight Zone', science: 'Mesopelagic', top: 200, bottom: 1000, color: '#1b5f9e', emoji: '🌆',
    light: 'Dim blue glow, too dark for plants', temp: 'Gets colder fast (the thermocline)',
    kid: 'It is like dusk all the time down here. Lots of animals make their own light, and every night billions of them swim up to eat, then hide again at sunrise.',
    adult: 'Light is too weak for photosynthesis. Temperature drops steeply through the thermocline. Fish biomass here may outweigh all other fisheries combined, and the nightly diel vertical migration is the largest animal movement on Earth.',
  },
  {
    id: 'midnight', name: 'Midnight Zone', science: 'Bathypelagic', top: 1000, bottom: 4000, color: '#0d2a52', emoji: '🌑',
    light: 'Pitch black. The only light comes from animals', temp: 'About 39 °F (4 °C)',
    kid: 'No sunlight ever reaches this deep. It is black, cold and the water pushes hard on everything. Animals here glow, have huge mouths, or wait very patiently for food.',
    adult: 'No sunlight penetrates below ~1,000 m. Water sits near 4 °C and pressure exceeds 100 atmospheres. Food arrives mostly as "marine snow" falling from above, so many residents are slow, low-energy ambush predators.',
  },
  {
    id: 'abyss', name: 'Abyss', science: 'Abyssopelagic', top: 4000, bottom: 6000, color: '#071a35', emoji: '🕳️',
    light: 'Total darkness', temp: 'Near freezing, 32 to 37 °F (0 to 3 °C)',
    kid: 'The abyss is the deep, muddy, freezing floor that covers most of the ocean. It is bigger than all the land on Earth put together, and scientists have seen only a tiny bit of it.',
    adult: 'Abyssal plains cover more than half of Earth\'s surface. Sediment rains down at millimeters per thousand years, and fields of polymetallic nodules here are the target of proposed deep-sea mining.',
  },
  {
    id: 'trench', name: 'The Trenches', science: 'Hadal zone', top: 6000, bottom: MAX_DEPTH, color: '#030b19', emoji: '🔱',
    light: 'Total darkness', temp: 'About 34 to 36 °F (1 to 2.5 °C)',
    kid: 'Trenches are giant cracks in the seafloor where one piece of Earth slides under another. The water pushes down like 50 jumbo jets piled on one person, and fish still live here!',
    adult: 'Hadal trenches form at subduction zones. At Challenger Deep, pressure is about 1,100 atmospheres (16,000 psi). Only a few dozen crewed dives have ever reached the bottom.',
  },
];

// Things to pass on the way down. Depth in meters.
export const LANDMARKS = [
  { depth: 40, emoji: '🤿', kid: 'Scuba divers on vacation stop around here', adult: 'Recreational scuba limit, about 40 m' },
  { depth: 200, emoji: '🌿', kid: 'Too dark for ocean plants below here', adult: 'Edge of the photic zone, ~1% of surface light' },
  { depth: 332, emoji: '🏅', kid: 'The deepest anyone has ever gone with scuba gear', adult: 'Scuba depth record, 332 m (Ahmed Gabr, 2014)' },
  { depth: 500, emoji: '🐧', kid: 'Emperor penguins can dive this deep!', adult: 'Emperor penguin dives reach about 500 m' },
  { depth: 1000, emoji: '🌑', kid: 'The last bit of sunlight is gone', adult: 'No sunlight below ~1,000 m' },
  { depth: 2000, emoji: '🐋', kid: 'Sperm whales dive here to hunt giant squid', adult: 'Sperm whale foraging dives, ~2,000 m' },
  { depth: 2992, emoji: '🏆', kid: 'Record dive for a mammal: a Cuvier\'s beaked whale!', adult: 'Deepest recorded mammal dive, Cuvier\'s beaked whale, 2,992 m' },
  { depth: 3688, emoji: '📏', kid: 'The ocean is about this deep on average', adult: 'Mean ocean depth, about 3,688 m' },
  { depth: 3800, emoji: '🚢', kid: 'The Titanic shipwreck rests here', adult: 'RMS Titanic wreck, ~3,800 m' },
  { depth: 8336, emoji: '🐟', kid: 'The deepest fish ever filmed, a little snailfish', adult: 'Deepest fish observed, a snailfish at 8,336 m (2022, Izu-Ogasawara Trench)' },
  { depth: 8849, emoji: '🏔️', kid: 'Mount Everest would fit in the trench with room to spare!', adult: 'Height of Mount Everest, 8,849 m' },
  { depth: MAX_DEPTH, emoji: '🔱', kid: 'Challenger Deep, the very bottom of the ocean!', adult: 'Challenger Deep, Mariana Trench, ~10,935 m' },
];

export const CREATURES = [
  { id: 'vampire-squid', emoji: '🦑', name: 'Vampire squid', zone: 'midnight', depth: '600–1,200 m', size: 'About 1 ft (30 cm)', power: 'Turns itself inside out', kid: 'It is not a vampire and not even a squid! When it is scared it flips its cape over its head and looks like a spiky pineapple. It eats "marine snow", the bits of stuff that drift down from above.', adult: 'Vampyroteuthis infernalis is the only living member of its order, between squids and octopuses. It thrives in oxygen-minimum zones and feeds on marine snow with sticky filaments instead of hunting.' },
  { id: 'barreleye', emoji: '🐟', name: 'Barreleye fish', zone: 'twilight', depth: '600–800 m', size: 'About 6 in (15 cm)', power: 'A see-through head', kid: 'Its head is clear like a fishbowl! Its glowing green eyes are inside and can roll up to look through the top of its head.', adult: 'Macropinna microstoma has a transparent, fluid-filled shield over its head. MBARI showed in 2009 that its tubular eyes rotate from looking up to looking forward to track prey.' },
  { id: 'dumbo-octopus', emoji: '🐙', name: 'Dumbo octopus', zone: 'abyss', depth: '1,000–7,000 m', size: '8–12 in (20–30 cm)', power: 'Flaps its ear fins to fly', kid: 'Named after Dumbo the elephant because its fins look like big ears. It flaps them to glide over the seafloor. It is the deepest-living octopus we know!', adult: 'Grimpoteuthis species are cirrate octopods found down to ~7,000 m. They swallow prey whole and hover just above the seafloor using fin flaps and arm-web pulses.' },
  { id: 'anglerfish', emoji: '🎣', name: 'Anglerfish', zone: 'midnight', depth: '1,000–2,000 m', size: 'Up to 8 in (20 cm), most smaller', power: 'A glowing fishing rod', kid: 'It has a glowing light on a stick on its head. Small fish swim to the light, and gulp! It has a stretchy stomach so it can eat things bigger than itself.', adult: 'Deep-sea anglers (Ceratioidei) lure prey with an illicium tipped by an esca full of bioluminescent bacteria. In some species tiny males fuse permanently to females, sharing their blood supply.' },
  { id: 'giant-squid', emoji: '🦑', name: 'Giant squid', zone: 'midnight', depth: '300–1,000 m', size: 'Up to about 40 ft (12 m)', power: 'Eyes as big as dinner plates', kid: 'One of the biggest animals without a backbone, as long as a school bus! Its eyes are some of the biggest in the animal world. Nobody filmed one alive in the deep sea until 2012.', adult: 'Architeuthis dux was known mainly from carcasses until 2004 photos and 2012 footage off Japan. In 2019 a NOAA-funded team filmed one in U.S. waters using a quiet camera with a glowing lure that mimics a jellyfish.' },
  { id: 'sea-pig', emoji: '🐷', name: 'Sea pig', zone: 'abyss', depth: '1,000–6,000 m', size: '4–6 in (10–15 cm)', power: 'Walks on squishy legs', kid: 'A sea pig is a kind of sea cucumber that walks across the mud on puffy legs. It eats the mud and gets the tiny bits of food out of it. Herds of them roam the deep seafloor!', adult: 'Scotoplanes are holothurians that walk on enlarged tube feet inflated by their water-vascular system, feeding on organic-rich surface sediment. They can make up most of the animal biomass on some abyssal plains.' },
  { id: 'snailfish', emoji: '🐟', name: 'Hadal snailfish', zone: 'trench', depth: '6,000–8,300 m', size: 'About 1 ft (30 cm)', power: 'Lives deeper than any other fish', kid: 'This little pink fish lives in the deepest trenches. It is soft and wiggly, almost like jelly, which helps it handle the crushing water. In 2022 one was filmed over 5 miles down!', adult: 'Snailfish (Liparidae) such as Pseudoliparis swirei dominate hadal fish communities. Gelatinous tissue, flexible skeletons and the osmolyte TMAO help stabilize proteins at extreme pressure; ~8,200 m may be a physiological limit for fish.' },
  { id: 'giant-isopod', emoji: '🦐', name: 'Giant isopod', zone: 'midnight', depth: '170–2,100 m', size: 'Up to 20 in (50 cm)', power: 'Can go years without eating', kid: 'It looks like a giant roly-poly bug, as long as your arm from elbow to fingertips! Food is rare in the deep, so it can wait a really, really long time between meals.', adult: 'Bathynomus giganteus is a scavenger showing deep-sea gigantism. A captive individual in Japan went over five years without eating, likely an extreme version of the slow metabolism that suits sparse food falls.' },
  { id: 'blue-whale', emoji: '🐋', name: 'Blue whale', zone: 'sunlight', depth: '0–500 m', size: 'Up to 100 ft (30 m)', power: 'Biggest animal ever', kid: 'Bigger than any dinosaur! Its heart is about the size of a small car, and it eats around 4 tons of tiny shrimp called krill in a day.', adult: 'Balaenoptera musculus, the largest animal known to have lived, filter-feeds on krill with lunges that engulf more water than its own body volume. Its low-frequency calls can travel hundreds of kilometers.' },
  { id: 'leatherback', emoji: '🐢', name: 'Leatherback sea turtle', zone: 'sunlight', depth: '0–1,200 m', size: 'Up to 7 ft (2 m)', power: 'Dives deeper than any turtle', kid: 'The biggest turtle in the world has a soft, leathery shell instead of a hard one. It eats jellyfish and swims across whole oceans.', adult: 'Dermochelys coriacea ranges from the tropics to subpolar seas thanks to countercurrent heat exchange and its size. Dives exceed 1,000 m. Plastic bags mistaken for jellies are a serious threat.' },
  { id: 'manta', emoji: '🪽', name: 'Giant manta ray', zone: 'sunlight', depth: '0–1,000 m', size: 'Wings up to 23 ft (7 m) across', power: 'A really big brain', kid: 'Mantas glide like underwater birds and can be as wide as a garage door. They have one of the biggest brains of any fish and might even recognize themselves in a mirror.', adult: 'Mobula birostris has the largest brain-to-body ratio of any fish, and captive mantas have shown mirror-directed behavior. They filter plankton and visit "cleaning stations" on reefs.' },
  { id: 'clownfish', emoji: '🐠', name: 'Clownfish', zone: 'sunlight', depth: '1–15 m', size: 'About 4 in (10 cm)', power: 'Lives in a stinging house', kid: 'Clownfish live in sea anemones that sting other fish. A special slime keeps them safe. All clownfish start out as boys, and the biggest one in the group becomes the girl!', adult: 'Amphiprion are protandrous hermaphrodites: the dominant fish becomes female. Their mucus coat prevents anemone nematocysts from firing, and the partnership benefits both.' },
  { id: 'moon-jelly', emoji: '🪼', name: 'Moon jellyfish', zone: 'sunlight', depth: '0–200 m', size: '10–16 in (25–40 cm)', power: 'No brain, no heart, no bones', kid: 'A moon jelly is about 95% water. It has no brain, no heart and no bones, and it has been drifting in the ocean since before the dinosaurs.', adult: 'Aurelia aurita has a decentralized nerve net and rhopalia that sense light and balance. Jellyfish blooms can boom when overfishing removes competitors and predators.' },
  { id: 'immortal-jelly', emoji: '♾️', name: 'Immortal jellyfish', zone: 'sunlight', depth: '0–100 m', size: 'Smaller than a pinky nail', power: 'Can start its life over', kid: 'When this tiny jelly gets hurt or old, it can turn itself back into a baby and grow up all over again!', adult: 'Turritopsis dohrnii can revert from a medusa to a polyp through transdifferentiation, effectively restarting its life cycle. It is a model organism for research on aging.' },
  { id: 'octopus', emoji: '🐙', name: 'Giant Pacific octopus', zone: 'sunlight', depth: '0–1,500 m', size: 'Arms up to 16 ft (5 m) across', power: 'Three hearts and blue blood', kid: 'It has three hearts, blue blood and a brain in each arm, sort of! It can change color in a blink and squeeze through a hole the size of a coin.', adult: 'Enteroctopus dofleini has a systemic heart plus two branchial hearts, copper-based hemocyanin, and about two-thirds of its neurons in its arms. Chromatophores give near-instant camouflage.' },
  { id: 'sperm-whale', emoji: '🐳', name: 'Sperm whale', zone: 'midnight', depth: '0–2,000 m', size: 'Up to 60 ft (18 m)', power: 'Loudest animal on Earth', kid: 'It holds its breath for over an hour to dive into the dark and hunt squid. It has the biggest brain of any animal, and its clicks are the loudest sounds any animal makes.', adult: 'Physeter macrocephalus echolocates with clicks up to ~230 dB. Dives commonly reach 1,000–2,000 m. Clans have distinct click dialects, and researchers are decoding their "codas".' },
  { id: 'lanternfish', emoji: '💡', name: 'Lanternfish', zone: 'twilight', depth: '200–1,000 m', size: '1–6 in (2–15 cm)', power: 'Rides the biggest migration on Earth', kid: 'Lanternfish have glowing dots on their bodies. Every night, billions of them swim up to eat, then swim back down before sunrise. It is the biggest trip any animals make every day!', adult: 'Myctophids are among the most abundant vertebrates on Earth. Their diel vertical migration moves carbon from surface waters to depth, part of the ocean\'s biological pump.' },
  { id: 'gulper-eel', emoji: '🐍', name: 'Gulper eel', zone: 'midnight', depth: '500–3,000 m', size: 'Up to 3 ft (1 m)', power: 'A mouth like a pelican', kid: 'It is mostly mouth! Its giant jaw opens like a net to catch food, and the tip of its tail glows pink to help find dinner.', adult: 'Eurypharynx pelecanoides has a loosely hinged jaw and expandable pouch suited to rare encounters with prey. Its photophore-tipped tail may act as a lure.' },
  { id: 'yeti-crab', emoji: '🦀', name: 'Yeti crab', zone: 'midnight', depth: '2,200 m', size: 'About 6 in (15 cm)', power: 'Grows its own food on hairy arms', kid: 'Discovered in 2005 next to hot springs on the seafloor. It has fuzzy arms like a yeti, and it grows bacteria on them to eat. Some even wave their arms to "farm" them!', adult: 'Kiwa species live at hydrothermal vents and cold seeps. Setae host chemosynthetic bacteria the crabs harvest; Kiwa puravida rhythmically waves its claws, likely to supply its symbionts with oxygen and sulfide.' },
  { id: 'tube-worm', emoji: '🪱', name: 'Giant tube worm', zone: 'midnight', depth: '2,000+ m', size: 'Up to 7 ft (2 m)', power: 'No mouth and no stomach', kid: 'Found in 1977 by scientists in a tiny submarine. It has no mouth! Bacteria inside it turn chemicals from hot springs into food. That discovery showed life can live without sunlight.', adult: 'Riftia pachyptila hosts chemosynthetic bacteria in an organ called the trophosome. Its 1977 discovery at the Galápagos Rift by the submersible Alvin revealed whole ecosystems powered by chemistry, not sunlight.' },
  { id: 'glass-sponge', emoji: '🧽', name: 'Glass sponge', zone: 'midnight', depth: '500–3,000 m', size: 'Up to 3 ft (1 m)', power: 'A skeleton made of glass', kid: 'Its body is built from tiny bits of glass, like lace. Some glass sponges may be thousands of years old, among the oldest animals on Earth.', adult: 'Hexactinellid sponges build skeletons of silica spicules with remarkable optical and mechanical properties. Some individuals are estimated to be thousands of years old, and their reefs are slow to recover from trawling.' },
  { id: 'pyrosome', emoji: '🔦', name: 'Pyrosome', zone: 'twilight', depth: '0–800 m', size: 'From inches to over 30 ft (10 m)', power: 'Thousands of tiny animals in one glowing tube', kid: 'A pyrosome looks like one long glowing sock, but it is really thousands of tiny animals stuck together. Touch the water near one and it lights up!', adult: 'Pyrosomes are colonial tunicates of zooids sharing a tunic. They filter-feed and are strongly bioluminescent; giant Pyrostremma spinosum colonies can reach many meters.' },
  { id: 'sea-otter', emoji: '🦦', name: 'Sea otter', zone: 'sunlight', depth: '0–100 m', size: 'About 4 ft (1.2 m)', power: 'Thickest fur of any animal', kid: 'Sea otters hold hands while they sleep so they do not float apart. They use rocks to crack open shells, and their fur is the thickest of any animal.', adult: 'Enhydra lutris lacks blubber and relies on fur up to ~1 million hairs per square inch. As a keystone predator of urchins, it keeps kelp forests from being grazed into urchin barrens.' },
  { id: 'narwhal', emoji: '🦄', name: 'Narwhal', zone: 'twilight', depth: '0–1,500 m', size: '13–18 ft (4–5.5 m), plus the tusk', power: 'A tusk that is really a tooth', kid: 'The unicorn of the sea! Its long spiral tusk is actually a tooth that grows right through its lip. Narwhals live in icy Arctic waters.', adult: 'Monodon monoceros males grow a tusk up to ~3 m from a canine tooth, with millions of nerve endings. Narwhals dive past 1,500 m under sea ice to feed on halibut and squid.' },
  { id: 'seahorse', emoji: '🐴', name: 'Seahorse', zone: 'sunlight', depth: '1–30 m', size: '1–14 in (2–35 cm)', power: 'Dads have the babies', kid: 'Seahorse dads carry the eggs in a pouch and give birth to hundreds of tiny babies! Seahorses hold onto seaweed with their curly tails.', adult: 'In Hippocampus the male broods eggs in a pouch that regulates oxygen and salinity. Seahorses are poor swimmers relying on camouflage; habitat loss and the dried-seahorse trade threaten many species.' },
  { id: 'hagfish', emoji: '🫧', name: 'Hagfish', zone: 'midnight', depth: '0–1,700 m', size: 'About 20 in (50 cm)', power: 'Makes buckets of slime', kid: 'When a hagfish is grabbed, it makes so much slime that it can fill a bucket in seconds! Then it ties itself in a knot to wipe the slime off.', adult: 'Hagfish slime glands release mucins and protein threads that expand ~10,000-fold in seawater, clogging predators\' gills. Hagfish are jawless and among the oldest living vertebrate lineages.' },
];

export const zoneById = (id) => ZONES.find((z) => z.id === id);
export const creatureById = (id) => CREATURES.find((c) => c.id === id);
export const zoneAt = (m) => ZONES.find((z) => m < z.bottom) || ZONES.at(-1);
export const creaturesIn = (zoneId) => CREATURES.filter((c) => c.zone === zoneId);

// Same creature everywhere for the whole week (weeks start Monday).
export function weekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const monday = d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000;
  return Math.floor(monday / (7 * 86_400_000));
}
export function creatureOfWeek(date = new Date(), offset = 0) {
  const n = CREATURES.length;
  return CREATURES[(((weekNumber(date) + offset) % n) + n) % n];
}

// Pressure in atmospheres: one for the air, plus about one per 10 m of seawater.
export const pressureAt = (m) => 1 + m / 10.06;
// Rough share of surface sunlight (clear open ocean, ~1% left at 200 m).
export const lightAt = (m) => Math.max(0, 100 * Math.exp(-m / 43.4));

export const toFeet = (m) => m * 3.28084;
export function depthLabel(m, units = 'imperial') {
  return units === 'metric'
    ? `${Math.round(m).toLocaleString()} m`
    : `${Math.round(toFeet(m)).toLocaleString()} ft`;
}

// Kid sense of a wave height in feet.
export function waveSense(ft) {
  if (ft == null) return null;
  if (ft < 1) return 'tiny ripples, great for splashing';
  if (ft < 3) return 'about as tall as a kitchen chair';
  if (ft < 5) return 'about as tall as a kitchen counter';
  if (ft < 7) return 'about as tall as a grown-up';
  if (ft < 12) return 'taller than a basketball hoop is high, almost';
  if (ft < 20) return 'as tall as a two-story house';
  return 'giant storm waves, stay far away from the beach';
}

export function waterSense(f) {
  if (f == null) return null;
  if (f < 50) return 'brrr! Seals and otters love it, people need a wetsuit';
  if (f < 60) return 'chilly, wetsuit weather';
  if (f < 70) return 'cool, a quick swim makes you shiver';
  if (f < 78) return 'nice and refreshing';
  if (f < 84) return 'warm like bath water, coral reefs like this';
  return 'super warm, warm water can power hurricanes';
}

export const OCEAN_QUIZ = [
  { q: 'Which zone gets enough sunlight for ocean plants to grow?', options: ['Sunlight Zone', 'Midnight Zone', 'Abyss'], answer: 0, why: 'Only the top 200 m (about 650 ft) gets enough light for phytoplankton.' },
  { q: 'About how much of the oxygen we breathe comes from the ocean?', options: ['Almost none', 'About half', 'All of it'], answer: 1, why: 'Tiny ocean plants called phytoplankton make about half of Earth\'s oxygen.' },
  { q: 'Where do giant tube worms get their food?', options: ['Sunlight', 'Bacteria that use chemicals from hot springs', 'They catch fish'], answer: 1, why: 'They have no mouth! Bacteria inside them turn vent chemicals into food.' },
  { q: 'What is the deepest place in the ocean?', options: ['The Titanic', 'Challenger Deep', 'The Great Barrier Reef'], answer: 1, why: 'Challenger Deep in the Mariana Trench is almost 7 miles down.' },
  { q: 'Why do so many deep-sea animals glow?', options: ['To find food, friends and hide from enemies', 'They swallowed light bulbs', 'The water glows'], answer: 0, why: 'It is called bioluminescence, and it is the main light in the deep sea.' },
  { q: 'What is an ROV?', options: ['A robot submarine driven from a ship', 'A kind of whale', 'A deep-sea fish'], answer: 0, why: 'ROV stands for remotely operated vehicle. It sends live video up a long cable.' },
];
