/**
 * Capa didáctica sobre el motor clásico.
 * Veterania, terreno, minas y energía viven aquí. El modo clásico no importa este archivo.
 */

import {
  START_FEN,
  alg,
  applyMove,
  fileOf,
  findKing,
  formatSAN,
  idx,
  insufficientMaterial,
  onBoard,
  opposite,
  parseFEN,
  rankOf,
  resolveMove,
  sqOf,
  stripCastling,
  toFEN,
} from '../core/chessEngine.js';

export const ELEVATED_SQUARES = ['d4', 'e5'];
const ELEVATED = new Set(ELEVATED_SQUARES.map((square) => sqOf(square)));
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const ABILITIES = [
  { type: 'freeze', cost: 3, name: 'Congelar', text: 'Inmoviliza una pieza enemiga, salvo el rey, durante su próximo turno.' },
  { type: 'swap', cost: 4, name: 'Intercambio táctico', text: 'Cambia de sitio dos piezas tuyas. Ninguna puede ser el rey.' },
  { type: 'emergencyCastle', cost: 5, name: 'Enroque de emergencia', text: 'Intercambia el rey con una torre tuya si no estás en jaque.' },
  { type: 'reinforce', cost: 6, name: 'Refuerzo', text: 'Devuelve un peón capturado a su casilla inicial, si está libre.' },
];

const COST = Object.fromEntries(ABILITIES.map((ability) => [ability.type, ability.cost]));

