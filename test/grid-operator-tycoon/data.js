// Grid Operator Tycoon: constants, plant catalogue, research, scenarios and flavour text.
'use strict';
const APP = 'grid-operator-tycoon';

// Tile types
const T = { SEA: 0, PLAIN: 1, FOREST: 2, HILL: 3, MOUNT: 4, BEACH: 5, LAKE: 6 };
const TILE_NAME = ['Sea', 'Plains', 'Forest', 'Hills', 'Mountains', 'Coast', 'Lake'];
const isWater = t => t === T.SEA || t === T.LAKE;

// Time: one game hour per real second at 1x. Each game day stands for a whole month of cash flow.
const STEP = 1 / 12;            // game hours per simulation step
const MONTH_F = 30.4;           // days of energy each game day stands for
const HOURS_YEAR = 288;         // game hours per game year (12 days x 24 h)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SPEEDS = [1, 3, 8];

// Transmission line tiers. cost in MEUR per tile (1 tile = 10 km), cap in MW, x = reactance per tile.
const TIERS = {
  1: { name: '110 kV', cap: 220, x: 1.0, cost: 4, max: 9, col: '#8795a3', w: 1.4 },
  2: { name: '220 kV', cap: 650, x: 0.45, cost: 9, max: 14, col: '#5d6c7c', w: 2 },
  3: { name: '380 kV', cap: 1800, x: 0.2, cost: 16, max: 22, col: '#3a4757', w: 2.8, research: 'ehv' },
};

// Generation mix categories (for charts and shares)
const CATS = ['nuclear', 'coal', 'gas', 'hydro', 'wind', 'solar', 'storage', 'import'];
const CAT_COL = { nuclear: '#9b6bff', coal: '#5b4a3f', gas: '#ff8a3d', hydro: '#2f80ed', wind: '#2bbfae', solar: '#f5b800', storage: '#e8488a', import: '#9aa5b1' };
const CAT_NAME = { nuclear: 'Nuclear', coal: 'Coal', gas: 'Gas', hydro: 'Hydro', wind: 'Wind', solar: 'Solar', storage: 'Batteries', import: 'Imports' };
const IMPORT_CO2 = 0.25;        // t/MWh assumed for imported power

