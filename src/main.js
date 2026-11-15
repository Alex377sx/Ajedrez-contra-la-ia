import { createGame, gameStatus, legalMoves as classicLegal, material, opposite, playMove as playClassic, insufficientMaterial, sqOf } from './core/chessEngine.js';
import { ABILITIES, ELEVATED_SQUARES, abilityTargets, canRedo, canUndo, createDidactic, heatMap, legalMoves as didacticLegal, placeMine, playMove as playDidactic, redo, suggestedMine, tryAbility, undo } from './modes/didacticMode.js';
import { DEFAULTS, MODELS, loadConfig, requestChat, requestHint, requestMove, saveConfig, testConnection } from './ai/apiClient.js';
import { mountBoard, pieceSVG } from './ui/boardRenderer.js';
import { mountPanels } from './ui/panels.js';
import { describeMove, setSpeechEnabled, speak, speechEnabled } from './ui/speech.js';
import { openSocket } from './net/wifi.js';

const NAMES = { w: 'Blancas', b: 'Negras' };
const REASONS = {
  checkmate: 'Jaque mate',
  stalemate: 'Tablas por ahogado',
  fifty: 'Tablas por la regla de 50 jugadas',
  repetition: 'Tablas por triple repetición',
  material: 'Tablas por material insuficiente',
  time: 'Tiempo agotado',
  resign: 'Rendición',
  mines: 'Colocación de minas',
  check: 'Jaque',
  playing: '',
};

const app = {
  mode: 'classic',
  opponent: 'ai',
  human: 'w',
  clockKind: '10+0',
  classic: null,
  didactic: null,
  clocks: null,
  ended: null,
  radar: false,
  token: 0,
  orientation: 'w',
  selected: null,
  promo: null,
  ability: null,
  swapA: null,
  chat: [],
  thinking: false,
  labHold: false,
  animate: null,
  speech: speechEnabled(),
  engine: null,
  net: null,
  applyingRemote: false,
};

const setupEl = document.getElementById('setup');
const gameEl = document.getElementById('game');
const statusEl = document.getElementById('status-line');
const clockTop = document.getElementById('clock-top');
const clockBottom = document.getElementById('clock-bottom');
const toastEl = document.getElementById('toast');
const dialog = document.getElementById('api-dialog');

const board = mountBoard(document.getElementById('board-root'), {
  onSquare: (square) => onSquare(square),
  onDrop: (from, to) => onDrop(from, to),
  onPromote: (type) => {
    if (!app.promo) return;
    const pending = app.promo;
    app.promo = null;
    commitMove({ from: pending.from, to: pending.to, promotion: type });
  },
});

const panels = mountPanels(document.getElementById('game'), {
  onRadar: () => { app.radar = !app.radar; paint(); },
  onUndo: () => labStep('undo'),
  onRedo: () => labStep('redo'),
  onHint: () => askHint(),
  onResume: () => {
    app.labHold = false;
    resumeClock();
    paint();
    aiTurn();
  },
  onFlip: () => { app.orientation = opposite(app.orientation); paint(); },
  onSpeech: () => {
    app.speech = !app.speech;
    setSpeechEnabled(app.speech);
    if (app.speech) speak('Lector activado. Digo la pieza y la casilla.');
    paint();
  },
  onAbility: (type) => armAbility(type),
  onResign: () => resign(),
  onAgain: () => startGame(),
  onSetup: () => showSetup(),
  onChat: (text) => sendChat(text),
});

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices());
}

renderSetup();
wireApiDialog();
setInterval(tick, 200);

