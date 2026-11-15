/**
 * Rival por API (xAI por defecto) y minimax local si la red falla o la jugada no es legal.
 * La clave se queda en localStorage del navegador.
 */

import {
  applyMove,
  inCheck,
  legalMoves as classicLegal,
  material,
  resolveMove,
  toFEN,
} from '../core/chessEngine.js';
import {
  describeForAI,
  legalMoves as didacticLegal,
  playMove as playDidactic,
  suggestAbility,
  toFen,
  tryAbility,
} from '../modes/didacticMode.js';

const STORAGE_KEY = 'ajedrez.api.v1';

export const DEFAULTS = {
  endpoint: 'https://api.x.ai/v1/chat/completions',
  model: 'grok-3',
  apiKey: '',
};

export const MODELS = ['grok-3', 'grok-3-mini'];

export function loadConfig() {
  const config = { ...DEFAULTS };
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return config;
    const parsed = JSON.parse(raw);
    if (typeof parsed.endpoint === 'string' && parsed.endpoint.trim()) config.endpoint = parsed.endpoint.trim();
    if (typeof parsed.model === 'string' && parsed.model.trim()) config.model = parsed.model.trim();
    if (typeof parsed.apiKey === 'string') config.apiKey = parsed.apiKey.trim();
  } catch {
    return { ...DEFAULTS };
  }
  return config;
}

export function saveConfig(partial) {
  const next = { ...loadConfig(), ...partial };
  if (typeof next.endpoint === 'string') next.endpoint = next.endpoint.trim();
  if (typeof next.model === 'string') next.model = next.model.trim();
  if (typeof next.apiKey === 'string') next.apiKey = next.apiKey.trim();
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

const PIECE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

function mirror(square) {
  return (7 - (square >> 3)) * 8 + (square & 7);
}

function evalBoard(state) {
  let score = 0;
  for (let square = 0; square < 64; square += 1) {
    const piece = state.board[square];
    if (!piece) continue;
    const pst = PST[piece.t][piece.c === 'w' ? square : mirror(square)];
    const value = PIECE[piece.t] + pst;
    score += piece.c === 'w' ? value : -value;
  }
  return score;
}

function terminal(state, moves) {
  if (state.halfmove >= 100) return 0;
  const key = `${state.turn}${state.castling}${state.ep}`;
  if ((state.posCounts?.[key] || 0) >= 3) return 0;
  if (moves.length === 0) return inCheck(state, state.turn) ? -100000 : 0;
  return null;
}

function orderMoves(moves, state) {
  return moves.slice().sort((a, b) => scoreMove(b, state) - scoreMove(a, state));
}

function scoreMove(move, state) {
  const victim = move.captureAt != null ? state.board[move.captureAt] : state.board[move.to];
  let score = victim ? PIECE[victim.t] * 10 - PIECE[state.board[move.from].t] : 0;
  if (move.promotion === 'q') score += 800;
  if (move.castle) score += 40;
  return score;
}

function negamax(state, depth, alpha, beta, budget) {
  if (Date.now() > budget.deadline || budget.nodes > budget.max) {
    budget.stopped = true;
    return evalBoard(state) * (state.turn === 'w' ? 1 : -1);
  }
  const moves = classicLegal(state);
  budget.nodes += 1;
  const end = terminal(state, moves);
  if (end != null) return end;
  if (depth === 0) return quiesce(state, alpha, beta, budget, 2);
  let best = -Infinity;
  for (const move of orderMoves(moves, state)) {
    const score = -negamax(applyMove(state, move), depth - 1, -beta, -alpha, budget);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta || budget.stopped) break;
  }
  return best;
}

