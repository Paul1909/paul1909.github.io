// Command and Conquer: Grid Management: constants, catalogue, missions.
'use strict';
const APP = 'cnc-grid-management';
const TS = 24;                    // art pixels per tile (the classic 24 x 24 grid)
const SEC_PER_H = 5;              // real seconds per game hour at 1x
const STEP_H = 1 / 12;            // simulation step: 5 game minutes
const SPEEDS = [1, 2, 4];
const TARIFF = 2.4;               // credits per MWh delivered to towns
const SELL_BACK = 0.5;

// Terrain
const G = 0, D = 1, R = 2, W = 3, F = 4, ROAD = 5, BRIDGE = 6;
const TER_NAME = ['Open ground', 'Dirt', 'Rock', 'River', 'Forest', 'Road', 'Bridge'];
const canBuild = t => t === G || t === D || t === ROAD;
const canLine = t => t !== R;
const canWalk = t => t === G || t === D || t === F || t === ROAD || t === BRIDGE;

// Structures. fp = footprint in tiles. cap MW. cost credits. sec = build seconds at 1x.
// min = minimum stable load (share of cap), ramp = share of cap per game hour, start = hours to start,
// fuel = credits per MWh, co2 = t per MWh, trip = forced outages per game day, fix = repair hours,
// up = upkeep credits per game hour, load = own consumption MW, need = prerequisite structure.
const S = {
  yard:  { name: 'Construction Yard', fp: [3, 3], cost: 0, up: 1, load: 2, see: 7, desc: 'Your base. Everything is built from here.' },
  coal:  { name: 'Coal Plant', col: 'L', fp: [2, 2], cost: 900, sec: 14, cap: 120, min: .4, ramp: .3, start: 3, fuel: .45, co2: .95, trip: .1, fix: 6, up: 5, smog: 1, see: 4,
           desc: 'Cheap, steady and dirty. Slow to start (3 h) and to ramp. Smog upsets nearby towns.' },
  gas:   { name: 'Gas Turbine', col: 'L', fp: [2, 2], cost: 650, sec: 10, cap: 80, min: .2, ramp: 5, start: .25, fuel: 1.35, co2: .45, trip: .06, fix: 3, up: 3, auto: 1, see: 4,
           desc: 'Starts in 15 minutes and follows the load. Pricey fuel. Runs on AUTO by default.' },
  wind:  { name: 'Wind Turbine', col: 'L', fp: [1, 1], cost: 420, sec: 7, cap: 18, up: .8, ren: 'wind', see: 3,
           desc: 'Free power when the wind blows. Better near rocks and ridges. Stops in storms.' },
  solar: { name: 'Solar Array', col: 'L', fp: [2, 2], cost: 380, sec: 6, cap: 26, up: .4, ren: 'sun', see: 3,
           desc: 'Free power in daylight. Short winter days, and snow has to slide off first.' },
  hydro: { name: 'Hydro Dam', col: 'L', fp: [2, 2], cost: 1400, sec: 18, cap: 70, up: 2, res: 700, inflow: 22, see: 4, river: 1,
           desc: 'Clean and instant. Must sit across the river. Its lake refills slowly.' },
  nuke:  { name: 'Nuclear Reactor', col: 'L', fp: [3, 3], cost: 4200, sec: 40, cap: 360, min: .7, ramp: .08, start: 12, fuel: .15, co2: 0, trip: .035, fix: 12, up: 16, need: 'dome', see: 5,
           desc: 'Huge clean base load. Very slow to start (12 h) and to ramp. Needs a SCADA Dome.' },
  bess:  { name: 'Battery Bunker', col: 'L', fp: [2, 2], cost: 850, sec: 10, cap: 50, energy: 200, eff: .9, up: .8, store: 1, need: 'dome', see: 3,
           desc: 'BESS: 50 MW, 4 hours. Reacts instantly to trips and peaks, soaks up surplus.' },
  line:  { name: 'Power Line', col: 'R', fp: [1, 1], cost: 25, sec: 0, up: 0, line: 1,
           desc: 'Lay pylons tile by tile: drag from your base. Crossing the river costs 3x.' },
  sub:   { name: 'Substation', col: 'R', fp: [1, 1], cost: 150, sec: 4, up: .2, see: 4, outpost: 1,
           desc: 'Place it anywhere along your lines. You can build plants around it.' },
  dome:  { name: 'SCADA Dome', col: 'R', fp: [2, 2], cost: 1000, sec: 14, up: 2, load: 6, see: 9,
           desc: 'Radar, weather forecast and grid control. Unlocks batteries, reactors and Tesla coils.' },
  depot: { name: 'Service Depot', col: 'R', fp: [2, 2], cost: 800, sec: 12, up: 1.5, load: 3, see: 4,
           desc: 'Line crews: lets you train Repair Trucks and Patrol Jeeps.' },
  tesla: { name: 'Tesla Coil', col: 'R', fp: [1, 1], cost: 600, sec: 9, up: .5, load: 12, need: 'dome', see: 6, range: 5,
           desc: 'Zaps copper thieves within 5 tiles. Draws 12 MW and goes dark on low power.' },
  truck: { name: 'Repair Truck', col: 'R', unit: 1, cost: 500, sec: 8, need: 'depot', speed: 8, see: 4,
           desc: 'Drives to broken lines and tripped plants and fixes them for free.' },
  jeep:  { name: 'Patrol Jeep', col: 'R', unit: 1, cost: 400, sec: 6, need: 'depot', speed: 11, see: 5,
           desc: 'Hunts copper thieves near your lines. Each arrest pays a reward.' },
};
const ORDER_L = ['coal', 'gas', 'wind', 'solar', 'hydro', 'nuke', 'bess'];
const ORDER_R = ['line', 'sub', 'dome', 'depot', 'tesla', 'truck', 'jeep'];
const isGen = t => !!(S[t] && (S[t].cap && !S[t].store));
const THERMAL = t => S[t] && S[t].fuel !== undefined;