function renderSetup() {
  setupEl.hidden = false;
  gameEl.hidden = true;
  setupEl.replaceChildren();
  const title = document.createElement('h1');
  title.textContent = 'Elige cómo pelear';
  const lede = document.createElement('p');
  lede.className = 'lede';
    lede.textContent = 'Clásico o didáctico. Contra la IA, en el mismo dispositivo, o con alguien en la misma WiFi.';
  const modes = document.createElement('div');
  modes.className = 'modes';
  modes.append(
    modeCard('classic', 'Modo clásico', 'Reglas oficiales, notación algebraica, reloj opcional y ventaja material.'),
    modeCard('didactic', 'Modo didáctico y táctico', 'Radar, laboratorio, terreno elevado, veteranía y habilidades.'),
  );
  const options = document.createElement('div');
  options.className = 'options';
  options.append(
    choiceField('Rival', [
      ['ai', 'Inteligencia'],
      ['local', 'Mismo dispositivo'],
      ['wifi', 'Misma WiFi'],
    ], app.opponent, (value) => { app.opponent = value; renderSetup(); }),
    choiceField('Color', [
      ['w', 'Blancas'],
      ['b', 'Negras'],
      ['random', 'Azar'],
    ], app.human, (value) => { app.human = value; }),
    choiceField('Reloj', [
      ['none', 'Sin reloj'],
      ['3+2', '3+2'],
      ['5+0', '5+0'],
      ['10+0', '10+0'],
      ['15+10', '15+10'],
    ], app.clockKind, (value) => { app.clockKind = value; }),
  );
  setupEl.append(title, lede, modes, options);
  if (app.opponent === 'wifi') setupEl.append(wifiBox());
  else {
    const start = document.createElement('button');
    start.className = 'start';
    start.type = 'button';
    start.textContent = 'Empezar partida';
    start.addEventListener('click', startGame);
    setupEl.append(start);
  }
  if (app.mode === 'didactic') {
    const rules = document.createElement('ul');
    rules.className = 'rules';
    for (const line of [
      'Radar: verde defendido, rojo atacado, amarillo en disputa. Las piezas colgadas se marcan.',
      'Veteranía a las 2 capturas: el caballo da un paso ortogonal extra, la torre ignora peones y el alfil cambia de color una vez.',
      'd4 y e5 están elevadas. Congelar cuesta 3, intercambio 4, enroque de emergencia 5 y refuerzo 6.',
      'Cada jugador esconde una mina en su mitad antes de la primera jugada.',
    ]) {
      const item = document.createElement('li');
      item.textContent = line;
      rules.appendChild(item);
    }
    setupEl.appendChild(rules);
  }
}

function modeCard(id, name, text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `mode${app.mode === id ? ' on' : ''}`;
  const strong = document.createElement('strong');
  strong.textContent = name;
  const span = document.createElement('span');
  span.textContent = text;
  button.append(strong, span);
  button.addEventListener('click', () => { app.mode = id; renderSetup(); });
  return button;
}

function choiceField(label, options, current, onPick) {
  const field = document.createElement('div');
  field.className = 'field';
  const name = document.createElement('label');
  name.textContent = label;
  const choices = document.createElement('div');
  choices.className = 'choices';
  for (const [value, text] of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.classList.toggle('on', current === value);
    button.addEventListener('click', () => {
      onPick(value);
      for (const child of choices.children) child.classList.remove('on');
      button.classList.add('on');
    });
    choices.appendChild(button);
  }
  field.append(name, choices);
  return field;
}

function wifiBox() {
  const box = document.createElement('section');
  box.className = 'lobby';
  const copy = document.createElement('p');
  copy.textContent = 'Una persona crea la sala en el equipo donde corre el juego. La otra abre esa misma dirección, en la misma WiFi, y entra con el código.';
  const create = document.createElement('button');
  create.type = 'button';
  create.className = 'primary';
  create.textContent = 'Crear sala';
  create.addEventListener('click', createWifiRoom);
  const row = document.createElement('div');
  row.className = 'join-row';
  const input = document.createElement('input');
  input.maxLength = 4;
  input.placeholder = 'CÓDIGO';
  input.setAttribute('aria-label', 'Código de sala');
  const join = document.createElement('button');
  join.type = 'button';
  join.textContent = 'Unirse';
  join.addEventListener('click', () => joinWifiRoom(input.value));
  row.append(input, join);
  box.append(copy, create, row);
  return box;
}

function showLobby(msg) {
  setupEl.hidden = false;
  gameEl.hidden = true;
  setupEl.replaceChildren();
  const box = document.createElement('section');
  box.className = 'lobby';
  const title = document.createElement('h1');
  title.textContent = 'Sala lista';
  const code = document.createElement('code');
  code.textContent = msg.room;
  const copy = document.createElement('p');
  copy.textContent = 'En el otro dispositivo abre una de estas direcciones y únete con el código.';
  const urls = document.createElement('p');
  urls.textContent = (msg.urls || []).join('   ');
  box.append(title, code, copy, urls);
  setupEl.append(box);
}

