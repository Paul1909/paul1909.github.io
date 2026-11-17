// The four cars: real road-car homologation figures and the game stats derived from them.

// ps = metric horsepower, kg = kerb weight, kmh = claimed top speed, wb = wheelbase (mm), len = length (mm)
export const CARS = [
  { id: 'delta', name: 'Lancia Delta HF Integrale', short: 'DELTA HF', ver: 'Evoluzione II · 1993', ps: 215, kg: 1340, kmh: 220, wb: 2480, len: 3900,
    body: 0xf2f1ec, accent: 0xc8202a, accent2: 0x1d2f74, rim: 0xdedede, shape: 'hatch' },
  { id: 'impreza', name: 'Subaru Impreza WRX', short: 'IMPREZA', ver: 'GC8 · 1994', ps: 240, kg: 1230, kmh: 230, wb: 2520, len: 4340,
    body: 0x1c3a9a, accent: 0xf3c517, accent2: 0xf3c517, rim: 0xc9a33a, shape: 'sedan' },
  { id: 'celica', name: 'Toyota Celica GT-Four', short: 'CELICA', ver: 'ST205 · 1994', ps: 255, kg: 1390, kmh: 245, wb: 2545, len: 4420,
    body: 0xf0efe8, accent: 0xc3161c, accent2: 0x1b8a3c, rim: 0xd8d8d8, shape: 'coupe' },
  { id: 'evo', name: 'Mitsubishi Lancer Evo III', short: 'EVO III', ver: 'CE9A · 1995', ps: 270, kg: 1260, kmh: 239, wb: 2510, len: 4310,
    body: 0xf4f4f4, accent: 0xd0121b, accent2: 0x222222, rim: 0xe0e0e0, shape: 'wing' },
];

// Game physics from the specs:
//  top speed = claimed top speed; acceleration from power-to-weight;
//  handling from weight and wheelbase (lighter + shorter = nimbler); mass drives collisions and braking.
for (const c of CARS) {
  c.vmax = c.kmh / 3.6;
  c.psT = Math.round(c.ps / c.kg * 1000);
  c.accel = 2.1 + c.psT * 0.022;
  c.handling = Math.max(0.3, Math.min(1, 1 - (c.kg - 1230) / 1000 * 0.9 - (c.wb - 2480) / 100 * 0.5));
  c.grip = 9.81 * (1.22 + 0.3 * c.handling); // arcade tyres: a bit more grip than real life
  c.turn = 1.45 + 0.6 * c.handling;
  c.brake = 13 * Math.pow(1230 / c.kg, 0.4);
  c.mass = c.kg;
  c.bars = {
    speed: (c.kmh - 195) / 55,
    accel: (c.psT - 140) / 80,
    handling: c.handling,
    weight: (c.kg - 1000) / 450,
  };
}

