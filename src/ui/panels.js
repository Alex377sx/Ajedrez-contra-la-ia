/**
 * Rieles laterales: herramientas, material, habilidades, historial y chat.
 */

const NAMES = { w: 'Blancas', b: 'Negras' };

export function mountPanels(root, handlers) {
  const tools = root.querySelector('#tools');
  const didactic = root.querySelector('#didactic');
  const didacticTools = root.querySelector('#didactic-tools');
  const movesBody = root.querySelector('#moves tbody');
  const history = root.querySelector('.history');
  const energy = root.querySelector('#energy');
  const abilities = root.querySelector('#abilities');
  const engineStatus = root.querySelector('#engine-status');
  const chatLog = root.querySelector('#chat-log');
  const form = root.querySelector('#chat-form');
  const input = form.querySelector('input');

  root.querySelector('[data-act="resign"]').addEventListener('click', handlers.onResign);
  root.querySelector('[data-act="again"]').addEventListener('click', handlers.onAgain);
  root.querySelector('[data-act="setup"]').addEventListener('click', handlers.onSetup);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handlers.onChat(text);
  });

  function button(label, action, disabled, title) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.disabled = disabled;
    if (title) el.title = title;
    el.addEventListener('click', action);
    return el;
  }

  return {
    update(model) {
      tools.replaceChildren();
      if (model.labHold) tools.append(button('Reanudar IA', handlers.onResume, false));
      const voice = button(model.speech ? 'Voz activa' : 'Voz', handlers.onSpeech, false, 'Lee la pieza y la casilla');
      voice.classList.toggle('on', model.speech);
      tools.append(voice);
      tools.append(button('Girar', handlers.onFlip, false));

      didactic.hidden = !model.didactic;
      didacticTools.replaceChildren();
      if (model.didactic) {
        const radar = button('Radar de control', handlers.onRadar, false, 'Verde defendido, rojo atacado, ámbar disputado');
        radar.classList.toggle('on', model.radar);
        didacticTools.append(radar);
        didacticTools.append(button('Pedir pista', handlers.onHint, model.thinking || model.over, 'Consejo sin decir la jugada'));
        didacticTools.append(button('Deshacer', handlers.onUndo, !model.canUndo));
        didacticTools.append(button('Rehacer', handlers.onRedo, !model.canRedo));
      }

      engineStatus.classList.toggle('api', model.engine === 'api');
      engineStatus.querySelector('b').textContent = model.engine === 'api' ? 'API conectada' : 'Motor local';

      movesBody.replaceChildren();
      model.moves.forEach((entry, index) => {
        if (entry.color !== 'w') return;
        const row = document.createElement('tr');
        const num = document.createElement('td');
        num.textContent = `${Math.floor(index / 2) + 1}`;
        const white = document.createElement('td');
        white.textContent = entry.san;
        const blackMove = model.moves[index + 1];
        const dark = document.createElement('td');
        dark.textContent = blackMove && blackMove.color === 'b' ? blackMove.san : '';
        row.append(num, white, dark);
        movesBody.appendChild(row);
      });
      history.scrollTop = history.scrollHeight;

      if (model.didactic) {
        const pool = model.energy?.[model.turn] || 0;
        energy.replaceChildren();
        const mana = document.createElement('div');
        mana.className = 'mana';
        const manaLabel = document.createElement('div');
        manaLabel.className = 'mana-label';
        const manaName = document.createElement('span');
        manaName.textContent = 'Energía';
        const manaValue = document.createElement('span');
        manaValue.textContent = String(pool);
        manaLabel.append(manaName, manaValue);
        const track = document.createElement('div');
        track.className = 'mana-track';
        const fill = document.createElement('div');
        fill.className = 'mana-fill';
        fill.style.width = `${Math.min(100, (pool / 10) * 100)}%`;
        track.appendChild(fill);
        mana.append(manaLabel, track);
        energy.appendChild(mana);
        abilities.replaceChildren();
        for (const ability of model.abilities || []) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'ability';
          el.disabled = ability.disabled;
          el.classList.toggle('on', ability.active);
          el.title = ability.text;
          el.textContent = `${ability.cost}  ${ability.name}`;
          el.addEventListener('click', () => handlers.onAbility(ability.type));
          abilities.appendChild(el);
        }
      }

      const atBottom = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 40;
      chatLog.replaceChildren();
      for (const entry of model.chat) {
        const row = document.createElement('p');
        row.className = `bubble ${entry.role}`;
        const who = document.createElement('b');
        who.textContent = entry.role === 'tu' ? 'Tú' : entry.role === 'rival' ? 'Rival' : entry.role === 'entrenador' ? 'Entrenador' : 'Mesa';
        row.appendChild(who);
        row.appendChild(document.createTextNode(entry.text));
        chatLog.appendChild(row);
      }
      if (atBottom) chatLog.scrollTop = chatLog.scrollHeight;
      input.disabled = model.thinking;
      root.querySelector('[data-act="resign"]').disabled = model.over || model.placing;
    },
  };
}

export { NAMES };
