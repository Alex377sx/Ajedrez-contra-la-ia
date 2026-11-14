/**
 * Motor de ajedrez reglamentario.
 * No toca el DOM. El modo didáctico importa estas primitivas y añade
 * sus reglas encima sin alterar el comportamiento clásico.
 */

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const PROMO = ['q', 'r', 'b', 'n'];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export function idx(file, rank) {
  return rank * 8 + file;
}

export function fileOf(square) {
  return square & 7;
}

export function rankOf(square) {
  return square >> 3;
}

export function onBoard(file, rank) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

export function alg(square) {
  return 'abcdefgh'[fileOf(square)] + String(rankOf(square) + 1);
}

export function parseAlg(text) {
  if (typeof text !== 'string' || !/^[a-h][1-8]$/.test(text)) return null;
  return idx(text.charCodeAt(0) - 97, text.charCodeAt(1) - 49);
}

export function opposite(color) {
  return color === 'w' ? 'b' : 'w';
}

function emptyMove(from, to) {
  return {
    from,
    to,
    promotion: null,
    castle: null,
    rookFrom: null,
    rookTo: null,
    captureAt: null,
    kind: 'normal',
    via: null,
  };
}

function mint(bag, color, type) {
  const id = `${color}${type}${bag.nextId++}`;
  return { t: type, c: color, id };
}

function normCastle(value) {
  if (!value || value === '-') return '-';
  let out = '';
  for (const ch of 'KQkq') if (value.includes(ch)) out += ch;
  return out || '-';
}

export function positionKey(state) {
  let board = '';
  for (let i = 0; i < 64; i += 1) {
    const piece = state.board[i];
    board += piece ? (piece.c === 'w' ? piece.t.toUpperCase() : piece.t) : '.';
  }
  const ep = state.ep == null ? '-' : alg(state.ep);
  return `${board} ${state.turn} ${state.castling} ${ep}`;
}

export function parseFEN(fen) {
  const parts = String(fen).trim().split(/\s+/);
  if (parts.length < 4) throw new Error('FEN incompleto');
  const [placement, turn, castling, epField, half = '0', full = '1'] = parts;
  if (turn !== 'w' && turn !== 'b') throw new Error('Turno inválido');
  const ranks = placement.split('/');
  if (ranks.length !== 8) throw new Error('FEN sin 8 filas');
  const bag = { nextId: 1 };
  const board = Array(64).fill(null);
  for (let row = 0; row < 8; row += 1) {
    const rank = 7 - row;
    let file = 0;
    for (const ch of ranks[row]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
      } else {
        const type = ch.toLowerCase();
        if (!'pnbrqk'.includes(type) || file > 7) throw new Error('Pieza FEN inválida');
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        board[idx(file, rank)] = mint(bag, color, type);
        file += 1;
      }
    }
    if (file !== 8) throw new Error('Fila FEN inválida');
  }
  const ep = epField === '-' ? null : parseAlg(epField);
  if (epField !== '-' && ep == null) throw new Error('Casilla al paso inválida');
  const state = {
    board,
    turn,
    castling: normCastle(castling),
    ep,
    halfmove: Number(half) || 0,
    fullmove: Number(full) || 1,
    nextId: bag.nextId,
    taken: { w: [], b: [] },
    moves: [],
    posCounts: {},
  };
  state.posCounts[positionKey(state)] = 1;
  return state;
}