// Daily load shape (share of a town's peak) by hour.
const PROFILE = [.62, .58, .56, .56, .6, .7, .86, 1, 1.02, .95, .9, .88, .88, .86, .86, .9, 1, 1.12, 1.16, 1.12, 1.02, .9, .78, .68];

const NAMES = {
  winter: ['Kaltbach', 'Weissdorf', 'Eisental', 'Borovka', 'Snezhin', 'Frostholm', 'Valbianca', 'Nordegg', 'Gelida', 'Krasnoye', 'Hornfels', 'Lediny'],
  temperate: ['Grünau', 'Valverde', 'Lindenhof', 'Prato Alto', 'Morgenfeld', 'Rivabella', 'Sonnberg', 'Felsheim', 'Campolungo', 'Birkenau', 'Rosenthal', 'Vallefiore'],
};

const EVENT_INFO = {
  blizzard: { name: 'Blizzard', icon: '❄', warn: 'Warning: blizzard approaching.' },
  coldsnap: { name: 'Cold snap', icon: '🌡', warn: 'Cold snap: heating demand rising.' },
  calm:     { name: 'Dunkelflaute', icon: '☁', warn: 'Forecast: dark and windless days ahead.' },
  thieves:  { name: 'Copper thieves', icon: '⚠', warn: 'Intruders detected.' },
  storm:    { name: 'Wind storm', icon: '🌪', warn: 'Warning: storm front approaching.' },
};