async function connectWifi() {
  app.net?.close();
  const net = openSocket();
  await net.ready;
  app.net = net;
  net.listen(onNet);
  return net;
}

async function createWifiRoom() {
  try {
    const net = await connectWifi();
    net.send({
      type: 'create',
      mode: app.mode,
      clock: app.clockKind,
      color: app.human,
    });
  } catch (error) {
    toast(error.message);
  }
}

async function joinWifiRoom(code) {
  try {
    const net = await connectWifi();
    net.send({ type: 'join', room: code });
  } catch (error) {
    toast(error.message);
  }
}

function onNet(msg) {
  if (msg.type === 'error') {
    toast(msg.message);
    return;
  }
  if (msg.type === 'lobby') {
    showLobby(msg);
    return;
  }
  if (msg.type === 'begin') {
    beginMatch({ color: msg.color, mode: msg.mode, clock: msg.clock });
    return;
  }
  if (msg.type === 'action') {
    applyRemote(msg.action);
    return;
  }
  if (msg.type === 'left') {
    toast('El rival se desconectó.');
    pauseClock();
  }
}

function sendAction(action) {
  if (app.opponent !== 'wifi' || app.applyingRemote) return false;
  app.net?.send({ type: 'action', action });
  return true;
}

function applyRemote(action) {
  app.applyingRemote = true;
  try {
    if (action.kind === 'move') commitMove(action.input);
    else if (action.kind === 'mine') placeUserMine(action.square);
    else if (action.kind === 'ability') {
      const tried = tryAbility(app.didactic, action.ability);
      if (tried.ok) {
        app.didactic = tried.state;
        app.ability = null;
        app.swapA = null;
        pushChat('sistema', 'Habilidad gastada. Ahora la jugada de ajedrez.');
        paint();
      }
    } else if (action.kind === 'undo' || action.kind === 'redo') labStep(action.kind);
    else if (action.kind === 'resign') resign(action.color);
  } finally {
    app.applyingRemote = false;
  }
}

function startGame() {
  const human = app.human === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : app.human;
  beginMatch({ color: human });
}

function beginMatch({ color, mode, clock }) {
  if (mode) app.mode = mode;
  if (clock) app.clockKind = clock;
  const human = color;
  app.human = human;
  app.orientation = app.opponent === 'local' ? 'w' : human;
  app.ended = null;
  app.selected = null;
  app.promo = null;
  app.ability = null;
  app.swapA = null;
  app.chat = [];
  app.thinking = false;
  app.labHold = false;
  app.token += 1;
  app.animate = null;
  app.radar = app.mode === 'didactic';
  app.clocks = makeClock(app.clockKind);
  if (app.mode === 'classic') {
    app.classic = createGame();
    app.didactic = null;
    armClock();
  } else {
    app.classic = null;
    let ds = createDidactic();
    if (app.opponent === 'ai' && human === 'b') ds = placeMine(ds, suggestedMine('w'));
    app.didactic = ds;
  }
  setupEl.hidden = true;
  gameEl.hidden = false;
  pushChat('sistema', app.mode === 'didactic'
    ? 'Cada bando coloca una mina oculta en su mitad. El rival no la ve.'
    : 'Partida clásica. Las jugadas ilegales no entran.');
  paint();
  if (app.opponent === 'ai' && side() !== app.human && !placing()) aiTurn();
}

function showSetup() {
  pauseClock();
  app.net?.close();
  app.net = null;
  renderSetup();
}

function placing() {
  return app.mode === 'didactic' && app.didactic?.phase === 'mines';
}

function core() {
  return app.mode === 'classic' ? app.classic : app.didactic.core;
}

function side() {
  return core().turn;
}

function boardPieces() {
  return core().board;
}

function ended() {
  if (app.ended) return { over: true, ...app.ended, check: false };
  if (app.mode === 'classic') {
    const report = gameStatus(app.classic);
    return report;
  }
  return {
    over: Boolean(app.didactic.over),
    result: app.didactic.result,
    reason: app.didactic.reason,
    check: app.didactic.check,
  };
}