function quiesce(state, alpha, beta, budget, depth) {
  const stand = evalBoard(state) * (state.turn === 'w' ? 1 : -1);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth === 0 || budget.stopped) return stand;
  const captures = classicLegal(state).filter((move) => move.captureAt != null || state.board[move.to]);
  for (const move of orderMoves(captures, state)) {
    const score = -quiesce(applyMove(state, move), -beta, -alpha, budget, depth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

export function minimaxClassic(state, options = {}) {
  const moves = orderMoves(classicLegal(state), state);
  if (!moves.length) return null;
  const maxDepth = options.maxDepth ?? 3;
  const deadline = Date.now() + (options.ms ?? 380);
  let chosen = moves[0];
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const budget = { nodes: 0, max: 50000, deadline, stopped: false };
    let best = null;
    let bestScore = -Infinity;
    let alpha = -Infinity;
    let finished = true;
    for (const move of moves) {
      if (Date.now() > deadline) {
        finished = false;
        break;
      }
      const score = -negamax(applyMove(state, move), depth - 1, -Infinity, -alpha, budget);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
      if (score > alpha) alpha = score;
    }
    if (best && (finished || depth === 1)) chosen = best;
    if (!finished || budget.stopped) break;
  }
  return chosen;
}

function evalDidactic(ds) {
  let score = evalBoard(ds.core);
  score += ((ds.energy.w || 0) - (ds.energy.b || 0)) * 8;
  for (const piece of ds.core.board) {
    if (!piece) continue;
    const sign = piece.c === 'w' ? 1 : -1;
    if (ds.veteran[piece.id]) score += 40 * sign;
    if ((ds.frozen[piece.id] || 0) > 0) score -= 35 * sign;
  }
  return ds.core.turn === 'w' ? score : -score;
}

function didacticOrder(moves, ds) {
  return moves.slice().sort((a, b) => {
    const av = a.captureAt != null || ds.core.board[a.to] ? 1 : 0;
    const bv = b.captureAt != null || ds.core.board[b.to] ? 1 : 0;
    return bv - av;
  });
}

function negamaxDidactic(ds, depth, alpha, beta, budget) {
  if (Date.now() > budget.deadline || budget.nodes > budget.max) {
    budget.stopped = true;
    return evalDidactic(ds);
  }
  budget.nodes += 1;
  if (ds.over) {
    if (ds.result === 'draw' || !ds.result) return 0;
    return ds.result === ds.core.turn ? 100000 : -100000;
  }
  if (ds.core.halfmove >= 100) return 0;
  const moves = didacticLegal(ds);
  if (!moves.length) return ds.check ? -100000 : 0;
  if (depth === 0) return evalDidactic(ds);
  let best = -Infinity;
  for (const move of didacticOrder(moves, ds)) {
    let next;
    try {
      next = playDidactic(ds, move);
    } catch {
      continue;
    }
    const score = -negamaxDidactic(next, depth - 1, -beta, -alpha, budget);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta || budget.stopped) break;
  }
  return best;
}

export function minimaxDidactic(ds, options = {}) {
  const moves = didacticOrder(didacticLegal(ds), ds);
  if (!moves.length) return null;
  const deadline = Date.now() + (options.ms ?? 320);
  const depth = options.maxDepth ?? 2;
  const budget = { nodes: 0, max: 8000, deadline, stopped: false };
  let best = moves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  for (const move of moves) {
    if (Date.now() > deadline && bestScore > -Infinity) break;
    let next;
    try {
      next = playDidactic(ds, move);
    } catch {
      continue;
    }
    const score = depth <= 1 ? evalDidactic(next) * -1 : -negamaxDidactic(next, depth - 1, -Infinity, -alpha, budget);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
    if (score > alpha) alpha = score;
  }
  return best;
}

function wire(move) {
  if (!move) return null;
  return {
    from: indexToAlg(move.from),
    to: indexToAlg(move.to),
    promotion: move.promotion || null,
    via: move.via == null ? null : indexToAlg(move.via),
    kind: move.kind || 'normal',
    ability: null,
    chat_message: localTaunt(move),
    source: 'minimax',
  };
}

function indexToAlg(square) {
  return 'abcdefgh'[square & 7] + String((square >> 3) + 1);
}

function localTaunt() {
  const lines = [
    'Eso no hacía falta pensarlo tanto.',
    'Tu rey ya está incómodo.',
    'Sigo aquí. Sorpresa.',
    'Bonito, si ignoramos que es perdedor.',
    'El centro no se regala. Yo tampoco.',
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

export function fallbackMove(mode, state) {
  if (mode === 'didactic') {
    const ability = suggestAbility(state);
    if (ability && tryAbility(state, ability).ok) {
      const working = tryAbility(state, ability).state;
      const move = minimaxDidactic(working);
      if (move) {
        const payload = wire(move);
        payload.ability = ability;
        return payload;
      }
    }
    return wire(minimaxDidactic(state));
  }
  return wire(minimaxClassic(state));
}

function canUseLocalProxy() {
  if (typeof location === 'undefined') return false;
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return true;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
}

function isXai(endpoint) {
  try {
    return new URL(endpoint).hostname === 'api.x.ai';
  } catch {
    return false;
  }
}

async function postJSON(url, body, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
  } catch (error) {
    return { network: true, error: error.message || 'red' };
  }
  const text = await response.text();
  if (!response.ok) return { network: false, error: text.slice(0, 280) || `HTTP ${response.status}` };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { error: 'La API no devolvió JSON' };
  }
}

