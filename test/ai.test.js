import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, legalMoves } from '../src/core/chessEngine.js';
import { minimaxClassic } from '../src/ai/apiClient.js';
import { createDidactic, legalMoves as didacticMoves, placeMine } from '../src/modes/didacticMode.js';
import { minimaxDidactic } from '../src/ai/apiClient.js';

test('el minimax clásico devuelve una jugada legal', () => {
  const game = createGame();
  const move = minimaxClassic(game, { maxDepth: 2, ms: 250 });
  assert.ok(legalMoves(game).some((item) => item.from === move.from && item.to === move.to));
});

test('el minimax didáctico devuelve una jugada legal', () => {
  let ds = createDidactic();
  ds = placeMine(ds, 'a2');
  ds = placeMine(ds, 'a7');
  const move = minimaxDidactic(ds, { maxDepth: 1, ms: 250 });
  assert.ok(didacticMoves(ds).some((item) => item.from === move.from && item.to === move.to));
});