function viewer() {
  if (app.opponent === 'local') return placing() ? app.didactic.mineTurn : side();
  return app.human;
}

function myTurn() {
  const report = ended();
  if (report.over || app.thinking) return false;
  if (placing()) {
    if (app.opponent === 'local') return true;
    return app.didactic.mineTurn === app.human;
  }
  if (app.opponent === 'local') return true;
  return side() === app.human;
}

function legal() {
  if (placing() || ended().over) return [];
  return app.mode === 'classic' ? classicLegal(app.classic) : didacticLegal(app.didactic);
}

function onSquare(square) {
  resumeAudio();
  if (!myTurn()) return;
  if (placing()) {
    placeUserMine(square);
    return;
  }
  if (app.ability) {
    aimAbility(square);
    return;
  }
  const moves = legal().filter((move) => move.from === app.selected && move.to === square);
  if (app.selected != null && moves.length) {
    chooseMove(moves, square);
    return;
  }
  const piece = boardPieces()[square];
  if (piece && piece.c === side() && (app.didactic?.frozen?.[piece.id] || 0) > 0) {
    toast('Esa pieza está congelada.');
    return;
  }
  if (piece && piece.c === side()) app.selected = square;
  else app.selected = null;
  paint();
}

function onDrop(from, to) {
  if (placing()) return;
  const piece = boardPieces()[from];
  if (!myTurn() || !piece || piece.c !== side()) return;
  app.selected = from;
  const moves = legal().filter((move) => move.from === from && move.to === to);
  if (!moves.length) {
    paint();
    return;
  }
  chooseMove(moves, to);
}

function chooseMove(moves, to) {
  const promotions = moves.filter((move) => move.promotion);
  if (promotions.length > 1 && new Set(promotions.map((move) => move.promotion)).size > 1) {
    app.promo = { from: moves[0].from, to };
    paint();
    return;
  }
  commitMove(moves[0]);
}

function commitMove(input) {
  if (sendAction({ kind: 'move', input })) return;
  if (timeLeft(side()) <= 0) {
    flag(side());
    return;
  }
  const mover = side();
  punch(mover);
  const before = lastSquares();
  try {
    if (app.mode === 'classic') app.classic = playClassic(app.classic, input);
    else app.didactic = playDidactic(app.didactic, input);
  } catch (error) {
    toast(error.message);
    paint();
    return;
  }
  app.selected = null;
  app.promo = null;
  app.ability = null;
  app.swapA = null;
  app.labHold = false;
  const log = app.mode === 'classic' ? app.classic.moves : app.didactic.log;
  const last = log.at(-1);
  app.animate = last ? { from: last.from, to: last.to } : null;
  if (app.speech && last) {
    const versus = app.opponent !== 'local';
    const opponent = versus && last.color !== app.human;
    const youLabel = versus ? 'Tú' : NAMES[last.color];
    speak(describeMove({ san: last.san, opponent, youLabel }));
  }
  soundFor(app.mode === 'didactic' ? app.didactic.lastEvents : eventsFromClassic(before));
  if (app.mode === 'didactic') narrate(app.didactic.lastEvents);
  const report = ended();
  if (report.over) pauseClock();
  try {
    paint();
  } catch (error) {
    console.error(error);
  }
  if (!report.over && app.opponent === 'ai' && side() !== app.human) aiTurn();
}

function eventsFromClassic(before) {
  const report = gameStatus(app.classic);
  const events = [];
  if (app.classic.moves.at(-1)?.san.includes('x')) events.push('capture');
  if (report.reason === 'checkmate') events.push('mate');
  else if (report.check) events.push('check');
  return events;
}

function placeUserMine(square) {
  if (sendAction({ kind: 'mine', square })) return;
  try {
    app.didactic = placeMine(app.didactic, square);
  } catch (error) {
    toast(error.message);
    return;
  }
  if (app.didactic.phase === 'mines' && app.opponent === 'ai') {
    app.didactic = placeMine(app.didactic, suggestedMine(app.didactic.mineTurn));
  }
  if (app.didactic.phase === 'play') {
    armClock();
    pushChat('sistema', 'Minas listas. d4 y e5 siguen elevadas toda la partida.');
  }
  paint();
  if (app.didactic.phase === 'play' && app.opponent === 'ai' && side() !== app.human) aiTurn();
}