async function complete(messages) {
  const config = loadConfig();
  if (!config.apiKey) {
    const error = new Error('Falta la clave de API');
    error.code = 'NO_KEY';
    throw error;
  }
  const payload = { model: config.model, messages, temperature: 0.4 };
  const direct = await postJSON(config.endpoint, payload, config.apiKey);
  if (direct.ok) return messageText(direct.data);
  if (direct.network && isXai(config.endpoint) && canUseLocalProxy()) {
    const proxied = await postJSON('/api/ai', { ...payload, apiKey: config.apiKey }, null);
    if (proxied.ok) return messageText(proxied.data);
    throw new Error(proxied.error || direct.error || 'API');
  }
  throw new Error(direct.error || 'API');
}

function messageText(data) {
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') throw new Error('Respuesta vacía');
  return text;
}

function extractJSON(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) return JSON.parse(fence[1]);
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('JSON ilegible');
  }
}

function snapshotText(mode, state, color) {
  if (mode === 'didactic') return JSON.stringify(describeForAI(state, color));
  const mat = material(state);
  return JSON.stringify({
    fen: toFEN(state),
    turn: state.turn,
    you: color,
    inCheck: inCheck(state, state.turn),
    material: mat,
    legal: classicLegal(state).map((move) => ({
      from: indexToAlg(move.from),
      to: indexToAlg(move.to),
      promotion: move.promotion,
    })),
  });
}

const MOVE_SYSTEM = `Eres un rival de ajedrez sarcástico y competitivo. Respondes SOLO con un objeto JSON:
{"from":"e2","to":"e4","promotion":null,"via":null,"kind":"normal","ability":null,"chat_message":"frase corta en español"}
from y to son casillas algebraicas. Si coronas, promotion es q, r, b o n.
via se usa solo en el caballo veterano. kind es normal, ep, castle, veteran o mystic.
ability es null o {"type":"freeze","target":"c6"} o {"type":"swap","a":"b1","b":"c3"} o {"type":"emergencyCastle","rook":"h1"} o {"type":"reinforce","square":"e2"}.
La jugada tiene que estar en la lista legal. Máximo una habilidad y solo si energy alcanza y abilityUsed es false.
chat_message: una pulla breve, sin explicar toda la línea.`;

function accept(mode, state, raw) {
  if (!raw || typeof raw !== 'object') return null;
  let current = state;
  let ability = null;
  if (mode === 'didactic' && raw.ability && typeof raw.ability === 'object') {
    const tried = tryAbility(current, raw.ability);
    if (tried.ok) {
      current = tried.state;
      ability = raw.ability;
    }
  }
  const legal = mode === 'didactic' ? didacticLegal(current) : classicLegal(current);
  const move = resolveMove(legal, {
    from: raw.from,
    to: raw.to,
    promotion: raw.promotion,
    via: raw.via,
    kind: raw.kind,
  });
  if (!move) return null;
  return {
    from: indexToAlg(move.from),
    to: indexToAlg(move.to),
    promotion: move.promotion,
    via: move.via == null ? null : indexToAlg(move.via),
    kind: move.kind,
    ability,
    chat_message: sanitizeChat(raw.chat_message),
    source: 'api',
  };
}

function sanitizeChat(text) {
  if (typeof text !== 'string') return localTaunt();
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.slice(0, 240) || localTaunt();
}

function onGitHubPages() {
  return typeof location !== 'undefined' && /(^|\.)github\.io$/.test(location.hostname);
}