// Plant catalogue. cap MW, cost MEUR, om MEUR/yr, build in months (game days), fuel EUR/MWh, co2 t/MWh,
// min = minimum stable load (share of cap), ramp = share of cap per hour, start = hours to start,
// fo = forced outages per year, repair = game hours.
const PLANTS = {
  solar: { name: 'Solar park', code: 'PV', icon: '☀️', cat: 'solar', cap: 50, cost: 30, om: 0.6, build: 1, ren: 1,
    where: 'Any land except mountains. Sunnier in the south.', desc: 'Cheap and silent, no fuel. Only works in daylight.' },
  wind: { name: 'Wind farm', code: 'WIND', icon: '🌬️', cat: 'wind', cap: 60, cost: 84, om: 2.4, build: 2, ren: 1,
    where: 'Any land. Best on coasts, hills and ridges.', desc: 'No fuel, follows the weather. Stops in calm spells and in storms.' },
  offshore: { name: 'Offshore wind', code: 'OFF', icon: '🌊', cat: 'wind', cap: 300, cost: 900, om: 24, build: 6, ren: 1, research: 'offshore',
    where: 'Sea tiles.', desc: 'Big, steady sea wind. Needs a subsea cable to shore.' },
  hydro: { name: 'Hydro dam', code: 'HYD', icon: '💧', cat: 'hydro', cap: 200, cost: 450, om: 4, build: 10, min: 0, ramp: 10, start: 0.1, fo: 0.8, repair: 6, res: 120,
    where: 'On a river, next to hills or mountains.', desc: 'Clean and flexible. Its lake fills with rain and snowmelt, so dry winters limit it.' },
  ocgt: { name: 'Gas peaker', code: 'OCGT', icon: '🔥', cat: 'gas', cap: 100, cost: 60, om: 1.2, build: 2, fuel: 105, gas: 1, co2: 0.55, min: 0.2, ramp: 6, start: 0.25, fo: 2, repair: 4, startCost: 20,
    where: 'Any land except mountains.', desc: 'Starts in minutes, pricey to run. Covers peaks and sudden trips.' },
  ccgt: { name: 'Gas CCGT', code: 'CCGT', icon: '🏭', cat: 'gas', cap: 400, cost: 380, om: 9, build: 4, fuel: 68, gas: 1, co2: 0.36, min: 0.4, ramp: 1.5, start: 2, fo: 1.4, repair: 8, startCost: 50,
    where: 'Any land except mountains.', desc: 'Efficient gas plant, the workhorse. Needs 2 hours to start.' },
  coal: { name: 'Coal plant', code: 'COAL', icon: '⚫', cat: 'coal', cap: 600, cost: 1100, om: 28, build: 8, fuel: 32, co2: 0.9, min: 0.4, ramp: 0.5, start: 8, fo: 1.2, repair: 12, startCost: 90, smog: 1,
    where: 'Any land except mountains.', desc: 'Cheap fuel, lots of CO₂ and smog. Slow to start and to ramp.' },
  nuclear: { name: 'Nuclear plant', code: 'NUC', icon: '⚛️', cat: 'nuclear', cap: 1000, cost: 7000, om: 110, build: 28, fuel: 9, co2: 0, min: 0.6, ramp: 0.1, start: 36, fo: 0.3, repair: 24, startCost: 0, water: 1, nuc: 1,
    where: 'Next to a river, lake or the sea, 3+ tiles from towns.', desc: 'Huge, clean, steady base load. Very expensive, slow to build and very slow to restart.' },
  smr: { name: 'Small reactor', code: 'SMR', icon: '⚛️', cat: 'nuclear', cap: 300, cost: 1800, om: 35, build: 14, fuel: 12, co2: 0, min: 0.4, ramp: 0.3, start: 12, fo: 0.3, repair: 16, startCost: 0, water: 1, nuc: 1, research: 'smr',
    where: 'Next to a river, lake or the sea, 3+ tiles from towns.', desc: 'Factory-built reactor. Smaller, faster to build, a bit more flexible.' },
  bess: { name: 'Battery (BESS)', code: 'BESS', icon: '🔋', cat: 'storage', cap: 100, hours: 4, cost: 105, om: 1.2, build: 1, eff: 0.88, store: 1,
    where: 'Any land except mountains.', desc: 'Reacts instantly: soaks up cheap midday power, covers evening peaks and plant trips.' },
  pumped: { name: 'Pumped hydro', code: 'PSH', icon: '⛰️', cat: 'storage', cap: 500, hours: 10, cost: 900, om: 6, build: 12, eff: 0.78, store: 1, research: 'pumped',
    where: 'Hills or mountains next to a river or lake.', desc: 'A giant water battery: pumps uphill when power is cheap.' },
  sub: { name: 'Substation', code: 'SUB', icon: '🔌', cat: null, cap: 0, cost: 8, om: 0.15, build: 0.3,
    where: 'Any land.', desc: 'A junction where several lines meet. Lets you build meshed, sturdier grids.' },
};
const BUILD_ORDER = ['solar', 'wind', 'offshore', 'hydro', 'bess', 'pumped', 'ocgt', 'ccgt', 'coal', 'smr', 'nuclear', 'sub'];
const THERMAL = t => PLANTS[t] && PLANTS[t].fuel !== undefined;

// Research
const RESEARCH = [
  { id: 'scada', name: 'Control centre', icon: '🖥️', cost: 40, desc: 'Automatic redispatch: when a line overloads, plants on either side shift output to relieve it.' },
  { id: 'smart', name: 'Smart meters', icon: '📟', cost: 90, desc: 'Heat pumps and EV chargers shift away from peaks: evening peaks shrink up to 7 %, and customers like it (+3 approval).' },
  { id: 'dlr', name: 'Dynamic line rating', icon: '🌡️', cost: 110, desc: 'Sensors on the wires: lines carry 20 % more when it is windy or cold.' },
  { id: 'ehv', name: '380 kV lines', icon: '🗼', cost: 140, desc: 'Extra-high voltage: 1,800 MW per line over 22 tiles.' },
  { id: 'bess2', name: 'Batteries 2.0', icon: '🔋', cost: 150, desc: 'Cheaper cells: new batteries cost 30 % less and store 6 hours instead of 4.' },
  { id: 'solar2', name: 'Bifacial solar', icon: '☀️', cost: 100, desc: 'New solar parks cost 25 % less and yield 12 % more.' },
  { id: 'offshore', name: 'Offshore wind', icon: '🌊', cost: 220, desc: 'Unlocks offshore wind farms on sea tiles.' },
  { id: 'pumped', name: 'Pumped hydro', icon: '⛰️', cost: 200, desc: 'Unlocks pumped-storage plants: 500 MW, 10 hours of storage.' },
  { id: 'smr', name: 'Small modular reactor', icon: '⚛️', cost: 380, desc: 'Unlocks 300 MW reactors that build in 14 months.', nuc: 1 },
];
const R_BUDGETS = [0, 20, 50, 100];   // MEUR per year
const MAINT = [
  { name: 'Low', om: 0.8, fo: 1.7, rep: 1.6 },
  { name: 'Normal', om: 1, fo: 1, rep: 1 },
  { name: 'High', om: 1.3, fo: 0.55, rep: 0.6 },
];