function armAbility(type) {
  if (!myTurn() || app.mode !== 'didactic') return;
  if (app.ability === type) {
    app.ability = null;
    app.swapA = null;
    paint();
    return;
  }
  const targets = abilityTargets(app.didactic, type);
  if (!targets.length) {
    toast('Esa habilidad no está disponible.');
    return;
  }
  app.ability = type;
  app.swapA = null;
  app.selected = null;
  paint();
}

function aimAbility(square) {
  const ds = app.didactic;
  const alg = sqAlg(square);
  let result = null;
  if (app.ability === 'freeze') result = tryAbility(ds, { type: 'freeze', target: alg });
  else if (app.ability === 'reinforce') result = tryAbility(ds, { type: 'reinforce', square: alg });
  else if (app.ability === 'emergencyCastle') result = tryAbility(ds, { type: 'emergencyCastle', rook: alg });
  else if (app.ability === 'swap') {
    if (app.swapA == null) {
      const piece = ds.core.board[square];
      if (!piece || piece.c !== side() || piece.t === 'k') {
        toast('Elige una pieza tuya que no sea el rey.');
        return;
      }
      app.swapA = alg;
      paint();
      return;
    }
    result = tryAbility(ds, { type: 'swap', a: app.swapA, b: alg });
  }
  if (!result?.ok) {
    toast(result?.error || 'No se pudo usar la habilidad');
    return;
  }
  const ability = app.ability === 'freeze' ? { type: 'freeze', target: alg }
    : app.ability === 'reinforce' ? { type: 'reinforce', square: alg }
      : app.ability === 'emergencyCastle' ? { type: 'emergencyCastle', rook: alg }
        : { type: 'swap', a: app.swapA, b: alg };
  if (sendAction({ kind: 'ability', ability })) return;
  app.didactic = result.state;
  app.ability = null;
  app.swapA = null;
  pushChat('sistema', 'Habilidad gastada. Ahora la jugada de ajedrez.');
  paint();
}

function labStep(kind) {
  if (app.mode !== 'didactic') return;
  if (sendAction({ kind })) return;
  pauseClock();
  const next = kind === 'undo' ? undo(app.didactic) : redo(app.didactic);
  if (next === app.didactic) return;
  app.didactic = next;
  app.token += 1;
  app.ended = null;
  app.selected = null;
  app.promo = null;
  app.ability = null;
  app.swapA = null;
  app.animate = null;
  app.labHold = app.opponent === 'ai' && !placing() && side() !== app.human && !ended().over;
  if (!app.labHold && !ended().over && !placing()) resumeClock();
  paint();
}

async function aiTurn() {
  if (app.thinking || app.labHold || app.opponent !== 'ai' || ended().over) return;
  if (placing()) return;
  if (side() === app.human) return;
  const token = ++app.token;
  app.thinking = true;
  app.selected = null;
  try { paint(); } catch (error) { console.error(error); }
  await delay(40);
  let choice = null;
  try {
    choice = await requestMove({
      mode: app.mode,
      state: app.mode === 'classic' ? app.classic : app.didactic,
      color: side(),
    });
  } catch (error) {
    console.error(error);
  }
  if (!choice) {
    const reply = legal()[0];
    if (reply) {
      choice = {
        from: reply.from,
        to: reply.to,
        promotion: reply.promotion,
        chat_message: 'Sigo en la partida.',
        source: 'minimax',
      };
    }
  }
  app.thinking = false;
  if (token !== app.token || !choice || ended().over || side() === app.human) {
    try { paint(); } catch (error) { console.error(error); }
    return;
  }
  if (app.mode === 'didactic' && choice.ability) {
    const tried = tryAbility(app.didactic, choice.ability);
    if (tried.ok) app.didactic = tried.state;
  }
  app.engine = choice.source === 'api' ? 'api' : 'local';
  if (choice.chat_message) pushChat('rival', choice.chat_message);
  commitMove(choice);
}