export async function requestMove({ mode, state, color }) {
  const local = () => fallbackMove(mode, state);
  if (!loadConfig().apiKey || onGitHubPages()) return local();
  const view = snapshotText(mode, state, color);
  try {
    const first = extractJSON(await complete([
      { role: 'system', content: MOVE_SYSTEM },
      { role: 'user', content: `Juega con ${color === 'w' ? 'blancas' : 'negras'}. Estado:\n${view}` },
    ]));
    const accepted = accept(mode, state, first);
    if (accepted) return accepted;
    const second = extractJSON(await complete([
      { role: 'system', content: MOVE_SYSTEM },
      { role: 'user', content: `La jugada anterior era ilegal. Elige una de legal y nada más. Estado:\n${view}` },
    ]));
    return accept(mode, state, second) || local();
  } catch {
    return local();
  }
}

export async function requestChat({ mode, state, color, message, history }) {
  const view = snapshotText(mode, state, color);
  const recent = (history || []).slice(-8).map((entry) => `${entry.role}: ${entry.text}`).join('\n');
  try {
    const text = await complete([
      {
        role: 'system',
        content: 'Eres el rival de una partida de ajedrez. Hablas español, con sorna y competitividad. Respondes en una o dos frases, usando la posición real. No des una línea de motor completa salvo que te la pidan explícitamente. No uses HTML.',
      },
      { role: 'user', content: `Posición:\n${view}\n${recent}\nJugador: ${message}` },
    ]);
    return sanitizeChat(text.replace(/^["']|["']$/g, ''));
  } catch {
    return localChat(mode, state, message);
  }
}

export async function requestHint({ mode, state, color }) {
  const view = snapshotText(mode, state, color);
  try {
    const raw = extractJSON(await complete([
      {
        role: 'system',
        content: 'Eres un entrenador de ajedrez. Da un consejo conceptual en español SIN revelar la jugada exacta: no menciones origen y destino, ni una casilla de llegada concreta, ni notación SAN. JSON: {"advice":"..."}',
      },
      { role: 'user', content: view },
    ]));
    const advice = sanitizeChat(raw.advice || raw.chat_message || '');
    if (/\b([NBRQK]?[a-h][1-8][-x]?[a-h][1-8]|O-O|0-0)\b/.test(advice)) {
      return localHint(mode, state, color);
    }
    return advice;
  } catch {
    return localHint(mode, state, color);
  }
}

function localChat(mode, state, message) {
  const fen = mode === 'didactic' ? toFen(state) : toFEN(state);
  const mat = material(mode === 'didactic' ? state.core : state);
  const check = mode === 'didactic' ? state.check : inCheck(state, state.turn);
  const edge = mat.advantage === 0 ? 'El material está igualado' : `La diferencia material es ${mat.advantage > 0 ? '+' : ''}${mat.advantage} para blancas`;
  if (/pista|ayuda|qué juego|que juego/i.test(message)) {
    return `${edge}. ${check ? 'Hay jaque: primero el rey.' : 'Mira piezas sin defensa antes de inventar un ataque.'} FEN ${fen.split(' ')[0]}.`;
  }
  return `${edge}. ${check ? 'Y encima hay jaque. Dramático.' : 'Puedes hablar; el tablero sigue siendo el que manda.'}`;
}

function localHint(mode, state) {
  const board = mode === 'didactic' ? state.core : state;
  const check = mode === 'didactic' ? state.check : inCheck(board, board.turn);
  if (check) return 'Hay jaque. Antes de soñar con un contraataque, deja al rey en una casilla segura.';
  const mat = material(board);
  if (Math.abs(mat.advantage) >= 3) {
    return mat.advantage > 0
      ? 'Blancas tienen material de sobra. Simplificar suele ser más útil que una combinación heroica.'
      : 'Negras van delante en material. Blancas necesitan actividad, no un cambio sumiso.';
  }
  if (mode === 'didactic' && (state.energy[state.core.turn] || 0) >= 6 && state.graveyard.some((grave) => grave.color === state.core.turn)) {
    return 'Tienes energía y un peón en el banco. Reforzar puede reabrir una columna, pero solo si no cuelgas otra pieza.';
  }
  return 'Cuenta defensores antes de avanzar. Una pieza atacada y sin apoyo es un regalo, no un plan.';
}

export async function testConnection() {
  try {
    const text = await complete([
      { role: 'system', content: 'Responde solo la palabra lista.' },
      { role: 'user', content: 'ping' },
    ]);
    return { ok: true, detail: text.slice(0, 80) };
  } catch (error) {
    return { ok: false, detail: error.message || 'Sin conexión' };
  }
}