export function toFEN(state) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let empty = 0;
    let row = '';
    for (let file = 0; file < 8; file += 1) {
      const piece = state.board[idx(file, rank)];
      if (!piece) {
        empty += 1;
      } else {
        if (empty) {
          row += empty;
          empty = 0;
        }
        row += piece.c === 'w' ? piece.t.toUpperCase() : piece.t;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const ep = state.ep == null ? '-' : alg(state.ep);
  return `${rows.join('/')} ${state.turn} ${state.castling} ${ep} ${state.halfmove} ${state.fullmove}`;
}

export function findKing(state, color) {
  for (let i = 0; i < 64; i += 1) {
    const piece = state.board[i];
    if (piece && piece.c === color && piece.t === 'k') return i;
  }
  return -1;
}

export function isAttacked(state, target, byColor) {
  const board = state.board;
  const tf = fileOf(target);
  const tr = rankOf(target);
  const pawnRank = byColor === 'w' ? tr - 1 : tr + 1;
  for (const df of [-1, 1]) {
    const file = tf + df;
    if (!onBoard(file, pawnRank)) continue;
    const piece = board[idx(file, pawnRank)];
    if (piece && piece.c === byColor && piece.t === 'p') return true;
  }
  for (const [df, dr] of KNIGHT) {
    const file = tf + df;
    const rank = tr + dr;
    if (!onBoard(file, rank)) continue;
    const piece = board[idx(file, rank)];
    if (piece && piece.c === byColor && piece.t === 'n') return true;
  }
  for (const [df, dr] of KING) {
    const file = tf + df;
    const rank = tr + dr;
    if (!onBoard(file, rank)) continue;
    const piece = board[idx(file, rank)];
    if (piece && piece.c === byColor && piece.t === 'k') return true;
  }
  if (rayHits(board, tf, tr, byColor, ORTHO, 'r')) return true;
  if (rayHits(board, tf, tr, byColor, DIAG, 'b')) return true;
  return false;
}

function rayHits(board, tf, tr, byColor, dirs, slider) {
  for (const [df, dr] of dirs) {
    let file = tf + df;
    let rank = tr + dr;
    while (onBoard(file, rank)) {
      const piece = board[idx(file, rank)];
      if (piece) {
        if (piece.c === byColor && (piece.t === slider || piece.t === 'q')) return true;
        break;
      }
      file += df;
      rank += dr;
    }
  }
  return false;
}

export function inCheck(state, color) {
  const king = findKing(state, color);
  if (king < 0) return false;
  return isAttacked(state, king, opposite(color));
}

export function stripCastling(castling, piece, square) {
  let rights = castling === '-' ? '' : castling;
  if (piece.t === 'k') {
    rights = piece.c === 'w' ? rights.replace(/[KQ]/g, '') : rights.replace(/[kq]/g, '');
  } else if (piece.t === 'r') {
    if (square === 0) rights = rights.replace('Q', '');
    else if (square === 7) rights = rights.replace('K', '');
    else if (square === 56) rights = rights.replace('q', '');
    else if (square === 63) rights = rights.replace('k', '');
  }
  return rights || '-';
}

export function applyMove(state, move) {
  const board = state.board.slice();
  const piece = board[move.from];
  if (!piece) throw new Error('No hay pieza en el origen');
  let captured = null;
  let capturedSq = null;
  if (move.captureAt != null) {
    capturedSq = move.captureAt;
    captured = board[capturedSq];
    if (capturedSq !== move.to) board[capturedSq] = null;
  } else if (board[move.to]) {
    capturedSq = move.to;
    captured = board[move.to];
  }
  board[move.from] = null;
  board[move.to] = move.promotion
    ? { t: move.promotion, c: piece.c, id: piece.id }
    : piece;
  if (move.castle) {
    board[move.rookTo] = board[move.rookFrom];
    board[move.rookFrom] = null;
  }
  let castling = stripCastling(state.castling, piece, move.from);
  if (captured && capturedSq != null) castling = stripCastling(castling, captured, capturedSq);
  let ep = null;
  if (
    piece.t === 'p'
    && fileOf(move.from) === fileOf(move.to)
    && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2
  ) {
    ep = idx(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2);
  }
  const taken = {
    w: state.taken.w.slice(),
    b: state.taken.b.slice(),
  };
  if (captured) taken[piece.c] = taken[piece.c].concat(captured.t);
  const next = {
    board,
    turn: opposite(piece.c),
    castling,
    ep,
    halfmove: piece.t === 'p' || captured ? 0 : state.halfmove + 1,
    fullmove: state.fullmove + (piece.c === 'b' ? 1 : 0),
    nextId: state.nextId,
    taken,
    moves: state.moves,
    posCounts: state.posCounts,
  };
  const key = positionKey(next);
  next.posCounts = { ...state.posCounts, [key]: (state.posCounts[key] || 0) + 1 };
  return next;
}

function pushPromo(moves, from, to, captureAt = null) {
  const rank = rankOf(to);
  const pieceRank = rankOf(from);
  const promoting = (pieceRank < rank && rank === 7) || (pieceRank > rank && rank === 0);
  if (!promoting) {
    const move = emptyMove(from, to);
    move.captureAt = captureAt;
    if (captureAt != null && captureAt !== to) move.kind = 'ep';
    moves.push(move);
    return;
  }
  for (const promotion of PROMO) {
    const move = emptyMove(from, to);
    move.promotion = promotion;
    move.captureAt = captureAt;
    moves.push(move);
  }
}

function pseudoMoves(state) {
  const moves = [];
  const board = state.board;
  const color = state.turn;
  for (let from = 0; from < 64; from += 1) {
    const piece = board[from];
    if (!piece || piece.c !== color) continue;
    if (piece.t === 'p') pawnPseudo(state, from, piece, moves);
    else if (piece.t === 'n') leapPseudo(board, from, piece, KNIGHT, moves);
    else if (piece.t === 'b') slidePseudo(board, from, piece, DIAG, moves);
    else if (piece.t === 'r') slidePseudo(board, from, piece, ORTHO, moves);
    else if (piece.t === 'q') slidePseudo(board, from, piece, KING, moves);
    else kingPseudo(state, from, piece, moves);
  }
  return moves;
}

function leapPseudo(board, from, piece, deltas, moves) {
  const file = fileOf(from);
  const rank = rankOf(from);
  for (const [df, dr] of deltas) {
    const tf = file + df;
    const tr = rank + dr;
    if (!onBoard(tf, tr)) continue;
    const to = idx(tf, tr);
    const occ = board[to];
    if (occ && occ.c === piece.c) continue;
    moves.push(emptyMove(from, to));
  }
}

function slidePseudo(board, from, piece, dirs, moves) {
  const file = fileOf(from);
  const rank = rankOf(from);
  for (const [df, dr] of dirs) {
    let tf = file + df;
    let tr = rank + dr;
    while (onBoard(tf, tr)) {
      const to = idx(tf, tr);
      const occ = board[to];
      if (!occ) moves.push(emptyMove(from, to));
      else {
        if (occ.c !== piece.c) moves.push(emptyMove(from, to));
        break;
      }
      tf += df;
      tr += dr;
    }
  }
}

function pawnPseudo(state, from, piece, moves) {
  const board = state.board;
  const dir = piece.c === 'w' ? 1 : -1;
  const file = fileOf(from);
  const rank = rankOf(from);
  const one = rank + dir;
  if (onBoard(file, one) && !board[idx(file, one)]) {
    pushPromo(moves, from, idx(file, one));
    const start = piece.c === 'w' ? 1 : 6;
    const two = rank + dir * 2;
    if (rank === start && onBoard(file, two) && !board[idx(file, two)]) {
      moves.push(emptyMove(from, idx(file, two)));
    }
  }
  for (const df of [-1, 1]) {
    const tf = file + df;
    const tr = rank + dir;
    if (!onBoard(tf, tr)) continue;
    const to = idx(tf, tr);
    const occ = board[to];
    if (occ && occ.c !== piece.c) pushPromo(moves, from, to);
  }
  if (state.ep != null && rankOf(state.ep) === rank + dir && Math.abs(fileOf(state.ep) - file) === 1) {
    const capSq = state.ep - dir * 8;
    const victim = board[capSq];
    if (victim && victim.t === 'p' && victim.c !== piece.c) {
      const move = emptyMove(from, state.ep);
      move.captureAt = capSq;
      move.kind = 'ep';
      moves.push(move);
    }
  }
}

function kingPseudo(state, from, piece, moves) {
  leapPseudo(state.board, from, piece, KING, moves);
  const enemy = opposite(piece.c);
  if (isAttacked(state, from, enemy)) return;
  const rights = state.castling;
  if (piece.c === 'w' && from === 4) {
    if (rights.includes('K')) tryCastle(state, piece, from, 7, 6, 5, 'K', moves);
    if (rights.includes('Q')) tryCastle(state, piece, from, 0, 2, 3, 'Q', moves);
  } else if (piece.c === 'b' && from === 60) {
    if (rights.includes('k')) tryCastle(state, piece, from, 63, 62, 61, 'K', moves);
    if (rights.includes('q')) tryCastle(state, piece, from, 56, 58, 59, 'Q', moves);
  }
}

function tryCastle(state, piece, kingFrom, rookFrom, kingTo, pass, side, moves) {
  const board = state.board;
  const rook = board[rookFrom];
  if (!rook || rook.t !== 'r' || rook.c !== piece.c) return;
  const min = Math.min(kingFrom, rookFrom);
  const max = Math.max(kingFrom, rookFrom);
  for (let sq = min + 1; sq < max; sq += 1) {
    if (board[sq]) return;
  }
  const enemy = opposite(piece.c);
  if (isAttacked(state, pass, enemy) || isAttacked(state, kingTo, enemy)) return;
  const move = emptyMove(kingFrom, kingTo);
  move.castle = side;
  move.kind = 'castle';
  move.rookFrom = rookFrom;
  move.rookTo = side === 'K' ? kingTo - 1 : kingTo + 1;
  moves.push(move);
}

export function legalMoves(state) {
  const moves = [];
  for (const move of pseudoMoves(state)) {
    const next = applyMove(state, move);
    if (!inCheck(next, state.turn)) moves.push(move);
  }
  return moves;
}

export function sqOf(value) {
  if (typeof value === 'number' && value >= 0 && value < 64) return value;
  if (typeof value === 'string') return parseAlg(value);
  return null;
}

export function resolveMove(legal, input) {
  if (!input) return null;
  const from = sqOf(input.from);
  const to = sqOf(input.to);
  if (from == null || to == null) return null;
  let cands = legal.filter((move) => move.from === from && move.to === to);
  if (input.via != null && input.via !== '') {
    const via = sqOf(input.via);
    cands = cands.filter((move) => move.via == null || move.via === via);
  }
  if (input.kind) cands = cands.filter((move) => move.kind === input.kind);
  const promo = input.promotion ? String(input.promotion).toLowerCase() : null;
  if (promo) cands = cands.filter((move) => move.promotion === promo);
  else {
    const quiet = cands.filter((move) => !move.promotion);
    if (quiet.length) cands = quiet;
    else if (cands.some((move) => move.promotion)) {
      return cands.find((move) => move.promotion === 'q') || null;
    }
  }
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) {
    return cands.find((move) => move.captureAt != null || move.kind === 'ep') || cands[0];
  }
  return null;
}