async function askHint() {
  if (app.mode !== 'didactic' || app.thinking || ended().over || placing()) return;
  app.thinking = true;
  paint();
  const advice = await requestHint({ mode: 'didactic', state: app.didactic, color: viewer() });
  app.thinking = false;
  pushChat('entrenador', advice);
  paint();
}

async function sendChat(text) {
  pushChat('tu', text);
  paint();
  const reply = await requestChat({
    mode: app.mode,
    state: app.mode === 'classic' ? app.classic : app.didactic,
    color: app.human,
    message: text,
    history: app.chat,
  });
  pushChat('rival', reply);
  paint();
}

function resign(color) {
  if (ended().over || placing()) return;
  const loser = color || (app.opponent === 'local' ? side() : app.human);
  if (sendAction({ kind: 'resign', color: loser })) return;
  closeGame(opposite(loser), 'resign');
}

function flag(color) {
  const winner = opposite(color);
  const position = core();
  const winnerHasForce = position.board.some((piece) => piece && piece.c === winner && piece.t !== 'k');
  if (!winnerHasForce || insufficientMaterial(position)) closeGame('draw', 'material');
  else closeGame(winner, 'time');
}

function closeGame(result, reason) {
  app.ended = { result, reason };
  if (app.didactic) app.didactic = { ...app.didactic, over: true, result, reason };
  pauseClock();
  paint();
}

function narrate(events = []) {
  if (events.includes('mine')) pushChat('sistema', 'La mina estalla. Esa pieza no se mueve en su próximo turno.');
  if (events.includes('veteran')) pushChat('sistema', 'Veteranía: el caballo gana un paso, la torre se fortifica o el alfil puede cambiar de color.');
}

function pushChat(role, text) {
  app.chat = app.chat.concat([{ role, text }]);
}

function paint() {
  const report = ended();
  const pieces = boardPieces();
  const moves = legal();
  const marks = [];
  if (app.selected != null) {
    for (const move of moves) {
      if (move.from !== app.selected) continue;
      const capture = Boolean(move.captureAt != null || (pieces[move.to] && pieces[move.to].c !== pieces[move.from].c));
      if (!marks.some((item) => item.sq === move.to)) marks.push({ sq: move.to, capture });
    }
  }
  const last = (app.mode === 'classic' ? app.classic.moves : app.didactic.log).at(-1);
  let heat = null;
  let hanging = [];
  if (app.mode === 'didactic' && app.radar && !placing()) {
    const map = heatMap(app.didactic, viewer());
    heat = map.cells;
    hanging = map.hanging;
  }
  const frozen = {};
  const veteran = {};
  if (app.didactic) {
    for (const piece of pieces) {
      if (!piece) continue;
      if ((app.didactic.frozen[piece.id] || 0) > 0) frozen[piece.id] = true;
      if (app.didactic.veteran[piece.id]) veteran[piece.id] = true;
    }
  }
  const ability = app.ability ? abilityTargets(app.didactic, app.ability) : [];
  const mineOwner = viewer();
  const ownMine = app.didactic?.mines?.[mineOwner];
  board.update({
    board: pieces,
    orientation: app.orientation,
    selected: app.selected,
    marks,
    last: last ? { from: last.from, to: last.to } : null,
    checkSq: report.check ? kingSquare(pieces, side()) : null,
    heat,
    hanging,
    elevated: app.mode === 'didactic' ? ELEVATED_SQUARES.map((text) => sqOf(text)) : [],
    mine: ownMine?.live ? ownMine.sq : null,
    frozen,
    veteran,
    mover: side(),
    animate: app.animate,
    placement: placing() ? app.didactic.mineTurn : null,
    ability,
    promo: Boolean(app.promo),
    promoColor: side(),
    locked: app.thinking,
  });
  const mat = material(core());
  const log = app.mode === 'classic' ? app.classic.moves : app.didactic.log;
  panels.update({
    didactic: app.mode === 'didactic',
    radar: app.radar,
    canUndo: app.mode === 'didactic' && !app.thinking && canUndo(app.didactic),
    canRedo: app.mode === 'didactic' && !app.thinking && canRedo(app.didactic),
    labHold: app.labHold,
    speech: app.speech,
    thinking: app.thinking,
    over: report.over,
    placing: placing(),
    advantage: mat.advantage,
    moves: log,
    turn: placing() ? app.didactic.mineTurn : side(),
    energy: app.didactic?.energy,
    abilityUsed: app.didactic?.abilityUsed,
    abilities: ABILITIES.map((ability) => ({
      ...ability,
      active: app.ability === ability.type,
      disabled: !myTurn() || app.mode !== 'didactic' || abilityTargets(app.didactic, ability.type).length === 0,
    })),
    chat: app.chat,
    engine: engineMode(),
  });
  paintStatus(report);
  paintClocks(mat.advantage);
}

