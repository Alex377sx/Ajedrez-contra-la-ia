import assert from 'node:assert/strict';
import test from 'node:test';
import { describeMove } from '../src/ui/speech.js';

test('anuncia el caballo del oponente en f6', () => {
  assert.equal(
    describeMove({ san: 'Nf6', opponent: true }),
    'El oponente mueve el caballo a efe seis.',
  );
});

test('anuncia captura, jaque y enroque', () => {
  assert.equal(
    describeMove({ san: 'Nxf6+', opponent: true }),
    'El oponente captura con el caballo en efe seis. Jaque.',
  );
  assert.equal(
    describeMove({ san: 'O-O', opponent: false }),
    'Tú haces enroque corto.',
  );
  assert.match(describeMove({ san: 'e8=Q#', opponent: true }), /corona dama/);
});
