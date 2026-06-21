/*
 * Move database. Edit this file to add, remove, or tune moves.
 * Each entry is used by the battle system when pieces fight.
 *
 * Fields:
 *   name     — display name (must be unique; used as the ID in piece profiles)
 *   type     — elemental type: Normal | Fighting | Psychic | Rock | Fire | Dragon
 *   accuracy — hit chance as a whole-number percentage (100 = always hits, 70 = misses 30% of the time)
 *   power    — base damage output (higher = more damage per hit)
 */
window.ChessMoves = [

  // ── Attacker moves (used when a piece initiates a capture) ──────────────────

  // Pawn
  { name: 'Tackle',            type: 'Normal',   accuracy: 100, power: 18 },
  { name: 'Pawn Storm',        type: 'Normal',   accuracy:  90, power: 24 },

  // Knight
  { name: 'Fork Strike',       type: 'Fighting', accuracy:  90, power: 26 },
  { name: 'Gallop',            type: 'Normal',   accuracy:  95, power: 20 },

  // Bishop
  { name: 'Diagonal Slash',    type: 'Psychic',  accuracy:  90, power: 25 },
  { name: 'Pierce',            type: 'Normal',   accuracy:  95, power: 21 },

  // Rook
  { name: 'Castle Crush',      type: 'Rock',     accuracy:  85, power: 28 },
  { name: 'Siege Slam',        type: 'Normal',   accuracy:  95, power: 21 },

  // Queen
  { name: 'Royal Flame',       type: 'Fire',     accuracy:  85, power: 32 },
  { name: 'Court Sweep',       type: 'Normal',   accuracy:  95, power: 24 },

  // King
  { name: "Sovereign's Wrath", type: 'Dragon',   accuracy:  85, power: 30 },
  { name: 'Royal Decree',      type: 'Normal',   accuracy: 100, power: 22 },

  // ── Defender moves (used when a piece fights back against a capture) ─────────

  // Pawn
  { name: 'Brace',             type: 'Normal',   accuracy: 100, power: 12 },
  { name: 'Last Stand',        type: 'Normal',   accuracy:  70, power: 30 },

  // Knight
  { name: 'Counter Jab',       type: 'Fighting', accuracy:  90, power: 22 },
  { name: 'Feint Strike',      type: 'Normal',   accuracy:  80, power: 28 },

  // Bishop
  { name: 'Mind Shield',       type: 'Psychic',  accuracy:  95, power: 20 },
  { name: 'Prism Counter',     type: 'Normal',   accuracy:  80, power: 28 },

  // Rook
  { name: 'Fortify',           type: 'Rock',     accuracy: 100, power: 16 },
  { name: 'Rampart Smash',     type: 'Normal',   accuracy:  80, power: 30 },

  // Queen
  { name: 'Imperial Guard',    type: 'Fire',     accuracy:  95, power: 22 },
  { name: 'Majestic Counter',  type: 'Normal',   accuracy:  80, power: 32 },

  // King
  { name: 'Royal Defiance',    type: 'Dragon',   accuracy:  90, power: 26 },
  { name: 'Desperate Stand',   type: 'Normal',   accuracy:  70, power: 35 },

];
