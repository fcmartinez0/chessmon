/*
 * Simple chess AI: alpha-beta minimax with material + piece-square evaluation.
 */
(function (global) {
  'use strict';

  const { typeOf, colorOf, rc } = global.Chess;

  const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  // Piece-square tables from White's perspective (index 0 = a8).
  const PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50,
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20,
    ],
    r: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0,
    ],
    q: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20,
    ],
    k: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20,
    ],
  };

  function mirror(index) {
    const [r, c] = rc(index);
    return (7 - r) * 8 + c;
  }

  // Evaluation from White's perspective (positive = White better).
  function evaluate(game) {
    let score = 0;
    const board = game.board;
    for (let i = 0; i < 64; i++) {
      const piece = board[i];
      if (!piece) continue;
      const type = typeOf(piece);
      const color = colorOf(piece);
      const base = PIECE_VALUE[type];
      const positional = color === 'w' ? PST[type][i] : PST[type][mirror(i)];
      if (color === 'w') score += base + positional;
      else score -= base + positional;
    }
    return score;
  }

  // Order moves to improve alpha-beta pruning: captures and promotions first.
  function orderMoves(moves) {
    return moves.slice().sort((a, b) => scoreMove(b) - scoreMove(a));
  }
  function scoreMove(m) {
    let s = 0;
    if (m.captured) s += 10 * PIECE_VALUE[typeOf(m.captured)] - PIECE_VALUE[typeOf(m.piece)];
    if (m.promotion) s += PIECE_VALUE[typeOf(m.promotion)];
    return s;
  }

  function alphaBeta(game, depth, alpha, beta, maximizing) {
    const moves = game.legalMoves(game.turn);

    if (moves.length === 0) {
      if (game.inCheck(game.turn)) {
        // Checkmate. Prefer faster mates by offsetting with depth.
        return game.turn === 'w' ? -100000 - depth : 100000 + depth;
      }
      return 0; // stalemate
    }
    if (depth === 0) return evaluate(game);

    const ordered = orderMoves(moves);

    if (maximizing) {
      let best = -Infinity;
      for (const move of ordered) {
        game._applyMove(move);
        const val = alphaBeta(game, depth - 1, alpha, beta, false);
        game._undoMove(move);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const move of ordered) {
        game._applyMove(move);
        const val = alphaBeta(game, depth - 1, alpha, beta, true);
        game._undoMove(move);
        if (val < best) best = val;
        if (best < beta) beta = best;
        if (alpha >= beta) break;
      }
      return best;
    }
  }

  // Pick the best move for the side to move at the given search depth.
  function bestMove(game, depth) {
    const color = game.turn;
    const maximizing = color === 'w';
    const moves = orderMoves(game.legalMoves(color));
    if (moves.length === 0) return null;

    let bestVal = maximizing ? -Infinity : Infinity;
    let chosen = [];

    for (const move of moves) {
      game._applyMove(move);
      const val = alphaBeta(game, depth - 1, -Infinity, Infinity, !maximizing);
      game._undoMove(move);

      if (maximizing) {
        if (val > bestVal) { bestVal = val; chosen = [move]; }
        else if (val === bestVal) chosen.push(move);
      } else {
        if (val < bestVal) { bestVal = val; chosen = [move]; }
        else if (val === bestVal) chosen.push(move);
      }
    }

    // Randomize among equally-good moves for variety.
    return chosen[Math.floor(Math.random() * chosen.length)];
  }

  global.ChessAI = { bestMove, evaluate };
})(typeof window !== 'undefined' ? window : globalThis);
