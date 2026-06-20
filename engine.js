/*
 * Chess engine: board representation, move generation, legality, game state.
 * Board is a 64-element array indexed 0..63, where 0 = a8 and 63 = h1.
 * Pieces are encoded as strings: color ('w'|'b') + type ('p','n','b','r','q','k').
 * Empty squares are null.
 */
(function (global) {
  'use strict';

  const WHITE = 'w';
  const BLACK = 'b';

  // Direction offsets (in row/col terms) for sliding and stepping pieces.
  const KNIGHT_OFFSETS = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  const KING_OFFSETS = [
    [-1, -1], [-1, 0], [-1, 1], [0, -1],
    [0, 1], [1, -1], [1, 0], [1, 1],
  ];
  const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function rc(index) {
    return [Math.floor(index / 8), index % 8];
  }
  function idx(row, col) {
    return row * 8 + col;
  }
  function inBounds(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }
  function opposite(color) {
    return color === WHITE ? BLACK : WHITE;
  }
  function colorOf(piece) {
    return piece ? piece[0] : null;
  }
  function typeOf(piece) {
    return piece ? piece[1] : null;
  }

  function startingBoard() {
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const board = new Array(64).fill(null);
    for (let c = 0; c < 8; c++) {
      board[idx(0, c)] = 'b' + back[c];
      board[idx(1, c)] = 'bp';
      board[idx(6, c)] = 'wp';
      board[idx(7, c)] = 'w' + back[c];
    }
    return board;
  }

  class Game {
    constructor() {
      this.reset();
    }

    reset() {
      this.board = startingBoard();
      this.turn = WHITE;
      // Castling rights.
      this.castling = { wK: true, wQ: true, bK: true, bQ: true };
      // En passant target square index, or null.
      this.enPassant = null;
      this.halfmoveClock = 0;
      this.fullmoveNumber = 1;
      this.history = [];
      this.positionCounts = {};
      this._recordPosition();
    }

    clone() {
      const g = new Game();
      g.board = this.board.slice();
      g.turn = this.turn;
      g.castling = Object.assign({}, this.castling);
      g.enPassant = this.enPassant;
      g.halfmoveClock = this.halfmoveClock;
      g.fullmoveNumber = this.fullmoveNumber;
      g.history = [];
      g.positionCounts = Object.assign({}, this.positionCounts);
      return g;
    }

    _findKing(color) {
      const target = color + 'k';
      for (let i = 0; i < 64; i++) {
        if (this.board[i] === target) return i;
      }
      return -1;
    }

    // Is the given square attacked by `byColor`?
    isAttacked(square, byColor) {
      const [r, c] = rc(square);
      const board = this.board;

      // Pawn attacks. White pawns attack upward (toward row 0).
      const pawnDir = byColor === WHITE ? 1 : -1; // direction from target to attacker's pawn
      for (const dc of [-1, 1]) {
        const pr = r + pawnDir;
        const pc = c + dc;
        if (inBounds(pr, pc) && board[idx(pr, pc)] === byColor + 'p') return true;
      }

      // Knight attacks.
      for (const [dr, dc] of KNIGHT_OFFSETS) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && board[idx(nr, nc)] === byColor + 'n') return true;
      }

      // King attacks.
      for (const [dr, dc] of KING_OFFSETS) {
        const kr = r + dr;
        const kc = c + dc;
        if (inBounds(kr, kc) && board[idx(kr, kc)] === byColor + 'k') return true;
      }

      // Sliding: bishops/queens on diagonals.
      for (const [dr, dc] of BISHOP_DIRS) {
        let nr = r + dr;
        let nc = c + dc;
        while (inBounds(nr, nc)) {
          const p = board[idx(nr, nc)];
          if (p) {
            if (colorOf(p) === byColor && (typeOf(p) === 'b' || typeOf(p) === 'q')) return true;
            break;
          }
          nr += dr;
          nc += dc;
        }
      }

      // Sliding: rooks/queens on ranks/files.
      for (const [dr, dc] of ROOK_DIRS) {
        let nr = r + dr;
        let nc = c + dc;
        while (inBounds(nr, nc)) {
          const p = board[idx(nr, nc)];
          if (p) {
            if (colorOf(p) === byColor && (typeOf(p) === 'r' || typeOf(p) === 'q')) return true;
            break;
          }
          nr += dr;
          nc += dc;
        }
      }

      return false;
    }

    inCheck(color) {
      const king = this._findKing(color);
      if (king === -1) return false;
      return this.isAttacked(king, opposite(color));
    }

    // Generate pseudo-legal moves (not yet filtered for leaving king in check).
    _pseudoMoves(color) {
      const moves = [];
      const board = this.board;

      for (let i = 0; i < 64; i++) {
        const piece = board[i];
        if (!piece || colorOf(piece) !== color) continue;
        const type = typeOf(piece);
        const [r, c] = rc(i);

        if (type === 'p') {
          this._pawnMoves(i, r, c, color, moves);
        } else if (type === 'n') {
          this._stepMoves(i, r, c, color, KNIGHT_OFFSETS, moves);
        } else if (type === 'k') {
          this._stepMoves(i, r, c, color, KING_OFFSETS, moves);
          this._castlingMoves(i, r, c, color, moves);
        } else if (type === 'b') {
          this._slideMoves(i, r, c, color, BISHOP_DIRS, moves);
        } else if (type === 'r') {
          this._slideMoves(i, r, c, color, ROOK_DIRS, moves);
        } else if (type === 'q') {
          this._slideMoves(i, r, c, color, BISHOP_DIRS, moves);
          this._slideMoves(i, r, c, color, ROOK_DIRS, moves);
        }
      }
      return moves;
    }

    _pawnMoves(from, r, c, color, moves) {
      const board = this.board;
      const dir = color === WHITE ? -1 : 1; // white moves up (decreasing row)
      const startRow = color === WHITE ? 6 : 1;
      const promoteRow = color === WHITE ? 0 : 7;

      // Single push.
      const oneR = r + dir;
      if (inBounds(oneR, c) && !board[idx(oneR, c)]) {
        this._addPawnMove(from, idx(oneR, c), color, oneR === promoteRow, moves);
        // Double push.
        if (r === startRow) {
          const twoR = r + 2 * dir;
          if (!board[idx(twoR, c)]) {
            moves.push({ from, to: idx(twoR, c), piece: color + 'p', double: true });
          }
        }
      }

      // Captures.
      for (const dc of [-1, 1]) {
        const nr = oneR;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const target = idx(nr, nc);
        const occupant = board[target];
        if (occupant && colorOf(occupant) !== color) {
          this._addPawnMove(from, target, color, nr === promoteRow, moves, occupant);
        } else if (target === this.enPassant) {
          // En passant capture.
          const capturedSquare = idx(r, nc);
          moves.push({
            from,
            to: target,
            piece: color + 'p',
            enPassant: true,
            captured: board[capturedSquare],
            capturedSquare,
          });
        }
      }
    }

    _addPawnMove(from, to, color, isPromotion, moves, captured) {
      if (isPromotion) {
        for (const promo of ['q', 'r', 'b', 'n']) {
          moves.push({ from, to, piece: color + 'p', promotion: color + promo, captured: captured || null });
        }
      } else {
        moves.push({ from, to, piece: color + 'p', captured: captured || null });
      }
    }

    _stepMoves(from, r, c, color, offsets, moves) {
      const board = this.board;
      const piece = board[from];
      for (const [dr, dc] of offsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const to = idx(nr, nc);
        const occupant = board[to];
        if (!occupant) {
          moves.push({ from, to, piece });
        } else if (colorOf(occupant) !== color) {
          moves.push({ from, to, piece, captured: occupant });
        }
      }
    }

    _slideMoves(from, r, c, color, dirs, moves) {
      const board = this.board;
      const piece = board[from];
      for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (inBounds(nr, nc)) {
          const to = idx(nr, nc);
          const occupant = board[to];
          if (!occupant) {
            moves.push({ from, to, piece });
          } else {
            if (colorOf(occupant) !== color) moves.push({ from, to, piece, captured: occupant });
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    }

    _castlingMoves(from, r, c, color, moves) {
      // King must be on its home square and not in check.
      const homeRow = color === WHITE ? 7 : 0;
      if (r !== homeRow || c !== 4) return;
      const enemy = opposite(color);
      if (this.isAttacked(from, enemy)) return;

      const rights = this.castling;
      const board = this.board;

      // Kingside.
      const kSide = color === WHITE ? rights.wK : rights.bK;
      if (kSide && !board[idx(homeRow, 5)] && !board[idx(homeRow, 6)] &&
          board[idx(homeRow, 7)] === color + 'r' &&
          !this.isAttacked(idx(homeRow, 5), enemy) &&
          !this.isAttacked(idx(homeRow, 6), enemy)) {
        moves.push({ from, to: idx(homeRow, 6), piece: color + 'k', castle: 'K' });
      }

      // Queenside.
      const qSide = color === WHITE ? rights.wQ : rights.bQ;
      if (qSide && !board[idx(homeRow, 1)] && !board[idx(homeRow, 2)] && !board[idx(homeRow, 3)] &&
          board[idx(homeRow, 0)] === color + 'r' &&
          !this.isAttacked(idx(homeRow, 3), enemy) &&
          !this.isAttacked(idx(homeRow, 2), enemy)) {
        moves.push({ from, to: idx(homeRow, 2), piece: color + 'k', castle: 'Q' });
      }
    }

    // Fully legal moves for the side to move (or a given color).
    legalMoves(color) {
      color = color || this.turn;
      const pseudo = this._pseudoMoves(color);
      const legal = [];
      for (const move of pseudo) {
        this._applyMove(move);
        if (!this.inCheck(color)) legal.push(move);
        this._undoMove(move);
      }
      return legal;
    }

    legalMovesFrom(square) {
      return this.legalMoves(this.turn).filter((m) => m.from === square);
    }

    // Apply a move to the board without bookkeeping that's reversed in _undoMove.
    // Stores the prior state needed for undo on the move object.
    _applyMove(move) {
      const board = this.board;
      move._prev = {
        castling: Object.assign({}, this.castling),
        enPassant: this.enPassant,
        halfmoveClock: this.halfmoveClock,
        fullmoveNumber: this.fullmoveNumber,
        captured: board[move.to],
      };

      const piece = board[move.from];
      const color = colorOf(piece);

      board[move.to] = move.promotion || piece;
      board[move.from] = null;

      if (move.enPassant) {
        board[move.capturedSquare] = null;
      }

      if (move.castle) {
        const homeRow = color === WHITE ? 7 : 0;
        if (move.castle === 'K') {
          board[idx(homeRow, 5)] = board[idx(homeRow, 7)];
          board[idx(homeRow, 7)] = null;
        } else {
          board[idx(homeRow, 3)] = board[idx(homeRow, 0)];
          board[idx(homeRow, 0)] = null;
        }
      }

      // Update castling rights.
      if (typeOf(piece) === 'k') {
        if (color === WHITE) { this.castling.wK = false; this.castling.wQ = false; }
        else { this.castling.bK = false; this.castling.bQ = false; }
      }
      this._touchRookRights(move.from);
      this._touchRookRights(move.to);

      // En passant target.
      if (move.double) {
        const [fr, fc] = rc(move.from);
        this.enPassant = idx((fr + move.to) / 16 | 0, fc); // midpoint row, same col
        const [tr] = rc(move.to);
        this.enPassant = idx((fr + tr) / 2, fc);
      } else {
        this.enPassant = null;
      }

      // Halfmove clock (reset on pawn move or capture).
      if (typeOf(piece) === 'p' || move.captured || move._prev.captured) {
        this.halfmoveClock = 0;
      } else {
        this.halfmoveClock++;
      }

      if (color === BLACK) this.fullmoveNumber++;
      this.turn = opposite(color);
    }

    _touchRookRights(square) {
      if (square === idx(7, 0)) this.castling.wQ = false;
      else if (square === idx(7, 7)) this.castling.wK = false;
      else if (square === idx(0, 0)) this.castling.bQ = false;
      else if (square === idx(0, 7)) this.castling.bK = false;
    }

    _undoMove(move) {
      const board = this.board;
      const prev = move._prev;
      const moved = move.promotion ? colorOf(move.promotion) + 'p' : board[move.to];

      board[move.from] = moved;
      board[move.to] = prev.captured;

      if (move.enPassant) {
        board[move.to] = null;
        board[move.capturedSquare] = move.captured;
      }

      if (move.castle) {
        const color = colorOf(moved);
        const homeRow = color === WHITE ? 7 : 0;
        if (move.castle === 'K') {
          board[idx(homeRow, 7)] = board[idx(homeRow, 5)];
          board[idx(homeRow, 5)] = null;
        } else {
          board[idx(homeRow, 0)] = board[idx(homeRow, 3)];
          board[idx(homeRow, 3)] = null;
        }
      }

      this.castling = prev.castling;
      this.enPassant = prev.enPassant;
      this.halfmoveClock = prev.halfmoveClock;
      this.fullmoveNumber = prev.fullmoveNumber;
      this.turn = colorOf(moved);
    }

    // Public: make a move permanently, updating history. `move` should come from legalMoves.
    makeMove(move) {
      move.san = this._toSAN(move);
      this._applyMove(move);
      this.history.push(move);
      this._recordPosition();
      return move;
    }

    // Variant support: a capture attempt that FAILED (e.g. a lost battle).
    // The capturing piece is removed; the defender stays; the turn passes.
    makeFailedCapture(move) {
      const piece = this.board[move.from];
      const type = typeOf(piece);
      const color = colorOf(piece);
      move.battleLost = true;
      move.san = (type === 'p' ? Game.fileLetter(move.from) : type.toUpperCase()) +
        'x' + Game.squareName(move.to) + '✗';

      move._prev = {
        castling: Object.assign({}, this.castling),
        enPassant: this.enPassant,
        halfmoveClock: this.halfmoveClock,
        fullmoveNumber: this.fullmoveNumber,
        piece,
      };

      this.board[move.from] = null;
      if (type === 'k') {
        if (color === WHITE) { this.castling.wK = false; this.castling.wQ = false; }
        else { this.castling.bK = false; this.castling.bQ = false; }
      }
      this._touchRookRights(move.from);
      this.enPassant = null;
      this.halfmoveClock = 0;
      if (color === BLACK) this.fullmoveNumber++;
      this.turn = opposite(color);

      this.history.push(move);
      this._recordPosition();
      return move;
    }

    _undoFailedCapture(move) {
      const prev = move._prev;
      this.board[move.from] = prev.piece;
      this.castling = prev.castling;
      this.enPassant = prev.enPassant;
      this.halfmoveClock = prev.halfmoveClock;
      this.fullmoveNumber = prev.fullmoveNumber;
      this.turn = colorOf(prev.piece);
    }

    undo() {
      const move = this.history.pop();
      if (!move) return null;
      this._unrecordPosition();
      if (move.battleLost) this._undoFailedCapture(move);
      else this._undoMove(move);
      return move;
    }

    _positionKey() {
      // Side to move + board + castling + en passant define a position for repetition.
      return this.board.map((p) => p || '-').join('') + this.turn +
        JSON.stringify(this.castling) + this.enPassant;
    }
    _recordPosition() {
      const key = this._positionKey();
      this.positionCounts[key] = (this.positionCounts[key] || 0) + 1;
    }
    _unrecordPosition() {
      const key = this._positionKey();
      if (this.positionCounts[key]) this.positionCounts[key]--;
    }

    isThreefold() {
      return this.positionCounts[this._positionKey()] >= 3;
    }

    // Returns { over, result, reason }.
    status() {
      const moves = this.legalMoves(this.turn);
      if (moves.length === 0) {
        if (this.inCheck(this.turn)) {
          const winner = this.turn === WHITE ? 'Black' : 'White';
          return { over: true, result: opposite(this.turn), reason: winner + ' wins by checkmate' };
        }
        return { over: true, result: 'draw', reason: 'Draw by stalemate' };
      }
      if (this.halfmoveClock >= 100) {
        return { over: true, result: 'draw', reason: 'Draw by fifty-move rule' };
      }
      if (this.isThreefold()) {
        return { over: true, result: 'draw', reason: 'Draw by threefold repetition' };
      }
      if (this._insufficientMaterial()) {
        return { over: true, result: 'draw', reason: 'Draw by insufficient material' };
      }
      return { over: false, check: this.inCheck(this.turn) };
    }

    _insufficientMaterial() {
      const pieces = this.board.filter(Boolean);
      const types = pieces.map(typeOf);
      if (types.some((t) => t === 'p' || t === 'q' || t === 'r')) return false;
      // Only kings, knights, bishops remain.
      const minor = types.filter((t) => t === 'n' || t === 'b').length;
      return minor <= 1; // K vs K, K+minor vs K
    }

    // Standard algebraic notation for a move (computed before applying).
    _toSAN(move) {
      const piece = this.board[move.from];
      const type = typeOf(piece);
      const color = colorOf(piece);

      if (move.castle === 'K') return this._withCheckSuffix(move, color, 'O-O');
      if (move.castle === 'Q') return this._withCheckSuffix(move, color, 'O-O-O');

      const toSq = Game.squareName(move.to);
      const isCapture = !!move.captured || move.enPassant;
      let san = '';

      if (type === 'p') {
        if (isCapture) san += Game.fileLetter(move.from) + 'x';
        san += toSq;
        if (move.promotion) san += '=' + typeOf(move.promotion).toUpperCase();
      } else {
        san += type.toUpperCase();
        san += this._disambiguation(move, type, color);
        if (isCapture) san += 'x';
        san += toSq;
      }
      return this._withCheckSuffix(move, color, san);
    }

    _disambiguation(move, type, color) {
      // Find other same-type pieces that can also move to the target.
      const others = this.legalMoves(color).filter(
        (m) => m.to === move.to && m.from !== move.from && typeOf(this.board[m.from]) === type
      );
      if (others.length === 0) return '';
      const sameFile = others.some((m) => rc(m.from)[1] === rc(move.from)[1]);
      const sameRank = others.some((m) => rc(m.from)[0] === rc(move.from)[0]);
      if (!sameFile) return Game.fileLetter(move.from);
      if (!sameRank) return Game.rankNumber(move.from);
      return Game.squareName(move.from);
    }

    _withCheckSuffix(move, color, san) {
      this._applyMove(move);
      const enemy = opposite(color);
      let suffix = '';
      if (this.inCheck(enemy)) {
        suffix = this.legalMoves(enemy).length === 0 ? '#' : '+';
      }
      this._undoMove(move);
      return san + suffix;
    }

    static squareName(index) {
      return Game.fileLetter(index) + Game.rankNumber(index);
    }
    static fileLetter(index) {
      return 'abcdefgh'[index % 8];
    }
    static rankNumber(index) {
      return String(8 - Math.floor(index / 8));
    }
  }

  global.Chess = { Game, WHITE, BLACK, colorOf, typeOf, rc, idx };
})(typeof window !== 'undefined' ? window : globalThis);