function engineMode() {
  if (app.engine === 'local' || !loadConfig().apiKey) return 'local';
  return 'api';
}

function paintStatus(report) {
  statusEl.className = 'status-line';
  statusEl.replaceChildren();
  const text = document.createElement('span');
  if (app.thinking) {
    statusEl.classList.add('thinking');
    const spin = document.createElement('i');
    spin.className = 'spinner';
    text.textContent = 'La IA está pensando';
    statusEl.append(spin, text);
    return;
  }
  if (placing()) text.textContent = `Mina de ${NAMES[app.didactic.mineTurn].toLowerCase()}: elige una casilla de tu mitad.`;
  else if (report.over) {
    text.textContent = report.result === 'draw'
      ? (REASONS[report.reason] || 'Tablas')
      : `${NAMES[report.result]} ganan. ${REASONS[report.reason] || ''}`.trim();
  } else if (app.labHold) text.textContent = 'Laboratorio: la IA está en pausa.';
  else if (app.ability === 'swap' && app.swapA) text.textContent = 'Elige la segunda pieza del intercambio.';
  else if (app.ability) text.textContent = 'Elige el objetivo de la habilidad.';
  else if (report.check) {
    statusEl.classList.add('check');
    text.textContent = 'Jaque';
  } else text.textContent = `Turno de ${NAMES[side()].toLowerCase()}.`;
  statusEl.appendChild(text);
}

function paintClocks(advantage = material(core()).advantage) {
  const bottom = app.orientation;
  const top = opposite(bottom);
  fillClock(clockTop, top);
  fillClock(clockBottom, bottom);
  fillCaptures(document.getElementById('captures-top'), top, advantage);
  fillCaptures(document.getElementById('captures-bottom'), bottom, advantage);
}

function fillClock(node, color) {
  node.className = 'clock';
  const active = !placing() && !ended().over && (app.clocks?.active === color);
  if (active) node.classList.add('active');
  const left = timeLeft(color);
  if (app.clocks && left < 10000) node.classList.add('low');
  node.replaceChildren();
  const who = document.createElement('div');
  who.className = 'who';
  const name = document.createElement('span');
  name.textContent = NAMES[color];
  who.appendChild(name);
  const time = document.createElement('b');
  time.textContent = app.clocks ? formatClock(left) : '∞';
  node.append(who, time);
}

function fillCaptures(node, color, advantage) {
  if (!node) return;
  node.replaceChildren();
  for (const type of core().taken?.[color] || []) {
    const icon = document.createElement('i');
    icon.innerHTML = pieceSVG(type, color === 'w' ? 'b' : 'w');
    node.appendChild(icon);
  }
  const ahead = color === 'w' ? advantage : -advantage;
  if (ahead > 0) {
    const score = document.createElement('b');
    score.textContent = `+${ahead}`;
    node.appendChild(score);
  }
}

function tick() {
  if (gameEl.hidden || !app.clocks?.active || ended().over) return;
  const color = app.clocks.active;
  if (timeLeft(color) <= 0) flag(color);
  else paintClocks();
}

function makeClock(kind) {
  const table = { '3+2': [180000, 2000], '5+0': [300000, 0], '10+0': [600000, 0], '15+10': [900000, 10000] };
  const spec = table[kind];
  if (!spec) return null;
  return { w: spec[0], b: spec[0], inc: spec[1], active: null, stamp: 0 };
}