// Weather events
const EVENTS = {
  storm: { icon: '🌪️', name: 'Storm', dur: [8, 16], months: [9, 10, 11, 0, 1, 2], w: 3, desc: 'Gale-force wind: turbines cut out, lines can get damaged.' },
  calm: { icon: '🌫️', name: 'Dark doldrums', dur: [24, 40], months: [10, 11, 0, 1], w: 2, desc: 'No wind and thick cloud for days.' },
  heat: { icon: '🥵', name: 'Heatwave', dur: [24, 48], months: [5, 6, 7], w: 3, desc: 'Air-con demand rises, river-cooled plants lose output.' },
  cold: { icon: '❄️', name: 'Cold snap', dur: [24, 36], months: [11, 0, 1], w: 3, desc: 'Heating demand jumps.' },
  gas: { icon: '💹', name: 'Gas price spike', dur: [48, 96], months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], w: 1, desc: 'Gas costs double for a while.' },
  cloud: { icon: '🌧️', name: 'Rainy spell', dur: [12, 30], months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], w: 2, desc: 'Heavy cloud cuts solar, rain fills the dams.' },
};

const TOWN_NAMES = ['Voltaggio', 'Ohmburg', 'Wattenberg', 'Ampèreville', 'Joulesbad', 'Faradella', 'Kilowattikon', 'Teslau', 'Coulombe',
  'Henrystadt', 'Lumenzano', 'Dynamora', 'Sparkhaven', 'Fuseby', 'Gridelwald', 'Kelvinach', 'Hertzberg', 'Galvania', 'Condensa',
  'Turbinia', 'Rotorvik', 'Megawattingen', 'Flussbrück', 'Bollettino', 'Lampedina', 'Stromwil', 'Funkenau', 'Blitzingen', 'Scintilla',
  'Lucerino', 'Spinola', 'Presabella', 'Ferrantia', 'Watford-on-Volt', 'Isolatore', 'Kabelstein'];
const IND_TYPES = [
  { kind: 'dc', name: 'data centre', icon: '🖥️', mw: [90, 180] },
  { kind: 'factory', name: 'battery factory', icon: '🏭', mw: [60, 140] },
  { kind: 'h2', name: 'hydrogen electrolyser', icon: '🫧', mw: [80, 160] },
];

// RCT-style thoughts from towns
const THOUGHTS = {
  black: [['⚡', 'Lights out again!'], ['🕯️', 'Dinner by candlelight… again'], ['🥶', 'My heat pump just stopped!'], ['😡', 'Who runs this grid?!'], ['📺', 'TV died mid-match. Thanks.']],
  pricey: [['💸', 'My power bill is outrageous'], ['🧾', 'Bills went up AGAIN?'], ['😤', 'Cheaper next door, you know']],
  cheap: [['💶', 'Cheap power, love it'], ['😄', 'Best tariff in years']],
  smog: [['😷', 'Smog from that coal plant'], ['🏭', 'That chimney never sleeps'], ['🤧', 'The air tastes like coal']],
  pylons: [['🗼', 'Those pylons ruin my view'], ['😒', 'Another power line? Really?']],
  wind: [['🌀', 'Turbines spoil the hills'], ['🙄', 'Whoosh whoosh all night']],
  nuke: [['☢️', 'A reactor next door? Hmm']],
  green: [['🌞', 'Proud of our solar parks'], ['🌬️', 'Clean wind power, nice!'], ['🌍', 'Our grid is getting greener']],
  good: [['😊', 'Power just works'], ['👍', 'Never had a blackout here'], ['🔌', 'Just bought an EV!'], ['☕', 'Kettle on, all good']],
  wait: [['🕯️', 'When do we get electricity?'], ['🔦', 'Still waiting for the grid…'], ['📮', 'Wrote to the minister. Again.']],
  grow: [['🏗️', 'New homes going up everywhere'], ['👶', 'The town is booming']],
};