// ---------- Missions ----------
// Goal check returns 'done', 'fail' or null. ctx gives helpers from sim.js.
const MISSIONS = [
  {
    id: 'm1', code: 'MISSION 1', name: 'Operation First Light', theme: 'winter', W: 40, H: 28, seed: 1101,
    credits: 6000, start: 8, tutorial: true,
    yard: [4, 11], river: { x: 21, amp: 2 }, rocks: 5, forest: .55,
    towns: [{ x: 14, y: 6, pop: 1500 }, { x: 30, y: 16, pop: 2100 }, { x: 33, y: 5, pop: 1100 }],
    allow: ['coal', 'gas', 'wind', 'solar', 'line', 'sub', 'dome'],
    events: [{ at: 22, type: 'calm', dur: 5 }],
    brief: [
      'Commander, the Kaltbach valley has been dark since the old station froze.',
      'Your Construction Yard has landed west of the river.',
      'Build power plants, string lines to the villages and keep their lights on through the long winter night.',
      'Every megawatt-hour you deliver pays credits. Every blackout costs you their trust.',
    ],
    goals: [
      { text: 'Power Kaltbach and Weissdorf', key: 'two', check: c => c.townLit(0) && c.townLit(1) ? 'done' : null, sticky: 1 },
      { text: 'Hold out until Day 2 · 08:00 with 90 % of energy served', key: 'hold',
        check: c => c.hour >= 32 ? (c.done('two') && c.served() >= .9 ? 'done' : 'extend') : null },
    ],
  },
  {
    id: 'm2', code: 'MISSION 2', name: 'Cold Front', theme: 'winter', W: 56, H: 40, seed: 2207,
    credits: 9000, start: 8,
    yard: [5, 18], river: { x: 30, amp: 4 }, rocks: 14, forest: .5,
    towns: [{ x: 15, y: 9, pop: 1800 }, { x: 17, y: 30, pop: 1600 }, { x: 38, y: 12, pop: 3200 }, { x: 44, y: 29, pop: 2600 }, { x: 50, y: 6, pop: 1400 }],
    events: [
      { at: 17, type: 'blizzard', dur: 7 }, { at: 27, type: 'thieves', n: 2 }, { at: 30, type: 'coldsnap', dur: 22 },
      { at: 36, type: 'thieves', n: 3 }, { at: 41, type: 'calm', dur: 9 }, { at: 50, type: 'thieves', n: 3 },
      { at: 54, type: 'blizzard', dur: 9 }, { at: 63, type: 'thieves', n: 4 },
    ],
    end: 78,
    brief: [
      'A cold front is rolling in from the north. Five villages need power before it hits.',
      'Expect blizzards that ice up and snap your lines, and copper thieves who strip unguarded pylons.',
      'A Service Depot trains repair crews and patrols. A SCADA Dome warns you before the weather turns.',
      'Hold the grid until the end of Day 3.',
    ],
    goals: [
      { text: 'Connect at least 4 villages', key: 'conn', check: c => c.lit() >= 4 ? 'done' : (c.hour >= c.end ? 'fail' : null) },
      { text: 'Serve 92 % of energy demanded', key: 'serve', check: c => c.hour >= c.end ? (c.served() >= .92 ? 'done' : 'fail') : null },
      { text: 'Approval of 50 % or more at the end', key: 'appr', check: c => c.hour >= c.end ? (c.approval() >= 50 ? 'done' : 'fail') : null },
    ],
  },
  {
    id: 'm3', code: 'MISSION 3', name: 'Operation Clean Sweep', theme: 'temperate', W: 56, H: 40, seed: 3313,
    credits: 7000, start: 8, co2: .6, co2Rise: .4,
    yard: [6, 19], river: { x: 27, amp: 3 }, rocks: 16, forest: .45,
    towns: [{ x: 16, y: 8, pop: 2600, wired: 1 }, { x: 15, y: 31, pop: 2400, wired: 1 }, { x: 22, y: 20, pop: 2000, wired: 1 },
            { x: 40, y: 13, pop: 3000 }, { x: 45, y: 30, pop: 2200 }],
    prebuilt: [{ t: 'coal', x: 10, y: 14 }, { t: 'coal', x: 10, y: 23 }, { t: 'gas', x: 13, y: 19 }],
    events: [
      { at: 20, type: 'thieves', n: 2 }, { at: 40, type: 'storm', dur: 6 }, { at: 46, type: 'thieves', n: 3 },
      { at: 62, type: 'calm', dur: 30 }, { at: 80, type: 'thieves', n: 3 }, { at: 98, type: 'thieves', n: 4 }, { at: 104, type: 'storm', dur: 5 },
    ],
    end: 126,
    brief: [
      'The coal age is over, Commander. Parliament has voted: both coal plants must go.',
      'CO₂ costs rise every day. Replace the coal with wind, sun, water, batteries or the atom.',
      'Watch for a long windless spell midweek. Sell the coal plants with the SELL button once you can live without them.',
      'Decommission both by the end of Day 5 and keep the lights on.',
    ],
    goals: [
      { text: 'Decommission both coal plants (SELL)', key: 'coal', check: c => c.count('coal') === 0 ? 'done' : (c.hour >= c.end ? 'fail' : null), sticky: 1 },
      { text: 'Two more villages connected', key: 'grow', check: c => c.lit() >= 5 ? 'done' : (c.hour >= c.end ? 'fail' : null), sticky: 1 },
      { text: 'Serve 96 % of energy in the last 24 hours', key: 'last', check: c => c.hour >= c.end ? (c.served24() >= .96 ? 'done' : 'fail') : null },
    ],
  },
  {
    id: 'sk', code: 'SKIRMISH', name: 'Endless Winter', theme: 'winter', W: 60, H: 44, seed: 0,
    credits: 9000, start: 8, endless: true, rocks: 18, forest: .5, river: { x: 32, amp: 5 },
    yard: [6, 21], towns: 'random',
    brief: [
      'No orders, no end. Villages grow, demand climbs, the weather gets meaner.',
      'Survive as many days as you can. You lose when approval collapses or the treasury runs dry.',
    ],
    goals: [
      { text: 'Survive: days held', key: 'days', check: () => null },
    ],
  },
];
