import assert from 'node:assert/strict';
import test from 'node:test';
import {
  START_FEN,
  alg,
  applyMove,
  createGame,
  gameStatus,
  legalMoves,
  parseFEN,
  perft,
  playMove,
  toFEN,
} from '../src/core/chessEngine.js';

function divide(state, depth) {
  const lines = [];
  for (const move of legalMoves(state)) {
    const count = depth === 1 ? 1 : perft(applyMove(state, move), depth - 1);
    lines.push(`${alg(move.from)}${alg(move.to)}${move.promotion || ''} ${count}`);
  }
  return lines.sort();
}

test('posición inicial: 20 legales y FEN redondo', () => {
  const game = createGame();
  assert.equal(legalMoves(game).length, 20);
  assert.equal(toFEN(game), START_FEN);
  const again = parseFEN(toFEN(game));
  assert.equal(toFEN(again), START_FEN);
});

test('perft inicial', () => {
  const game = createGame();
  assert.equal(perft(game, 1), 20);
  assert.equal(perft(game, 2), 400);
  assert.equal(perft(game, 3), 8902);
});

test('perft Kiwipete', () => {
  const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  const game = parseFEN(fen);
  assert.equal(perft(game, 1), 48);
  assert.equal(perft(game, 2), 2039);
});

test('perft posición 3 (en passant y jaques)', () => {
  const fen = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
  const game = parseFEN(fen);
  assert.equal(perft(game, 1), 14);
  assert.equal(perft(game, 2), 191);
  assert.equal(perft(game, 3), 2812);
});

test('mate del pastor y notación', () => {
  let game = createGame();
  for (const move of [
    { from: 'e2', to: 'e4' },
    { from: 'e7', to: 'e5' },
    { from: 'd1', to: 'h5' },
    { from: 'b8', to: 'c6' },
    { from: 'f1', to: 'c4' },
    { from: 'g8', to: 'f6' },
    { from: 'h5', to: 'f7' },
  ]) {
    game = playMove(game, move);
  }
  const status = gameStatus(game);
  assert.equal(status.over, true);
  assert.equal(status.reason, 'checkmate');
  assert.equal(status.result, 'w');
  assert.equal(game.moves.at(-1).san, 'Qxf7#');
});

test('captura al paso', () => {
  const game = parseFEN('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const ep = legalMoves(game).find((move) => move.kind === 'ep');
  assert.ok(ep);
  assert.equal(alg(ep.to), 'd6');
  const next = playMove(game, { from: ep.from, to: ep.to });
  assert.equal(next.board[ep.captureAt], null);
  assert.equal(next.board[ep.to].t, 'p');
  assert.match(next.moves.at(-1).san, /^exd6/);
});

test('no se puede enrocar atravesando jaque', () => {
  const game = parseFEN('5r2/8/8/8/8/8/8/4K2R w K - 0 1');
  const castles = legalMoves(game).filter((move) => move.castle);
  assert.equal(castles.length, 0);
});

test('enroque corto legal', () => {
  const game = parseFEN('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  const castle = legalMoves(game).find((move) => move.castle === 'K');
  assert.ok(castle);
  const next = playMove(game, { from: 'e1', to: 'g1' });
  assert.equal(next.moves.at(-1).san, 'O-O');
  assert.equal(next.board[6].t, 'k');
  assert.equal(next.board[5].t, 'r');
  assert.equal(next.castling.includes('K'), false);
});

test('coronación con selector', () => {
  const game = parseFEN('7k/4P3/8/8/8/8/8/4K3 w - - 0 1');
  const promos = legalMoves(game).filter((move) => move.promotion);
  assert.equal(promos.length, 4);
  const next = playMove(game, { from: 'e7', to: 'e8', promotion: 'n' });
  assert.equal(next.board[parseAlgSafe('e8')].t, 'n');
  assert.equal(next.moves.at(-1).san, 'e8=N');
});

test('pieza clavada no puede salir de la clavada', () => {
  const game = parseFEN('4k3/4n3/8/8/8/8/8/4R2K b - - 0 1');
  const knightMoves = legalMoves(game).filter((move) => move.from === parseAlgSafe('e7'));
  assert.equal(knightMoves.length, 0);
});

test('triple repetición', () => {
  let game = createGame();
  const dance = [
    ['b1', 'c3'], ['b8', 'c6'], ['c3', 'b1'], ['c6', 'b8'],
    ['b1', 'c3'], ['b8', 'c6'], ['c3', 'b1'], ['c6', 'b8'],
  ];
  for (const [from, to] of dance) game = playMove(game, { from, to });
  const status = gameStatus(game);
  assert.equal(status.over, true);
  assert.equal(status.reason, 'repetition');
});

test('material insuficiente y regla de 50', () => {
  const kings = gameStatus(parseFEN('k7/8/8/8/8/8/8/7K w - - 0 1'));
  assert.equal(kings.reason, 'material');
  const bishop = gameStatus(parseFEN('k7/8/8/8/8/8/8/6BK w - - 0 1'));
  assert.equal(bishop.reason, 'material');
  const knights = gameStatus(parseFEN('k7/8/8/8/8/8/8/5NNK w - - 0 1'));
  assert.equal(knights.reason, 'playing');
  const fifty = gameStatus(parseFEN('k7/p7/P7/8/8/8/8/7K w - - 100 80'));
  assert.equal(fifty.reason, 'fifty');
});

test('ahogado', () => {
  const status = gameStatus(parseFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'));
  assert.equal(status.over, true);
  assert.equal(status.reason, 'stalemate');
});

function parseAlgSafe(text) {
  return (text.charCodeAt(0) - 97) + (text.charCodeAt(1) - 49) * 8;
}

test('divide de depuración queda estable en la inicial a profundidad 1', () => {
  const lines = divide(createGame(), 1);
  assert.equal(lines.length, 20);
});