// Scenarios. towns are populations in thousands. goals are checked live; years = deadline (end of that year).
const SCENARIOS = [
  { id: 'first-spark', name: 'First Spark', emoji: '💡', stars: 1, years: 3,
    blurb: 'Six towns in a green valley have never had electricity. Build your first plants and lines, and win them over.',
    W: 26, H: 22, seed: 1907, shape: 'coast-south', rivers: 2, towns: [110, 70, 52, 40, 30, 22],
    cash: 700, loanMax: 600, co2: 70, co2Rise: 5, nuclear: false, tutorial: true,
    borders: [{ side: 'E', name: 'Neighbourland', cap: 400 }], unlocked: [],
    goals: [{ k: 'allConn' }, { k: 'approval', v: 70 }] },
  { id: 'coal-country', name: 'Coal Country', emoji: '⚫', stars: 3, years: 10,
    blurb: 'You inherit a fragile, coal-fired grid. Shut every coal plant and cut CO₂, without the lights going out.',
    W: 34, H: 26, seed: 4242, shape: 'coast-west', rivers: 3, towns: [380, 210, 160, 120, 95, 80, 70, 60, 45, 35, 30],
    cash: 450, loanMax: 2000, co2: 85, co2Rise: 10, nuclear: true, unlocked: [],
    borders: [{ side: 'E', name: 'Ostmark', cap: 600 }],
    existing: [{ t: 'coal', near: 0, age: 34 }, { t: 'coal', near: 2, age: 28 }, { t: 'ccgt', near: 1, age: 9 }, { t: 'ocgt', near: 3, age: 15 }, { t: 'ocgt', near: 5, age: 22 }],
    goals: [{ k: 'noCoal' }, { k: 'co2', v: 180 }, { k: 'rel', v: 99.5 }, { k: 'approval', v: 60 }] },
  { id: 'alpine', name: 'Alpine Republic', emoji: '🏔️', stars: 2, years: 8,
    blurb: 'Mountains, dams and an old nuclear plant that closes at the end of Year 6. Replace it, keep winter supply secure and stay independent.',
    W: 30, H: 26, seed: 777, shape: 'alpine', rivers: 4, towns: [260, 150, 110, 90, 70, 55, 45, 35, 28],
    cash: 500, loanMax: 1200, co2: 80, co2Rise: 8, nuclear: false, seasonAmp: 0.2, unlocked: [],
    borders: [{ side: 'N', name: 'Ostmark', cap: 500 }, { side: 'W', name: 'Pluggia', cap: 500 }],
    existing: [{ t: 'hydro', near: 0, age: 60 }, { t: 'hydro', near: 1, age: 55 }, { t: 'hydro', near: 3, age: 50 }, { t: 'nuclear', near: 2, age: 48, cap: 600, retire: 6 }],
    goals: [{ k: 'rel', v: 99.8 }, { k: 'approval', v: 70 }, { k: 'imports', v: 20 }] },
  { id: 'windward', name: 'Windward Isles', emoji: '🏝️', stars: 3, years: 12,
    blurb: 'A breezy archipelago runs on gas. Link every island with subsea cables and reach 75 % renewables.',
    W: 34, H: 28, seed: 31337, shape: 'islands', rivers: 1, towns: [180, 90, 70, 55, 40, 30, 25, 20],
    cash: 600, loanMax: 1500, co2: 80, co2Rise: 8, nuclear: false, unlocked: ['offshore'], borders: [],
    existing: [{ t: 'ccgt', near: 0, age: 12 }, { t: 'ocgt', near: 0, age: 20 }, { t: 'ocgt', near: 0, age: 18 }],
    goals: [{ k: 'allConn' }, { k: 'renew', v: 75 }, { k: 'approval', v: 65 }] },
  { id: 'sandbox', name: 'Sandbox', emoji: '🧪', stars: 0, years: 0,
    blurb: 'A big country, endless money, everything researched. Build the grid of your dreams.',
    W: 42, H: 34, seed: 2026, shape: 'mixed', rivers: 4, towns: [420, 260, 180, 140, 110, 90, 75, 60, 50, 40, 35, 30, 25, 20],
    cash: 99999, loanMax: 0, co2: 80, co2Rise: 5, nuclear: true, sandbox: true, unlocked: 'all',
    borders: [{ side: 'E', name: 'Ostmark', cap: 800 }, { side: 'N', name: 'Pluggia', cap: 600 }],
    goals: [] },
];

const GOAL_TEXT = {
  allConn: () => 'Connect every town to the grid',
  approval: v => `Approval of ${v} % or more`,
  noCoal: () => 'No coal plants left',
  co2: v => `CO₂ under ${v} g/kWh (last 12 months)`,
  rel: v => `Reliability ${v} % or better (last 12 months)`,
  renew: v => `Renewables ${v} % or more (last 12 months)`,
  imports: v => `Imports under ${v} % of demand (last 12 months)`,
};