function armClock() {
  if (!app.clocks || ended().over) return;
  app.clocks.active = side();
  app.clocks.stamp = Date.now();
}

function formatClock(ms) {
  if (!Number.isFinite(ms)) return '∞';
  const clamped = Math.max(0, ms);
  const total = Math.floor(clamped / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (clamped < 10000) return `${minutes}:${String(seconds).padStart(2, '0')}.${Math.floor((clamped % 1000) / 100)}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function timeLeft(color) {
  if (!app.clocks) return Infinity;
  if (app.clocks.active !== color) return app.clocks[color];
  return app.clocks[color] - (Date.now() - app.clocks.stamp);
}

function punch(color) {
  if (!app.clocks) return;
  const left = timeLeft(color);
  app.clocks = {
    ...app.clocks,
    [color]: left + app.clocks.inc,
    active: opposite(color),
    stamp: Date.now(),
  };
}

function pauseClock() {
  if (!app.clocks?.active) return;
  const color = app.clocks.active;
  app.clocks = { ...app.clocks, [color]: timeLeft(color), active: null, stamp: Date.now() };
}

function resumeClock() {
  if (!app.clocks || app.clocks.active || ended().over || placing()) return;
  app.clocks = { ...app.clocks, active: side(), stamp: Date.now() };
}

function kingSquare(pieces, color) {
  return pieces.findIndex((piece) => piece && piece.c === color && piece.t === 'k');
}

function lastSquares() {
  return app.mode === 'classic' ? app.classic.moves.at(-1) : app.didactic.log.at(-1);
}

function sqAlg(square) {
  return 'abcdefgh'[square & 7] + String((square >> 3) + 1);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let audio;
function resumeAudio() {
  audio = audio || new AudioContext();
  if (audio.state === 'suspended') audio.resume();
}
function soundFor(events = []) {
  if (!audio) return;
  const kind = events.includes('mate') ? 620 : events.includes('check') ? 520 : events.includes('mine') ? 90 : events.includes('capture') ? 180 : 340;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = kind;
  osc.type = events.includes('mine') ? 'sawtooth' : 'triangle';
  osc.connect(gain);
  gain.connect(audio.destination);
  const now = audio.currentTime;
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.start(now);
  osc.stop(now + 0.13);
}

function toast(text) {
  toastEl.hidden = false;
  toastEl.textContent = text;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

function wireApiDialog() {
  const open = document.getElementById('open-api');
  const form = document.getElementById('api-form');
  const key = document.getElementById('api-key');
  const endpoint = document.getElementById('api-endpoint');
  const model = document.getElementById('api-model');
  const custom = document.getElementById('api-model-custom');
  const result = document.getElementById('api-result');
  open.addEventListener('click', () => {
    const config = loadConfig();
    key.value = config.apiKey;
    endpoint.value = config.endpoint || DEFAULTS.endpoint;
    if (MODELS.includes(config.model)) {
      model.value = config.model;
      custom.value = '';
    } else {
      model.value = 'custom';
      custom.value = config.model;
    }
    result.textContent = '';
    dialog.showModal();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const chosen = model.value === 'custom' ? custom.value.trim() : model.value;
    saveConfig({
      apiKey: key.value.trim(),
      endpoint: endpoint.value.trim() || DEFAULTS.endpoint,
      model: chosen || DEFAULTS.model,
    });
    result.textContent = 'Guardado en este navegador.';
    app.engine = key.value.trim() ? 'api' : 'local';
    if (!gameEl.hidden) paint();
  });
  document.getElementById('api-test').addEventListener('click', async () => {
    saveConfig({
      apiKey: key.value.trim(),
      endpoint: endpoint.value.trim() || DEFAULTS.endpoint,
      model: (model.value === 'custom' ? custom.value.trim() : model.value) || DEFAULTS.model,
    });
    result.textContent = 'Probando…';
    const test = await testConnection();
    app.engine = test.ok ? 'api' : 'local';
    result.textContent = test.ok ? `Conectada: ${test.detail}` : `No respondió: ${test.detail}. El minimax local sigue disponible.`;
    if (!gameEl.hidden) paint();
  });
  document.getElementById('api-close').addEventListener('click', () => dialog.close());
}
