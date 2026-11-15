/**
 * Lee en voz alta la pieza y la casilla de cada jugada.
 */

const FILES = ['a', 'be', 'ce', 'de', 'e', 'efe', 'ge', 'hache'];
const RANKS = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho'];
const PIECES = {
  N: ['el', 'caballo'],
  B: ['el', 'alfil'],
  R: ['la', 'torre'],
  Q: ['la', 'dama'],
  K: ['el', 'rey'],
  P: ['el', 'peón'],
};
const CROWNS = { Q: 'dama', R: 'torre', B: 'alfil', N: 'caballo' };
const KEY = 'ajedrez.voz';

export function speechEnabled() {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSpeechEnabled(on) {
  try {
    globalThis.localStorage?.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* el navegador puede bloquear el almacenamiento */
  }
}

function spokenSquare(square) {
  const file = FILES[square.charCodeAt(0) - 97] || square[0];
  const rank = RANKS[Number(square[1]) - 1] || square[1];
  return `${file} ${rank}`;
}

export function describeMove({ san, opponent, youLabel = 'Tú' }) {
  const text = String(san || '');
  const body = (text.split('·').pop() || '').replace(/[+#]/g, '').trim();
  const mate = text.includes('#');
  const check = text.includes('+') || mate;
  const who = opponent ? 'El oponente' : youLabel;
  const verb = who === 'Tú' ? 'mueves' : who === 'El oponente' ? 'mueve' : 'mueven';
  let sentence;
  if (body === 'O-O' || body === '0-0') sentence = `${who} ${who === 'Tú' ? 'haces' : who === 'El oponente' ? 'hace' : 'hacen'} enroque corto`;
  else if (body === 'O-O-O' || body === '0-0-0') sentence = `${who} ${who === 'Tú' ? 'haces' : who === 'El oponente' ? 'hace' : 'hacen'} enroque largo`;
  else {
    const squares = body.match(/[a-h][1-8]/g) || [];
    const dest = squares.at(-1);
    const letter = 'NBRQK'.includes(body[0]) ? body[0] : 'P';
    const [article, name] = PIECES[letter];
    const crown = body.match(/=([QRBN])/i);
    if (!dest) sentence = `${who} ${verb} una pieza`;
    else if (body.includes('x')) sentence = `${who} ${who === 'Tú' ? 'capturas' : verb === 'mueve' ? 'captura' : 'capturan'} con ${article} ${name} en ${spokenSquare(dest)}`;
    else sentence = `${who} ${verb} ${article} ${name} a ${spokenSquare(dest)}`;
    if (crown) sentence += ` y corona ${CROWNS[crown[1].toUpperCase()] || 'dama'}`;
  }
  if (mate) sentence += '. Jaque mate';
  else if (check) sentence += '. Jaque';
  return `${sentence}.`;
}

export function speak(text) {
  const synth = globalThis.speechSynthesis;
  if (!text || !synth) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'es-ES';
  utter.rate = 1.02;
  const voice = synth.getVoices().find((item) => item.lang.toLowerCase().startsWith('es'));
  if (voice) utter.voice = voice;
  synth.cancel();
  synth.resume();
  synth.speak(utter);
}