function bareSAN(state, move, legal) {
  if (move.castle === 'K') return 'O-O';
  if (move.castle === 'Q') return 'O-O-O';
  const piece = state.board[move.from];
  const capture = move.captureAt != null || Boolean(state.board[move.to] && state.board[move.to].c !== piece.c);
  if (piece.t === 'p') {
    let text = '';
    if (capture) text += 'abcdefgh'[fileOf(move.from)] + 'x';
    text += alg(move.to);
    if (move.promotion) text += `=${move.promotion.toUpperCase()}`;
    return text;
  }
  const rivals = legal.filter((other) => (
    other !== move
    && other.to === move.to
    && !other.promotion === !move.promotion
    && other.promotion === move.promotion
    && state.board[other.from]
    && state.board[other.from].t === piece.t
    && state.board[other.from].c === piece.c
  ));
  let disambiguation = '';
  if (rivals.length) {
    const fileClash = rivals.some((other) => fileOf(other.from) === fileOf(move.from));
    const rankClash = rivals.some((other) => rankOf(other.from) === rankOf(move.from));
    if (!fileClash) disambiguation = 'abcdefgh'[fileOf(move.from)];
    else if (!rankClash) disambiguation = String(rankOf(move.from) + 1);
    else disambiguation = alg(move.from);
  }
  return piece.t.toUpperCase() + disambiguation + (capture ? 'x' : '') + alg(move.to);
}