function blank(from, to) {
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

function chebyshev(a, b) {
  return Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
}

function canCapture(ds, attacker, from, victim, victimSq) {
  if (!victim || victim.c === attacker.c) return false;
  if (victim.t === 'r' && ds.veteran[victim.id] && attacker.t === 'p') return false;
  if (ELEVATED.has(victimSq)) {
    if (attacker.t === 'n') return true;
    if (chebyshev(from, victimSq) <= 1) return true;
    if (attacker.t === 'b' || attacker.t === 'r' || attacker.t === 'q') return false;
  }
  return true;
}

function extraKey(ds) {
  const freeze = Object.entries(ds.frozen).sort().map(([id, turns]) => `${id}:${turns}`).join(',');
  const veterans = Object.keys(ds.veteran).filter((id) => ds.veteran[id]).sort().join(',');
  const mystic = Object.keys(ds.mysticUsed).filter((id) => ds.mysticUsed[id]).sort().join(',');
  const mines = ['w', 'b'].map((color) => (ds.mines[color]?.live ? alg(ds.mines[color].sq) : '-')).join('');
  return `${ds.core.board.map((piece) => (piece ? piece.id : '.')).join('')}|${ds.core.turn}|${ds.core.castling}|${ds.core.ep ?? '-'}|${freeze}|${veterans}|${mystic}|${mines}`;
}

function pack(ds) {
  return {
    core: ds.core,
    energy: ds.energy,
    kills: ds.kills,
    veteran: ds.veteran,
    mysticUsed: ds.mysticUsed,
    frozen: ds.frozen,
    mines: ds.mines,
    phase: ds.phase,
    mineTurn: ds.mineTurn,
    graveyard: ds.graveyard,
    pawnHomes: ds.pawnHomes,
    abilityUsed: ds.abilityUsed,
    turnAbility: ds.turnAbility,
    keyCounts: ds.keyCounts,
    log: ds.log,
    over: ds.over,
    result: ds.result,
    reason: ds.reason,
    check: ds.check,
  };
}

export function createDidactic(fen = START_FEN) {
  const core = parseFEN(fen);
  const pawnHomes = {};
  for (let square = 0; square < 64; square += 1) {
    const piece = core.board[square];
    if (piece && piece.t === 'p') pawnHomes[piece.id] = square;
  }
  return {
    core,
    energy: { w: 0, b: 0 },
    kills: {},
    veteran: {},
    mysticUsed: {},
    frozen: {},
    mines: { w: null, b: null },
    phase: 'mines',
    mineTurn: 'w',
    graveyard: [],
    pawnHomes,
    abilityUsed: false,
    beforeAbility: null,
    turnAbility: null,
    past: [],
    future: [],
    keyCounts: {},
    log: [],
    over: false,
    result: null,
    reason: 'mines',
    check: false,
    lastEvents: [],
  };
}

function grant(ds) {
  const color = ds.core.turn;
  return {
    ...ds,
    energy: { ...ds.energy, [color]: (ds.energy[color] || 0) + 1 },
  };
}

export function suggestedMine(color) {
  return color === 'w' ? 'd4' : 'e5';
}

export function placeMine(ds, square) {
  if (ds.phase !== 'mines') throw new Error('Las minas ya están colocadas');
  const sq = sqOf(square);
  if (sq == null) throw new Error('Casilla inválida');
  const color = ds.mineTurn;
  const rank = rankOf(sq);
  if (color === 'w' && rank > 3) throw new Error('Las blancas colocan la mina en las filas 1 a 4');
  if (color === 'b' && rank < 4) throw new Error('Las negras colocan la mina en las filas 5 a 8');
  const mines = {
    w: ds.mines.w ? { ...ds.mines.w } : null,
    b: ds.mines.b ? { ...ds.mines.b } : null,
  };
  mines[color] = { sq, live: true };
  if (color === 'w') return { ...ds, mines, mineTurn: 'b', lastEvents: [] };
  let next = grant({ ...ds, mines, mineTurn: null, phase: 'play', lastEvents: [] });
  next.keyCounts = { [extraKey(next)]: 1 };
  next.check = inCheck(next, next.core.turn);
  next.reason = next.check ? 'check' : 'playing';
  next.over = false;
  next.result = null;
  return next;
}

export function inCheck(ds, color) {
  const kingSq = findKing(ds.core, color);
  if (kingSq < 0) return true;
  return squareAttacked(ds, kingSq, opposite(color), ds.core.board[kingSq]);
}

export function kingInCheck(ds, color = ds.core.turn) {
  return inCheck(ds, color);
}

function squareAttacked(ds, target, byColor, victim) {
  const board = ds.core.board;
  const tf = fileOf(target);
  const tr = rankOf(target);
  const pawnRank = byColor === 'w' ? tr - 1 : tr + 1;
  for (const df of [-1, 1]) {
    if (!onBoard(tf + df, pawnRank)) continue;
    const from = idx(tf + df, pawnRank);
    const piece = board[from];
    if (piece && piece.c === byColor && piece.t === 'p' && (!victim || canCapture(ds, piece, from, victim, target))) {
      return true;
    }
  }
  for (const [df, dr] of KNIGHT) {
    if (!onBoard(tf + df, tr + dr)) continue;
    const from = idx(tf + df, tr + dr);
    const piece = board[from];
    if (piece && piece.c === byColor && piece.t === 'n' && (!victim || canCapture(ds, piece, from, victim, target))) {
      return true;
    }
  }
  for (const [df, dr] of KING) {
    if (!onBoard(tf + df, tr + dr)) continue;
    const from = idx(tf + df, tr + dr);
    const piece = board[from];
    if (piece && piece.c === byColor && piece.t === 'k' && (!victim || canCapture(ds, piece, from, victim, target))) {
      return true;
    }
  }
  if (rayAttack(ds, target, byColor, ORTHO, 'r', victim)) return true;
  if (rayAttack(ds, target, byColor, DIAG, 'b', victim)) return true;
  return false;
}

function rayAttack(ds, target, byColor, dirs, slider, victim) {
  const board = ds.core.board;
  const tf = fileOf(target);
  const tr = rankOf(target);
  for (const [df, dr] of dirs) {
    let file = tf + df;
    let rank = tr + dr;
    while (onBoard(file, rank)) {
      const from = idx(file, rank);
      const piece = board[from];
      if (piece) {
        if (piece.c === byColor && (piece.t === slider || piece.t === 'q')) {
          return !victim || canCapture(ds, piece, from, victim, target);
        }
        break;
      }
      file += df;
      rank += dr;
    }
  }
  return false;
}

function friendDefends(ds, square, perspective, occupant) {
  const fake = { t: occupant.t, c: opposite(perspective), id: occupant.id };
  return squareAttacked(ds, square, perspective, fake);
}

export function heatMap(ds, perspective) {
  const cells = Array(64).fill(null);
  const hanging = [];
  const enemy = opposite(perspective);
  for (let square = 0; square < 64; square += 1) {
    const occupant = ds.core.board[square];
    const attacked = occupant
      ? squareAttacked(ds, square, enemy, occupant)
      : squareAttacked(ds, square, enemy, null);
    const defended = occupant
      ? friendDefends(ds, square, perspective, occupant)
      : squareAttacked(ds, square, perspective, null);
    if (defended && attacked) cells[square] = 'contested';
    else if (defended) cells[square] = 'defended';
    else if (attacked) cells[square] = 'attacked';
    if (occupant && occupant.c === perspective && attacked && !defended) hanging.push(square);
  }
  return { cells, hanging };
}

function addPawn(moves, from, to, captureAt = null) {
  const lastRank = rankOf(to) === 0 || rankOf(to) === 7;
  if (!lastRank) {
    const move = blank(from, to);
    if (captureAt != null) {
      move.captureAt = captureAt;
      move.kind = 'ep';
    }
    moves.push(move);
    return;
  }
  for (const promotion of ['q', 'r', 'b', 'n']) {
    const move = blank(from, to);
    move.promotion = promotion;
    if (captureAt != null) move.captureAt = captureAt;
    moves.push(move);
  }
}

function slide(ds, from, piece, dirs, moves) {
  const board = ds.core.board;
  for (const [df, dr] of dirs) {
    let file = fileOf(from) + df;
    let rank = rankOf(from) + dr;
    while (onBoard(file, rank)) {
      const to = idx(file, rank);
      const occupant = board[to];
      if (!occupant) moves.push(blank(from, to));
      else {
        if (canCapture(ds, piece, from, occupant, to)) moves.push(blank(from, to));
        break;
      }
      file += df;
      rank += dr;
    }
  }
}

function generate(ds) {
  const moves = [];
  const board = ds.core.board;
  const color = ds.core.turn;
  for (let from = 0; from < 64; from += 1) {
    const piece = board[from];
    if (!piece || piece.c !== color) continue;
    if ((ds.frozen[piece.id] || 0) > 0) continue;
    if (piece.t === 'p') pawnMoves(ds, from, piece, moves);
    else if (piece.t === 'n') knightMoves(ds, from, piece, moves);
    else if (piece.t === 'b') bishopMoves(ds, from, piece, moves);
    else if (piece.t === 'r') slide(ds, from, piece, ORTHO, moves);
    else if (piece.t === 'q') slide(ds, from, piece, KING, moves);
    else kingMoves(ds, from, piece, moves);
  }
  return moves;
}

function pawnMoves(ds, from, piece, moves) {
  const board = ds.core.board;
  const dir = piece.c === 'w' ? 1 : -1;
  const file = fileOf(from);
  const rank = rankOf(from);
  const one = rank + dir;
  if (onBoard(file, one) && !board[idx(file, one)]) {
    addPawn(moves, from, idx(file, one));
    const two = rank + dir * 2;
    const start = piece.c === 'w' ? 1 : 6;
    if (rank === start && onBoard(file, two) && !board[idx(file, two)]) moves.push(blank(from, idx(file, two)));
  }
  for (const df of [-1, 1]) {
    const tf = file + df;
    const tr = rank + dir;
    if (!onBoard(tf, tr)) continue;
    const to = idx(tf, tr);
    const occupant = board[to];
    if (occupant && canCapture(ds, piece, from, occupant, to)) addPawn(moves, from, to);
  }
  const ep = ds.core.ep;
  if (ep != null && rankOf(ep) === rank + dir && Math.abs(fileOf(ep) - file) === 1) {
    const capSq = ep - dir * 8;
    const victim = board[capSq];
    if (victim && canCapture(ds, piece, from, victim, capSq)) addPawn(moves, from, ep, capSq);
  }
}

function knightMoves(ds, from, piece, moves) {
  const board = ds.core.board;
  const landings = [];
  for (const [df, dr] of KNIGHT) {
    const file = fileOf(from) + df;
    const rank = rankOf(from) + dr;
    if (!onBoard(file, rank)) continue;
    const to = idx(file, rank);
    const occupant = board[to];
    if (occupant && !canCapture(ds, piece, from, occupant, to)) continue;
    moves.push(blank(from, to));
    landings.push(to);
  }
  if (!ds.veteran[piece.id]) return;
  for (const via of landings) {
    for (const [df, dr] of ORTHO) {
      const file = fileOf(via) + df;
      const rank = rankOf(via) + dr;
      if (!onBoard(file, rank)) continue;
      const to = idx(file, rank);
      if (board[to]) continue;
      const move = blank(from, to);
      move.kind = 'veteran';
      move.via = via;
      if (board[via]) move.captureAt = via;
      moves.push(move);
    }
  }
}

function bishopMoves(ds, from, piece, moves) {
  slide(ds, from, piece, DIAG, moves);
  if (!ds.veteran[piece.id] || ds.mysticUsed[piece.id]) return;
  for (const [df, dr] of ORTHO) {
    const file = fileOf(from) + df;
    const rank = rankOf(from) + dr;
    if (!onBoard(file, rank)) continue;
    const to = idx(file, rank);
    const occupant = ds.core.board[to];
    if (occupant && !canCapture(ds, piece, from, occupant, to)) continue;
    const move = blank(from, to);
    move.kind = 'mystic';
    moves.push(move);
  }
}

function kingMoves(ds, from, piece, moves) {
  const board = ds.core.board;
  for (const [df, dr] of KING) {
    const file = fileOf(from) + df;
    const rank = rankOf(from) + dr;
    if (!onBoard(file, rank)) continue;
    const to = idx(file, rank);
    const occupant = board[to];
    if (occupant && !canCapture(ds, piece, from, occupant, to)) continue;
    moves.push(blank(from, to));
  }
  if (inCheck(ds, piece.c)) return;
  const rights = ds.core.castling;
  if (piece.c === 'w' && from === 4) {
    if (rights.includes('K')) tryCastle(ds, piece, from, 7, 6, 5, 'K', moves);
    if (rights.includes('Q')) tryCastle(ds, piece, from, 0, 2, 3, 'Q', moves);
  } else if (piece.c === 'b' && from === 60) {
    if (rights.includes('k')) tryCastle(ds, piece, from, 63, 62, 61, 'K', moves);
    if (rights.includes('q')) tryCastle(ds, piece, from, 56, 58, 59, 'Q', moves);
  }
}

function tryCastle(ds, piece, kingFrom, rookFrom, kingTo, pass, side, moves) {
  const board = ds.core.board;
  const rook = board[rookFrom];
  if (!rook || rook.t !== 'r' || rook.c !== piece.c) return;
  const min = Math.min(kingFrom, rookFrom);
  const max = Math.max(kingFrom, rookFrom);
  for (let square = min + 1; square < max; square += 1) if (board[square]) return;
  const enemy = opposite(piece.c);
  const phantom = { t: 'k', c: piece.c, id: piece.id };
  if (squareAttacked(ds, pass, enemy, phantom) || squareAttacked(ds, kingTo, enemy, phantom)) return;
  const move = blank(kingFrom, kingTo);
  move.castle = side;
  move.kind = 'castle';
  move.rookFrom = rookFrom;
  move.rookTo = side === 'K' ? kingTo - 1 : kingTo + 1;
  moves.push(move);
}

export function legalMoves(ds) {
  if (ds.phase !== 'play' || ds.over) return [];
  const color = ds.core.turn;
  const moves = [];
  for (const move of generate(ds)) {
    const next = applyMove(ds.core, move);
    if (!inCheck({ ...ds, core: next }, color)) moves.push(move);
  }
  return moves;
}

function capturedOf(core, move) {
  if (move.captureAt != null) return core.board[move.captureAt];
  const occupant = core.board[move.to];
  if (occupant && occupant.c !== core.board[move.from].c) return occupant;
  return null;
}

function moveBody(ds, move, legal) {
  if (move.kind === 'veteran') {
    return `N${move.captureAt != null ? 'x' : ''}${alg(move.via)}~${alg(move.to)}`;
  }
  if (move.kind === 'mystic') {
    const occupant = ds.core.board[move.to];
    const capture = occupant && occupant.c !== ds.core.board[move.from].c;
    return `B${alg(move.from)}${capture ? 'x' : '~'}${alg(move.to)}`;
  }
  return formatSAN(ds.core, move, legal, false);
}

export function abilityLabel(ability) {
  if (!ability) return '';
  if (ability.type === 'freeze') return `❄ ${ability.target}`;
  if (ability.type === 'swap') return `⇄ ${ability.a}↔${ability.b}`;
  if (ability.type === 'emergencyCastle') return `⚑ ${ability.rook}`;
  if (ability.type === 'reinforce') return `✚ ${ability.square}`;
  return '';
}

function finish(ds, move, legal) {
  const color = ds.core.turn;
  const captured = capturedOf(ds.core, move);
  const core = applyMove(ds.core, move);
  const mover = core.board[move.to];
  const kills = { ...ds.kills };
  const veteran = { ...ds.veteran };
  let veteranBorn = false;
  if (captured) kills[mover.id] = (kills[mover.id] || 0) + 1;
  if ((kills[mover.id] || 0) >= 2 && 'nbr'.includes(mover.t) && !veteran[mover.id]) {
    veteran[mover.id] = true;
    veteranBorn = true;
  }
  const mysticUsed = { ...ds.mysticUsed };
  if (move.kind === 'mystic') mysticUsed[mover.id] = true;
  let graveyard = ds.graveyard;
  if (captured?.t === 'p') {
    graveyard = graveyard.concat([{ id: captured.id, color: captured.c, home: ds.pawnHomes[captured.id] }]);
  }
  const energy = { ...ds.energy };
  if (captured) energy[color] += 2;
  const frozen = { ...ds.frozen };
  if (captured) delete frozen[captured.id];
  const alive = new Set();
  for (const piece of core.board) if (piece && piece.c === color) alive.add(piece.id);
  for (const id of Object.keys(frozen)) {
    if (!id.startsWith(color)) continue;
    if (!alive.has(id)) {
      delete frozen[id];
      continue;
    }
    frozen[id] -= 1;
    if (frozen[id] <= 0) delete frozen[id];
  }
  const mines = {
    w: ds.mines.w ? { ...ds.mines.w } : null,
    b: ds.mines.b ? { ...ds.mines.b } : null,
  };
  let mined = false;
  const enemyMine = mines[opposite(color)];
  const stepped = move.via == null ? [move.to] : [move.to, move.via];
  if (enemyMine?.live && stepped.includes(enemyMine.sq)) {
    frozen[mover.id] = (frozen[mover.id] || 0) + 1;
    mines[opposite(color)] = { ...enemyMine, live: false };
    mined = true;
  }
  let next = grant({
    ...ds,
    core,
    kills,
    veteran,
    mysticUsed,
    graveyard,
    energy,
    frozen,
    mines,
    abilityUsed: false,
    beforeAbility: null,
    turnAbility: null,
  });
  const key = extraKey(next);
  next.keyCounts = { ...ds.keyCounts, [key]: (ds.keyCounts[key] || 0) + 1 };
  const report = status(next);
  next = {
    ...next,
    over: report.over,
    result: report.result,
    reason: report.reason,
    check: report.check,
  };
  const events = [];
  if (captured) events.push('capture');
  if (veteranBorn) events.push('veteran');
  if (mined) events.push('mine');
  if (report.reason === 'checkmate') events.push('mate');
  else if (report.check) events.push('check');
  const mark = report.reason === 'checkmate' ? '#' : report.check ? '+' : '';
  const prefix = ds.turnAbility ? `${abilityLabel(ds.turnAbility)} · ` : '';
  next.lastEvents = events;
  next.log = ds.log.concat([{
    san: prefix + moveBody(ds, move, legal) + mark,
    color,
    from: move.from,
    to: move.to,
  }]);
  next.past = ds.past.concat([ds.beforeAbility || pack(ds)]);
  next.future = [];
  return next;
}

export function playMove(ds, input) {
  if (ds.phase !== 'play') throw new Error('Primero coloca las minas');
  if (ds.over) throw new Error('La partida ya terminó');
  const legal = legalMoves(ds);
  const move = resolveMove(legal, input);
  if (!move) {
    const error = new Error('Jugada ilegal');
    error.code = 'ILLEGAL';
    throw error;
  }
  return finish(ds, move, legal);
}

export function undo(ds) {
  if (ds.beforeAbility) {
    return { ...ds.beforeAbility, past: ds.past, future: ds.future, lastEvents: [], beforeAbility: null };
  }
  if (!ds.past.length) return ds;
  const prev = ds.past[ds.past.length - 1];
  return {
    ...prev,
    past: ds.past.slice(0, -1),
    future: ds.future.concat([pack(ds)]),
    lastEvents: [],
    beforeAbility: null,
  };
}

export function redo(ds) {
  if (ds.beforeAbility || !ds.future.length) return ds;
  const next = ds.future[ds.future.length - 1];
  return {
    ...next,
    future: ds.future.slice(0, -1),
    past: ds.past.concat([pack(ds)]),
    lastEvents: [],
    beforeAbility: null,
  };
}

export function canUndo(ds) {
  return Boolean(ds.beforeAbility) || ds.past.length > 0;
}

export function canRedo(ds) {
  return !ds.beforeAbility && ds.future.length > 0;
}

function reinforceHomes(ds, color) {
  const homes = [];
  for (const grave of ds.graveyard) {
    if (grave.color !== color || grave.home == null) continue;
    if (ds.core.board[grave.home]) continue;
    homes.push(grave.home);
  }
  return homes;
}

function spend(ds, cost, patch) {
  const color = ds.core.turn;
  return {
    ...ds,
    ...patch,
    energy: { ...ds.energy, [color]: ds.energy[color] - cost },
    abilityUsed: true,
    beforeAbility: ds.beforeAbility || pack(ds),
    future: [],
    lastEvents: [],
  };
}

export function tryAbility(ds, ability) {
  if (!ability?.type) return { ok: false, error: 'Habilidad vacía' };
  if (ds.phase !== 'play' || ds.over) return { ok: false, error: 'Ahora no puedes usar habilidades' };
  if (ds.abilityUsed) return { ok: false, error: 'Ya usaste una habilidad este turno' };
  const cost = COST[ability.type];
  if (!cost) return { ok: false, error: 'Habilidad desconocida' };
  const color = ds.core.turn;
  if ((ds.energy[color] || 0) < cost) return { ok: false, error: 'Energía insuficiente' };
  if (ability.type === 'freeze') return freeze(ds, ability, cost, color);
  if (ability.type === 'swap') return swap(ds, ability, cost, color);
  if (ability.type === 'emergencyCastle') return emergency(ds, ability, cost, color);
  if (ability.type === 'reinforce') return reinforce(ds, ability, cost, color);
  return { ok: false, error: 'Habilidad desconocida' };
}

function freeze(ds, ability, cost, color) {
  const square = sqOf(ability.target);
  const piece = square == null ? null : ds.core.board[square];
  if (!piece || piece.c === color || piece.t === 'k') {
    return { ok: false, error: 'Elige una pieza enemiga que no sea el rey' };
  }
  if ((ds.frozen[piece.id] || 0) > 0) return { ok: false, error: 'Esa pieza ya está congelada' };
  return {
    ok: true,
    state: spend(ds, cost, {
      frozen: { ...ds.frozen, [piece.id]: 1 },
      turnAbility: { type: 'freeze', target: alg(square) },
    }),
  };
}

function swap(ds, ability, cost, color) {
  const a = sqOf(ability.a);
  const b = sqOf(ability.b);
  if (a == null || b == null || a === b) return { ok: false, error: 'Elige dos piezas distintas' };
  const first = ds.core.board[a];
  const second = ds.core.board[b];
  if (!first || !second || first.c !== color || second.c !== color) return { ok: false, error: 'Solo piezas tuyas' };
  if (first.t === 'k' || second.t === 'k') return { ok: false, error: 'El rey no entra en el intercambio' };
  const board = ds.core.board.slice();
  board[a] = second;
  board[b] = first;
  let castling = stripCastling(ds.core.castling, first, a);
  castling = stripCastling(castling, second, b);
  const core = { ...ds.core, board, castling, ep: null };
  if (inCheck({ ...ds, core }, color)) return { ok: false, error: 'Ese intercambio deja al rey en jaque' };
  return {
    ok: true,
    state: spend(ds, cost, {
      core,
      turnAbility: { type: 'swap', a: alg(a), b: alg(b) },
    }),
  };
}

function emergency(ds, ability, cost, color) {
  if (inCheck(ds, color)) return { ok: false, error: 'No puedes usarlo estando en jaque' };
  const rookSq = sqOf(ability.rook);
  const rook = rookSq == null ? null : ds.core.board[rookSq];
  const kingSq = findKing(ds.core, color);
  if (!rook || rook.c !== color || rook.t !== 'r' || rookSq === kingSq) {
    return { ok: false, error: 'Elige una torre tuya' };
  }
  const board = ds.core.board.slice();
  const king = board[kingSq];
  board[rookSq] = king;
  board[kingSq] = rook;
  let castling = stripCastling(ds.core.castling, king, kingSq);
  castling = stripCastling(castling, rook, rookSq);
  const core = { ...ds.core, board, castling, ep: null };
  if (inCheck({ ...ds, core }, color)) return { ok: false, error: 'El rey quedaría en jaque' };
  return {
    ok: true,
    state: spend(ds, cost, {
      core,
      turnAbility: { type: 'emergencyCastle', rook: alg(rookSq) },
    }),
  };
}

function reinforce(ds, ability, cost, color) {
  const square = sqOf(ability.square);
  const index = ds.graveyard.findIndex((grave) => grave.color === color && grave.home === square && !ds.core.board[grave.home]);
  if (square == null || index < 0) return { ok: false, error: 'Esa casilla no puede recibir el peón' };
  const grave = ds.graveyard[index];
  const board = ds.core.board.slice();
  board[square] = { t: 'p', c: color, id: grave.id };
  const graveyard = ds.graveyard.slice();
  graveyard.splice(index, 1);
  const taken = { w: ds.core.taken.w.slice(), b: ds.core.taken.b.slice() };
  const thief = color === 'w' ? 'b' : 'w';
  const pawnIndex = taken[thief].indexOf('p');
  if (pawnIndex >= 0) taken[thief].splice(pawnIndex, 1);
  const core = { ...ds.core, board, ep: null, taken };
  if (inCheck({ ...ds, core }, color)) return { ok: false, error: 'Ese peón no cubre el jaque' };
  return {
    ok: true,
    state: spend(ds, cost, {
      core,
      graveyard,
      turnAbility: { type: 'reinforce', square: alg(square) },
    }),
  };
}

export function useAbility(ds, ability) {
  const result = tryAbility(ds, ability);
  if (!result.ok) {
    const error = new Error(result.error);
    error.code = 'ABILITY';
    throw error;
  }
  return result.state;
}

export function abilityTargets(ds, type) {
  if (ds.abilityUsed || ds.over || ds.phase !== 'play') return [];
  const color = ds.core.turn;
  const energy = ds.energy[color] || 0;
  if (type === 'freeze' && energy >= 3) {
    const targets = [];
    for (let square = 0; square < 64; square += 1) {
      const piece = ds.core.board[square];
      if (piece && piece.c !== color && piece.t !== 'k' && !(ds.frozen[piece.id] > 0)) targets.push(square);
    }
    return targets;
  }
  if (type === 'swap' && energy >= 4) {
    const targets = [];
    for (let square = 0; square < 64; square += 1) {
      const piece = ds.core.board[square];
      if (piece && piece.c === color && piece.t !== 'k') targets.push(square);
    }
    return targets;
  }
  if (type === 'emergencyCastle' && energy >= 5 && !inCheck(ds, color)) {
    const targets = [];
    for (let square = 0; square < 64; square += 1) {
      const piece = ds.core.board[square];
      if (piece && piece.c === color && piece.t === 'r' && tryAbility(ds, { type: 'emergencyCastle', rook: alg(square) }).ok) {
        targets.push(square);
      }
    }
    return targets;
  }
  if (type === 'reinforce' && energy >= 6) {
    return reinforceHomes(ds, color).filter((square) => tryAbility(ds, { type: 'reinforce', square: alg(square) }).ok);
  }
  return [];
}

function pieceAttacks(ds, from, target) {
  const piece = ds.core.board[from];
  const victim = ds.core.board[target];
  if (!piece || from === target) return false;
  if (victim && !canCapture(ds, piece, from, victim, target)) return false;
  const df = fileOf(target) - fileOf(from);
  const dr = rankOf(target) - rankOf(from);
  const adf = Math.abs(df);
  const adr = Math.abs(dr);
  if (piece.t === 'p') {
    const dir = piece.c === 'w' ? 1 : -1;
    return dr === dir && adf === 1;
  }
  if (piece.t === 'n') return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
  if (piece.t === 'k') return Math.max(adf, adr) === 1;
  if (
    piece.t === 'b'
    && ds.veteran[piece.id]
    && !ds.mysticUsed[piece.id]
    && Math.max(adf, adr) === 1
    && (df === 0 || dr === 0)
  ) return true;
  const diagonal = adf === adr && adf > 0;
  const straight = (adf === 0) !== (adr === 0);
  const ok = (piece.t === 'b' && diagonal)
    || (piece.t === 'r' && straight)
    || (piece.t === 'q' && (diagonal || straight));
  if (!ok) return false;
  const stepF = Math.sign(df);
  const stepR = Math.sign(dr);
  let file = fileOf(from) + stepF;
  let rank = rankOf(from) + stepR;
  while (file !== fileOf(target) || rank !== rankOf(target)) {
    if (ds.core.board[idx(file, rank)]) return false;
    file += stepF;
    rank += stepR;
  }
  return true;
}

function kingDanger(ds, color) {
  const king = findKing(ds.core, color);
  if (king < 0) return 0;
  let count = 0;
  const enemy = opposite(color);
  for (let square = 0; square < 64; square += 1) {
    const piece = ds.core.board[square];
    if (piece && piece.c === enemy && pieceAttacks(ds, square, king)) count += 1;
  }
  return count;
}

function bestFreeze(ds, color) {
  const enemy = opposite(color);
  let best = null;
  let score = 0;
  for (let from = 0; from < 64; from += 1) {
    const piece = ds.core.board[from];
    if (!piece || piece.c !== enemy || piece.t === 'k' || ds.frozen[piece.id]) continue;
    let threat = 0;
    for (let target = 0; target < 64; target += 1) {
      const own = ds.core.board[target];
      if (!own || own.c !== color || !pieceAttacks(ds, from, target)) continue;
      threat = Math.max(threat, VALUES[own.t] + (own.t === 'k' ? 4 : 0));
    }
    const rank = threat * 10 + VALUES[piece.t];
    if (threat >= 3 && rank > score) {
      score = rank;
      best = from;
    }
  }
  return best;
}

export function suggestAbility(ds) {
  if (ds.phase !== 'play' || ds.over || ds.abilityUsed) return null;
  const color = ds.core.turn;
  if (inCheck(ds, color)) return null;
  const energy = ds.energy[color] || 0;
  if (energy >= 3) {
    const target = bestFreeze(ds, color);
    if (target != null) return { type: 'freeze', target: alg(target) };
  }
  if (energy >= 5 && kingDanger(ds, color) >= 2) {
    const rooks = abilityTargets(ds, 'emergencyCastle');
    if (rooks.length) return { type: 'emergencyCastle', rook: alg(rooks[0]) };
  }
  if (energy >= 6) {
    const homes = abilityTargets(ds, 'reinforce');
    if (homes.length) {
      homes.sort((a, b) => Math.abs(fileOf(a) - 3.5) - Math.abs(fileOf(b) - 3.5));
      return { type: 'reinforce', square: alg(homes[0]) };
    }
  }
  return null;
}

function hasVeteran(ds) {
  return Object.values(ds.veteran).some(Boolean);
}

export function status(ds) {
  if (ds.over) return { over: true, result: ds.result, reason: ds.reason, check: ds.check, moves: [] };
  if (ds.phase !== 'play') return { over: false, result: null, reason: 'mines', check: false, moves: [] };
  const moves = legalMoves(ds);
  const check = inCheck(ds, ds.core.turn);
  if (moves.length === 0 && check) {
    return { over: true, result: opposite(ds.core.turn), reason: 'checkmate', check: true, moves };
  }
  if (moves.length === 0) return { over: true, result: 'draw', reason: 'stalemate', check: false, moves };
  if (ds.core.halfmove >= 100) return { over: true, result: 'draw', reason: 'fifty', check, moves };
  if ((ds.keyCounts[extraKey(ds)] || 0) >= 3) {
    return { over: true, result: 'draw', reason: 'repetition', check, moves };
  }
  if (!hasVeteran(ds) && insufficientMaterial(ds.core)) {
    return { over: true, result: 'draw', reason: 'material', check, moves };
  }
  return { over: false, result: null, reason: check ? 'check' : 'playing', check, moves };
}

export function describeForAI(ds, color) {
  const legal = ds.phase === 'play' && !ds.over ? legalMoves(ds) : [];
  const squares = (pred) => {
    const list = [];
    for (let square = 0; square < 64; square += 1) {
      const piece = ds.core.board[square];
      if (piece && pred(piece, square)) list.push(alg(square));
    }
    return list;
  };
  return {
    fen: toFEN(ds.core),
    turn: ds.core.turn,
    you: color,
    energy: { ...ds.energy },
    elevated: ELEVATED_SQUARES.slice(),
    veterans: squares((piece) => ds.veteran[piece.id]),
    frozen: squares((piece) => (ds.frozen[piece.id] || 0) > 0),
    mysticReady: squares((piece) => piece.t === 'b' && ds.veteran[piece.id] && !ds.mysticUsed[piece.id]),
    ownMine: ds.mines[color]?.live ? alg(ds.mines[color].sq) : null,
    graveyard: ds.graveyard.filter((grave) => grave.color === color).map((grave) => alg(grave.home)),
    abilityUsed: ds.abilityUsed,
    inCheck: ds.phase === 'play' ? inCheck(ds, ds.core.turn) : false,
    legal: legal.map((move) => ({
      from: alg(move.from),
      to: alg(move.to),
      promotion: move.promotion,
      via: move.via == null ? null : alg(move.via),
      kind: move.kind,
    })),
    rules: {
      elevated: 'd4 y e5 no se capturan a distancia con alfil, torre o dama. Sí caballo o cuerpo a cuerpo.',
      veteran: '2 capturas: caballo puede dar un paso ortogonal extra sin capturar; torre inmune a peones; alfil, una vez, un paso ortogonal.',
      energy: '+1 al empezar el turno y +2 al capturar. Máximo una habilidad por turno, antes de la jugada.',
      mines: 'La mina enemiga está oculta. Si la pisas, tu pieza queda congelada un turno.',
    },
  };
}

export function toFen(ds) {
  return toFEN(ds.core);
}
