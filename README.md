# chessmon

A 3D chess game where **captures are settled by Pokémon-style battles**. When a piece
tries to take another, the two face off on a turn-based battle screen with HP bars,
elemental types, and move effectiveness. The attacker can *lose* — in which case the
capture fails and the attacking piece is destroyed instead.

No build step, no dependencies to install. Just static files; Three.js loads from a CDN.

**▶ Play it now: https://fcmartinez0.github.io/chessmon/**

## Play

Open the link above, open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 4178
# then visit http://localhost:4178
```

> Needs an internet connection: the 3D renderer (Three.js) is loaded from a CDN.

## Features

- **Full chess rules** — legal moves, check/checkmate/stalemate, castling, en passant,
  promotion, plus draws by fifty-move rule, threefold repetition, and insufficient material.
- **Real 3D** (Three.js) — turned piece models, wood board, lighting and soft shadows,
  an orbit camera (drag to rotate, scroll to zoom), and animated moves (knights hop).
- **Computer opponent** — alpha-beta minimax with material + piece-square evaluation,
  three difficulty levels. Or play two-player hot-seat.
- **Pokémon-style battles** on every capture (toggleable):
  - Each piece type is an element with stats (HP/ATK/DEF/SPD) and two moves.
  - A type-effectiveness chart with super-effective / resisted hits, same-type bonus,
    crits, and damage variance.
  - You play your own piece's moves; the computer plays its piece.
  - **Outcome decides the capture.** If a failed capture leaves your own king in check,
    you lose the game.

### Type chart

| Piece  | Type     | HP | ATK | DEF | SPD |
|--------|----------|----|----|----|----|
| Pawn   | Normal   | 32 | 12 | 9  | 8  |
| Knight | Fighting | 46 | 18 | 12 | 17 |
| Bishop | Psychic  | 44 | 17 | 11 | 19 |
| Rook   | Rock     | 62 | 20 | 18 | 6  |
| Queen  | Fire     | 82 | 26 | 16 | 14 |
| King   | Dragon   | 72 | 20 | 20 | 10 |

## Project layout

| File         | Role |
|--------------|------|
| `index.html` | Markup, control panel, script/importmap wiring |
| `engine.js`  | Chess rules engine (move generation, legality, game state, SAN) |
| `ai.js`      | Alpha-beta minimax computer opponent |
| `battle.js`  | Pokémon-style battle system and battle UI |
| `app.js`     | 3D view layer (Three.js): rendering, input, move orchestration |
| `styles.css` | All styling, including the battle screen |

The chess engine and AI are plain `window`-scoped modules and have no rendering
dependencies; the move generator is validated against standard perft counts
(20 / 400 / 8,902 / 197,281 through depth 4).
