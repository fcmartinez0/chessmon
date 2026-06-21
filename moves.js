/*
 * Move database. Edit this file to add, remove, or tune moves.
 * Each entry is used by the battle system when pieces fight.
 *
 * Fields:
 *   name     — display name (must be unique; used as the ID in piece profiles)
 *   type     — elemental type: Normal | Fighting | Psychic | Rock | Fire | Dragon | Water | Grass
 *   accuracy — hit chance as a whole-number percentage (100 = always hits, 70 = misses 30% of the time)
 *   power    — base damage output (higher = more damage per hit)
 */
window.ChessMoves = [

  // ── Pawn ──────────────────────────────────────────────────────────────────────
  // Normal variant
  { name: 'Tackle',            type: 'Normal',   accuracy: 100, power: 18 },
  { name: 'Pawn Storm',        type: 'Normal',   accuracy:  90, power: 24 },
  { name: 'Brace',             type: 'Normal',   accuracy: 100, power: 12 },
  { name: 'Last Stand',        type: 'Normal',   accuracy:  70, power: 30 },
  // Fire variant
  { name: 'Ember Charge',      type: 'Fire',     accuracy:  95, power: 20 },
  { name: 'Flame Guard',       type: 'Fire',     accuracy: 100, power: 12 },
  // Grass variant
  { name: 'Seed Poke',         type: 'Grass',    accuracy:  95, power: 20 },
  { name: 'Thorn Shield',      type: 'Grass',    accuracy: 100, power: 12 },

  // ── Knight ────────────────────────────────────────────────────────────────────
  // Fighting variant
  { name: 'Fork Strike',       type: 'Fighting', accuracy:  90, power: 26 },
  { name: 'Gallop',            type: 'Normal',   accuracy:  95, power: 20 },
  { name: 'Counter Jab',       type: 'Fighting', accuracy:  90, power: 22 },
  { name: 'Feint Strike',      type: 'Normal',   accuracy:  80, power: 28 },
  // Water variant
  { name: 'Aqua Rush',         type: 'Water',    accuracy:  90, power: 26 },
  { name: 'Water Parry',       type: 'Water',    accuracy:  95, power: 18 },
  // Normal variant
  { name: 'Quick Strike',      type: 'Normal',   accuracy:  95, power: 24 },
  { name: 'Dodge Roll',        type: 'Normal',   accuracy: 100, power: 14 },

  // ── Bishop ────────────────────────────────────────────────────────────────────
  // Psychic variant
  { name: 'Diagonal Slash',    type: 'Psychic',  accuracy:  90, power: 25 },
  { name: 'Pierce',            type: 'Normal',   accuracy:  95, power: 21 },
  { name: 'Mind Shield',       type: 'Psychic',  accuracy:  95, power: 20 },
  { name: 'Prism Counter',     type: 'Normal',   accuracy:  80, power: 28 },
  // Grass variant
  { name: 'Leaf Slash',        type: 'Grass',    accuracy:  90, power: 25 },
  { name: 'Spore Guard',       type: 'Grass',    accuracy:  95, power: 18 },
  // Normal variant
  { name: 'Swift Strike',      type: 'Normal',   accuracy: 100, power: 20 },
  { name: 'Guard Up',          type: 'Normal',   accuracy: 100, power: 14 },

  // ── Rook ──────────────────────────────────────────────────────────────────────
  // Rock variant
  { name: 'Castle Crush',      type: 'Rock',     accuracy:  85, power: 28 },
  { name: 'Siege Slam',        type: 'Normal',   accuracy:  95, power: 21 },
  { name: 'Fortify',           type: 'Rock',     accuracy: 100, power: 16 },
  { name: 'Rampart Smash',     type: 'Normal',   accuracy:  80, power: 30 },
  // Water variant
  { name: 'Tidal Slam',        type: 'Water',    accuracy:  85, power: 28 },
  { name: 'Aqua Barrier',      type: 'Water',    accuracy: 100, power: 16 },
  // Fire variant
  { name: 'Blaze Cannon',      type: 'Fire',     accuracy:  85, power: 28 },
  { name: 'Ember Wall',        type: 'Fire',     accuracy: 100, power: 16 },

  // ── Queen ─────────────────────────────────────────────────────────────────────
  // Shared secondary move
  { name: 'Court Sweep',       type: 'Normal',   accuracy:  95, power: 24 },
  { name: 'Majestic Counter',  type: 'Normal',   accuracy:  80, power: 32 },
  // Fire variant
  { name: 'Royal Flame',       type: 'Fire',     accuracy:  85, power: 32 },
  { name: 'Imperial Guard',    type: 'Fire',     accuracy:  95, power: 22 },
  // Water variant
  { name: 'Hydro Surge',       type: 'Water',    accuracy:  85, power: 32 },
  { name: 'Aqua Aura',         type: 'Water',    accuracy:  95, power: 22 },
  // Grass variant
  { name: 'Verdant Gale',      type: 'Grass',    accuracy:  85, power: 32 },
  { name: 'Petal Veil',        type: 'Grass',    accuracy:  95, power: 22 },
  // Dragon variant
  { name: 'Sovereign Fury',    type: 'Dragon',   accuracy:  85, power: 32 },
  { name: 'Dragon Veil',       type: 'Dragon',   accuracy:  95, power: 22 },
  // Psychic variant
  { name: 'Psionic Wave',      type: 'Psychic',  accuracy:  85, power: 32 },
  { name: 'Mental Fortress',   type: 'Psychic',  accuracy:  95, power: 22 },

  // ── King ──────────────────────────────────────────────────────────────────────
  // Dragon variant
  { name: "Sovereign's Wrath", type: 'Dragon',   accuracy:  85, power: 30 },
  { name: 'Royal Decree',      type: 'Normal',   accuracy: 100, power: 22 },
  { name: 'Royal Defiance',    type: 'Dragon',   accuracy:  90, power: 26 },
  { name: 'Desperate Stand',   type: 'Normal',   accuracy:  70, power: 35 },
  // Fire variant
  { name: 'Royal Inferno',     type: 'Fire',     accuracy:  85, power: 30 },
  { name: 'Blazing Guard',     type: 'Fire',     accuracy:  90, power: 26 },
  // Normal variant
  { name: 'Rally',             type: 'Normal',   accuracy:  90, power: 28 },
  { name: 'Steadfast',         type: 'Normal',   accuracy: 100, power: 18 },

];
