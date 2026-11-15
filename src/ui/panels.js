/**
 * Panel lateral: historial, material, habilidades, radar y chat.
 */

const NAMES = { w: 'Blancas', b: 'Negras' };
const UNI = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' },
};

export function mountPanels(root, handlers) {
  root.innerHTML = '';
  const side = document.createElement('div');
  side.className = 'side';
  side.innerHTML = `
    <div class="tools"></div>
    <div class="tabs" role="tablist">
      <button type="button" data-tab="moves" class="on">Jugadas</button>
      <button type="button" data-tab="energy">Energía</button>
      <button type="button" data-tab="chat">Chat</button>
    </div>
    <section class="tab-panel on" data-panel="moves">
      <div class="material"></div>
      <ol class="moves"></ol>
    </section>
    <section class="tab-panel" data-panel="energy">
      <div class="energy"></div>
      <div class="abilities"></div>
      <ul class="legend"></ul>
    </section>
    <section class="tab-panel" data-panel="chat">
      <div class="chat-log"></div>
      <form class="chat-form">
        <input name="text" maxlength="400" placeholder="Habla con la IA sobre esta posición" autocomplete="off" />
        <button type="submit">Enviar</button>
      </form>
    </section>
    <div class="side-actions">
      <button type="button" data-act="resign">Rendirse</button>
      <button type="button" data-act="again">Revancha</button>
      <button type="button" data-act="setup">Modos</button>
    </div>
  `;
  const scroll = document.createElement('div');
  scroll.className = 'side-scroll';
  side.querySelectorAll('.tab-panel').forEach((panel) => scroll.appendChild(panel));
  side.insertBefore(scroll, side.querySelector('.side-actions'));
  root.appendChild(side);
  const tools = side.querySelector('.tools');
  const material = side.querySelector('.material');
  const moves = side.querySelector('.moves');
  const energy = side.querySelector('.energy');
  const abilities = side.querySelector('.abilities');
  const legend = side.querySelector('.legend');
  const chatLog = side.querySelector('.chat-log');
  const form = side.querySelector('.chat-form');
  const input = form.querySelector('input');

  side.querySelectorAll('.tabs button').forEach((button) => {
    button.addEventListener('click', () => {
      side.querySelectorAll('.tabs button').forEach((item) => item.classList.toggle('on', item === button));
      side.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('on', panel.dataset.panel === button.dataset.tab);
      });
    });
  });
  side.querySelector('[data-act="resign"]').addEventListener('click', handlers.onResign);
  side.querySelector('[data-act="again"]').addEventListener('click', handlers.onAgain);
  side.querySelector('[data-act="setup"]').addEventListener('click', handlers.onSetup);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handlers.onChat(text);
  });

  function button(label, action, disabled) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.disabled = disabled;
    el.addEventListener('click', action);
    return el;
  }

  return {
    update(model) {
      tools.replaceChildren();
      if (model.didactic) {
        const radar = button(model.radar ? 'Radar activo' : 'Radar de control', handlers.onRadar, false);
        radar.classList.toggle('on', model.radar);
        tools.append(radar);
        tools.append(button('Deshacer', handlers.onUndo, !model.canUndo));
        tools.append(button('Rehacer', handlers.onRedo, !model.canRedo));
        tools.append(button('Pista', handlers.onHint, model.thinking || model.over));
      }
      if (model.labHold) tools.append(button('Reanudar IA', handlers.onResume, false));
      const voice = button(model.speech ? 'Voz activa' : 'Voz', handlers.onSpeech, false);
      voice.classList.toggle('on', model.speech);
      tools.append(voice);
      tools.append(button('Girar', handlers.onFlip, false));

      material.replaceChildren();
      const adv = document.createElement('strong');
      const value = model.advantage || 0;
      adv.textContent = value === 0 ? 'Material igualado' : `${value > 0 ? '+' : ''}${value} para blancas`;
      material.appendChild(adv);

      moves.replaceChildren();
      model.moves.forEach((entry, index) => {
        if (entry.color === 'w') {
          const row = document.createElement('li');
          const num = document.createElement('span');
          num.textContent = `${Math.floor(index / 2) + 1}.`;
          const white = document.createElement('span');
          white.textContent = entry.san;
          row.append(num, white);
          const black = model.moves[index + 1];
          if (black && black.color === 'b') {
            const dark = document.createElement('span');
            dark.textContent = black.san;
            row.appendChild(dark);
          }
          moves.appendChild(row);
        }
      });
      moves.scrollTop = moves.scrollHeight;

      energy.hidden = !model.didactic;
      abilities.hidden = !model.didactic;
      legend.hidden = !model.didactic;
      if (model.didactic) {
        energy.replaceChildren();
        for (const color of ['w', 'b']) {
          const line = document.createElement('p');
          line.textContent = `${NAMES[color]}: ${model.energy?.[color] || 0} energía`;
          if (color === model.turn) line.className = 'turn';
          energy.appendChild(line);
        }
        const note = document.createElement('p');
        note.className = 'fine';
        note.textContent = model.abilityUsed
          ? 'Habilidad usada. Falta tu jugada.'
          : 'Una habilidad por turno, antes de mover. +1 al empezar y +2 si capturas.';
        energy.appendChild(note);
        abilities.replaceChildren();
        for (const ability of model.abilities || []) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'ability';
          el.disabled = ability.disabled;
          el.classList.toggle('on', ability.active);
          const name = document.createElement('strong');
          name.textContent = `${ability.name} · ${ability.cost}`;
          const text = document.createElement('small');
          text.textContent = ability.text;
          el.append(name, text);
          el.addEventListener('click', () => handlers.onAbility(ability.type));
          abilities.appendChild(el);
        }
        legend.replaceChildren();
        for (const line of [
          'Verde: lo controlás. Rojo: lo ataca el rival. Amarillo: disputado.',
          'd4 y e5 están elevadas: alfil, torre y dama no capturan ahí desde lejos.',
          'Dos capturas con la misma pieza: caballo con paso extra, torre fortificada o alfil místico.',
          'Cada bando esconde una mina en su mitad. Pisarla congela un turno.',
        ]) {
          const item = document.createElement('li');
          item.textContent = line;
          legend.appendChild(item);
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
        row.appendChild(document.createTextNode(` ${entry.text}`));
        chatLog.appendChild(row);
      }
      if (atBottom) chatLog.scrollTop = chatLog.scrollHeight;
      input.disabled = model.thinking;
      side.querySelector('[data-act="resign"]').disabled = model.over || model.placing;
    },
  };
}

export function capturedGlyphs(taken, color) {
  return (taken?.[color] || []).map((type) => UNI[color === 'w' ? 'b' : 'w'][type] || '').join('');
}

export { NAMES, UNI };
