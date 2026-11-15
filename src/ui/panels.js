/**
 * Rieles laterales: herramientas, material, habilidades, historial y chat.
 */

const NAMES = { w: 'Blancas', b: 'Negras' };

export function mountPanels(root, handlers) {
  const tools = root.querySelector('#tools');
  const material = root.querySelector('#material');
  const moves = root.querySelector('#moves');
  const energy = root.querySelector('#energy');
  const abilities = root.querySelector('#abilities');
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
      if (model.didactic) {
        const radar = button(model.radar ? 'Radar' : 'Radar', handlers.onRadar, false, 'Verde defendido, rojo atacado, ámbar disputado');
        radar.classList.toggle('on', model.radar);
        radar.textContent = model.radar ? 'Radar activo' : 'Radar';
        tools.append(radar);
        tools.append(button('Deshacer', handlers.onUndo, !model.canUndo));
        tools.append(button('Rehacer', handlers.onRedo, !model.canRedo));
        tools.append(button('Pista', handlers.onHint, model.thinking || model.over, 'Consejo sin decir la jugada'));
      }
      if (model.labHold) tools.append(button('Reanudar IA', handlers.onResume, false));
      const voice = button(model.speech ? 'Voz activa' : 'Voz', handlers.onSpeech, false, 'Lee la pieza y la casilla');
      voice.classList.toggle('on', model.speech);
      tools.append(voice);
      tools.append(button('Girar', handlers.onFlip, false));

      material.replaceChildren();
      const label = document.createElement('span');
      label.textContent = 'Material';
      const adv = document.createElement('strong');
      const value = model.advantage || 0;
      adv.textContent = value === 0 ? '0' : `${value > 0 ? '+' : ''}${value}`;
      material.append(label, adv);

      moves.replaceChildren();
      model.moves.forEach((entry, index) => {
        if (entry.color !== 'w') return;
        const row = document.createElement('li');
        const num = document.createElement('span');
        num.textContent = `${Math.floor(index / 2) + 1}`;
        const white = document.createElement('span');
        white.textContent = entry.san;
        row.append(num, white);
        const black = model.moves[index + 1];
        const dark = document.createElement('span');
        dark.textContent = black && black.color === 'b' ? black.san : '';
        row.appendChild(dark);
        moves.appendChild(row);
      });
      moves.scrollTop = moves.scrollHeight;

      const showPowers = Boolean(model.didactic);
      energy.hidden = !showPowers;
      abilities.hidden = !showPowers;
      if (showPowers) {
        energy.replaceChildren();
        for (const color of ['w', 'b']) {
          const line = document.createElement('p');
          line.textContent = `${NAMES[color].slice(0, 1)} ${model.energy?.[color] || 0}`;
          if (color === model.turn) line.className = 'turn';
          energy.appendChild(line);
        }
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
