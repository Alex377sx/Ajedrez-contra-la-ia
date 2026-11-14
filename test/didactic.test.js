import assert from 'node:assert/strict';
import test from 'node:test';
import { alg, legalMoves as classicMoves, parseAlg } from '../src/core/chessEngine.js';
import {
  abilityTargets,
  createDidactic,
  legalMoves,
  placeMine,
  playMove,
  suggestAbility,
  undo,
  useAbility,
} from '../src/modes/didacticMode.js';

function boot(fen) {
  let ds = createDidactic(fen);
  ds = placeMine(ds, 'a2');
  ds = placeMine(ds, 'a7');
  return ds;
}

function sq(text) {
  return parseAlg(text);
}

test('la apertura didáctica conserva los 20 movimientos', () => {
  const ds = boot();
  assert.equal(legalMoves(ds).length, classicMoves(ds.core).length);
  assert.equal(ds.energy.w, 1);
});

test('la torre no captura a distancia en e5 y el caballo sí', () => {
  const blocked = boot('4k3/8/8/4n3/8/8/8/4R2K w - - 0 1');
  const rookCaps = legalMoves(blocked).filter((move) => move.from === sq('e1') && move.to === sq('e5'));
  assert.equal(rookCaps.length, 0);
  const open = boot('4k3/8/8/4n3/2N5/8/8/4R2K w - - 0 1');
  const knightCap = legalMoves(open).find((move) => move.from === sq('c4') && move.to === sq('e5'));
  assert.ok(knightCap);
});

test('el rey elevado no está en jaque por una torre lejana', () => {
  const ds = boot('8/8/8/4k3/8/8/8/4R2K b - - 0 1');
  assert.equal(ds.check, false);
  assert.equal(ds.core.turn, 'b');
});

test('la torre fortificada ignora peones', () => {
  let ds = boot('4k3/8/8/r7/1P6/8/8/4K3 w - - 0 1');
  const rook = ds.core.board[sq('a5')];
  ds = { ...ds, veteran: { [rook.id]: true } };
  const captures = legalMoves(ds).filter((move) => move.to === sq('a5'));
  assert.equal(captures.length, 0);
});

test('caballo veterano, alfil místico y mina de aturdimiento', () => {
  let ds = boot('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1');
  const knight = ds.core.board[sq('b1')];
  ds = { ...ds, veteran: { [knight.id]: true } };
  const extra = legalMoves(ds).filter((move) => move.kind === 'veteran');
  assert.ok(extra.length > 0);
  ds = playMove(ds, { from: 'b1', to: 'b3', via: 'a3', kind: 'veteran' });
  assert.equal(alg(ds.log.at(-1).to), 'b3');

  let mystic = boot('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1');
  const bishop = mystic.core.board[sq('c1')];
  mystic = { ...mystic, veteran: { [bishop.id]: true } };
  assert.ok(legalMoves(mystic).some((move) => move.kind === 'mystic' && move.to === sq('d1')));
  mystic = playMove(mystic, { from: 'c1', to: 'd1', kind: 'mystic' });
  mystic = playMove(mystic, { from: 'e8', to: 'e7' });
  assert.equal(legalMoves(mystic).some((move) => move.kind === 'mystic'), false);

  let mined = boot();
  mined = { ...mined, mines: { w: { sq: sq('a2'), live: false }, b: { sq: sq('e4'), live: true } } };
  mined = playMove(mined, { from: 'e2', to: 'e4' });
  assert.ok(mined.lastEvents.includes('mine'));
  mined = playMove(mined, { from: 'a7', to: 'a6' });
  const pawnMoves = legalMoves(mined).filter((move) => move.from === sq('e4'));
  assert.equal(pawnMoves.length, 0);
});

test('energía, congelar, intercambio, enroque y refuerzo', () => {
  let ds = boot();
  assert.equal(suggestAbility(ds), null);
  ds = { ...ds, energy: { w: 4, b: 0 } };
  ds = useAbility(ds, { type: 'swap', a: 'b1', b: 'c1' });
  assert.equal(ds.core.board[sq('b1')].t, 'b');
  assert.equal(ds.core.board[sq('c1')].t, 'n');
  ds = undo(ds);
  assert.equal(ds.core.board[sq('b1')].t, 'n');
  assert.equal(ds.energy.w, 4);

  ds = useAbility(ds, { type: 'freeze', target: 'b8' });
  ds = playMove(ds, { from: 'a2', to: 'a3' });
  assert.equal(legalMoves(ds).some((move) => move.from === sq('b8')), false);

  let castle = boot();
  castle = { ...castle, energy: { w: 5, b: 0 } };
  castle = useAbility(castle, { type: 'emergencyCastle', rook: 'h1' });
  assert.equal(castle.core.board[sq('h1')].t, 'k');
  assert.equal(castle.core.board[sq('e1')].t, 'r');
  castle = undo(castle);

  let raid = boot();
  raid = playMove(raid, { from: 'e2', to: 'e4' });
  raid = playMove(raid, { from: 'd7', to: 'd5' });
  raid = playMove(raid, { from: 'e4', to: 'd5' });
  assert.ok(raid.graveyard.some((grave) => grave.color === 'b'));
  raid = { ...raid, energy: { ...raid.energy, b: 6 } };
  const homes = abilityTargets(raid, 'reinforce');
  assert.ok(homes.includes(sq('d7')));
  raid = useAbility(raid, { type: 'reinforce', square: 'd7' });
  assert.equal(raid.core.board[sq('d7')].t, 'p');
  assert.equal(raid.core.board[sq('d7')].c, 'b');
});