export function formatSAN(state, move, legal = null, suffix = true) {
  const list = legal || legalMoves(state);
  const body = bareSAN(state, move, list);
  if (!suffix) return body;
  const next = applyMove(state, move);
  const mate = legalMoves(next).length === 0 && inCheck(next, next.turn);
  if (mate) return `${body}#`;
  if (inCheck(next, next.turn)) return `${body}+`;
  return body;
}

export function playMove(state, input) {
  const legal = legalMoves(state);
  const move = resolveMove(legal, input);
  if (!move) {
    const error = new Error('Jugada ilegal');
    error.code = 'ILLEGAL';
    throw error;
  }
  const san = formatSAN(state, move, legal);
  const next = applyMove(state, move);
  next.moves = state.moves.concat([{
    san,
    from: move.from,
    to: move.to,
    color: state.turn,
    promotion: move.promotion,
    kind: move.kind,
  }]);
  return next;
}

export function material(state) {
  let white = 0;
  let black = 0;
  for (const piece of state.board) {
    if (!piece || piece.t === 'k') continue;
    const value = PIECE_VALUES[piece.t];
    if (piece.c === 'w') white += value;
    else black += value;
  }
  return { white, black, advantage: white - black };
}

export function insufficientMaterial(state) {
  const minors = { w: [], b: [] };
  for (let square = 0; square < 64; square += 1) {
    const piece = state.board[square];
    if (!piece || piece.t === 'k') continue;
    if (piece.t === 'p' || piece.t === 'r' || piece.t === 'q') return false;
    minors[piece.c].push({ type: piece.t, color: (fileOf(square) + rankOf(square)) & 1 });
  }
  const all = minors.w.length + minors.b.length;
  if (all === 0) return true;
  if (all === 1) return true;
  if (minors.w.length === 1 && minors.b.length === 1 && minors.w[0].type === 'b' && minors.b[0].type === 'b') {
    return minors.w[0].color === minors.b[0].color;
  }
  return false;
}

export function gameStatus(state) {
  const moves = legalMoves(state);
  const check = inCheck(state, state.turn);
  if (moves.length === 0 && check) {
    return { over: true, result: opposite(state.turn), reason: 'checkmate', moves, check: true };
  }
  if (moves.length === 0) {
    return { over: true, result: 'draw', reason: 'stalemate', moves, check: false };
  }
  if (state.halfmove >= 100) {
    return { over: true, result: 'draw', reason: 'fifty', moves, check };
  }
  const key = positionKey(state);
  if ((state.posCounts[key] || 0) >= 3) {
    return { over: true, result: 'draw', reason: 'repetition', moves, check };
  }
  if (insufficientMaterial(state)) {
    return { over: true, result: 'draw', reason: 'material', moves, check };
  }
  return { over: false, result: null, reason: check ? 'check' : 'playing', moves, check };
}

export function createGame(fen = START_FEN) {
  return parseFEN(fen);
}

export function perft(state, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const move of moves) total += perft(applyMove(state, move), depth - 1);
  return total;
}
