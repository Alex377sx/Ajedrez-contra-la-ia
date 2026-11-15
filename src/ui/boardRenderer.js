/**
 * Tablero y piezas. No decide si una jugada es legal.
 */

const FIGS = {
  p: '<path d="M32 7.2c-5.4 0-9.4 3.8-9.4 8.6 0 3.4 1.9 6.2 4.7 7.6-5 1.7-8.8 6-8.8 11.6 0 2.2.5 3.8 1.4 4.8h24.2c.9-1 1.4-2.6 1.4-4.8 0-5.6-3.8-9.9-8.8-11.6 2.8-1.4 4.7-4.2 4.7-7.6 0-4.8-4-8.6-9.4-8.6z"/><path d="M17.5 43.2h29l3.4 6.4c.7 1.3.2 2.4-1.1 2.8-2.8 1.1-6.4 1.7-10.8 1.7s-8-.6-10.8-1.7c-1.3-.4-1.8-1.5-1.1-2.8l3.4-6.4z"/><path d="M15 56.2h34v6.2H15z"/>',
  r: '<path d="M14 10h8.2v6.2h5.2V10h9.2v6.2h5.2V10H50v12.4H14z"/><path d="M18.2 22.4h27.6v20.2H18.2z"/><path d="M15.2 42.6h33.6l2.2 5.2H13z"/><path d="M13 53.6h38v6.4H13z"/>',
  n: '<path d="M12.5 58.5h39v-6.2h-39z"/><path d="M18 50.2c.4-7.2 1.2-12.6-.6-18.4 5.6 2.2 9.2-1.2 12.6-8.8-7.4 2.4-13.2-1.2-15.4-9.6 9.6.6 16.8 5.6 20.6 14.2 3.6-2.2 8.8-.6 11.2 4.6 2.6 5.6 1.2 12.4-3.2 16.8-1.6.2-8.4 1.2-25.2 1.2z"/><circle cx="24.2" cy="22.4" r="1.7" fill="#0d0f12"/>',
  b: '<circle cx="32" cy="9.2" r="3.3"/><path d="M32 14.2c7.6 3.2 12.4 10.2 11.2 18.2-4.2-3.4-7.2-3.6-11.2-1.2-4-2.4-7-2.2-11.2 1.2C19.6 24.4 24.4 17.4 32 14.2z"/><path d="M28.6 24.2h6.8v9.2h-6.8z"/><path d="M19.2 34.6h25.6c1.6 4.4 1.2 7.6-.6 9.6H19.8c-1.8-2-2.2-5.2-.6-9.6z"/><path d="M16.4 46.4h31.2l2.4 4.8c.5 1 .1 1.8-.9 2.2-2.6.8-6 1.3-9.1 1.3s-6.5-.5-9.1-1.3c-1-.4-1.4-1.2-.9-2.2l2.4-4.8z"/><path d="M14.6 56.4h34.8v6H14.6z"/>',
  q: '<circle cx="14.5" cy="14" r="3.1"/><circle cx="23.2" cy="9.2" r="3.1"/><circle cx="32" cy="7.2" r="3.3"/><circle cx="40.8" cy="9.2" r="3.1"/><circle cx="49.5" cy="14" r="3.1"/><path d="M12.6 18.2 18.8 36h26.4l6.2-17.8-7.2 6.2L32 16.6l-12.2 7.8z"/><path d="M18.4 38.2h27.2l3.6 7.2c.6 1.2.1 2.2-1.1 2.6-3 1-7 1.6-10.1 1.6s-7.1-.6-10.1-1.6c-1.2-.4-1.7-1.4-1.1-2.6l3.6-7.2z"/><path d="M14 52.2h36v6.4H14z"/>',
  k: '<path d="M29.2 4.2h5.6v6.2h6.4v5.6h-6.4v6.4h-5.6v-6.4h-6.4V10.4h6.4z"/><path d="M16.8 24.6h30.4l-2.2 8.6c4.2 1.6 7 5.2 7 9.6 0 2.4-.6 4-1.6 5.2H13.6c-1-1.2-1.6-2.8-1.6-5.2 0-4.4 2.8-8 7-9.6z"/><path d="M17.6 50.2h28.8l2.6 5c.5 1 .1 1.8-1 2.2-2.8.8-6.6 1.3-10 1.3s-7.2-.5-10-1.3c-1.1-.4-1.5-1.2-1-2.2z"/><path d="M14.2 60.2h35.6v5.4H14.2z"/>',
};

const STAR = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.2 7.3 4.4 10.8 4.7 8.1 6.9 9 10.2 6 8.4 3 10.2 3.9 6.9 1.2 4.7 4.7 4.4z"/></svg>';
const FROST = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M2.2 3.2l7.6 5.6M9.8 3.2 2.2 8.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

export function pieceSVG(type, color) {
  return `<svg class="fig ${color}" viewBox="0 0 64 68" aria-hidden="true">${FIGS[type] || ''}</svg>`;
}

export function mountBoard(root, handlers) {
  root.innerHTML = '';
  const frame = document.createElement('div');
  frame.className = 'board-frame';
  const board = document.createElement('div');
  board.className = 'board';
  board.setAttribute('role', 'grid');
  frame.appendChild(board);
  const promo = document.createElement('div');
  promo.className = 'promo';
  promo.hidden = true;
  frame.appendChild(promo);
  root.appendChild(frame);
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.hidden = true;
  document.body.appendChild(ghost);

  const cells = [];
  for (let visual = 0; visual < 64; visual += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sq';
    board.appendChild(button);
    cells.push(button);
  }

  let view = null;
  let drag = null;
  let suppressClick = false;

  function chessSquare(visual) {
    const row = Math.floor(visual / 8);
    const col = visual % 8;
    if (!view || view.orientation !== 'b') return (7 - row) * 8 + col;
    return row * 8 + (7 - col);
  }

  function paint() {
    if (!view) return;
    const files = 'abcdefgh';
    cells.forEach((cell, visual) => {
      const square = chessSquare(visual);
      const file = square & 7;
      const rank = square >> 3;
      const row = Math.floor(visual / 8);
      const col = visual % 8;
      cell.dataset.sq = String(square);
      cell.className = 'sq';
      if (((file + rank) & 1) === 0) cell.classList.add('dark');
      else cell.classList.add('light');
      if (view.heat && view.heat[square]) cell.classList.add(`heat-${view.heat[square]}`);
      if (view.elevated?.includes(square)) cell.classList.add('elevated');
      if (view.placement && inHalf(square, view.placement)) cell.classList.add('half');
      if (view.last && (view.last.from === square || view.last.to === square)) cell.classList.add('last');
      if (view.selected === square) cell.classList.add('selected');
      if (view.checkSq === square) cell.classList.add('check');
      if (view.mine === square) cell.classList.add('mine');
      const mark = view.marks?.find((item) => item.sq === square);
      if (mark) cell.classList.add(mark.capture ? 'capture' : 'dot');
      if (view.ability?.includes(square)) cell.classList.add('ability');
      if (view.hanging?.includes(square)) cell.classList.add('hanging');
      cell.replaceChildren();
      if ((view.orientation === 'b' ? col === 7 : col === 0)) {
        const rankLabel = document.createElement('span');
        rankLabel.className = 'coord rank';
        rankLabel.textContent = String(rank + 1);
        cell.appendChild(rankLabel);
      }
      if ((view.orientation === 'b' ? row === 0 : row === 7)) {
        const fileLabel = document.createElement('span');
        fileLabel.className = 'coord file';
        fileLabel.textContent = files[file];
        cell.appendChild(fileLabel);
      }
      if (mark) {
        const hint = document.createElement('span');
        hint.className = 'hint';
        cell.appendChild(hint);
      }
      const piece = view.board[square];
      if (piece && !(drag && drag.moved && drag.sq === square)) {
        const holder = document.createElement('span');
        holder.className = `piece ${piece.c}`;
        if (view.frozen?.[piece.id]) holder.classList.add('frozen');
        holder.innerHTML = pieceSVG(piece.t, piece.c);
        if (view.veteran?.[piece.id]) {
          const badge = document.createElement('i');
          badge.className = 'badge vet';
          badge.innerHTML = STAR;
          holder.appendChild(badge);
        }
        if (view.frozen?.[piece.id]) {
          const badge = document.createElement('i');
          badge.className = 'badge ice';
          badge.innerHTML = FROST;
          holder.appendChild(badge);
        }
        cell.appendChild(holder);
        if (view.animate && view.animate.to === square) {
          const fromVisual = visualOf(view.animate.from);
          const dx = (colOf(fromVisual) - col) * cell.offsetWidth;
          const dy = (rowOf(fromVisual) - row) * cell.offsetHeight;
          holder.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => {
            holder.style.transform = '';
          });
        }
      }
    });
    promo.hidden = !view.promo;
    promo.replaceChildren();
    if (view.promo) {
      const title = document.createElement('p');
      title.textContent = 'Coronación';
      promo.appendChild(title);
      const row = document.createElement('div');
      for (const type of ['q', 'r', 'b', 'n']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = pieceSVG(type, view.promoColor || 'w');
        button.addEventListener('click', () => handlers.onPromote(type));
        row.appendChild(button);
      }
      promo.appendChild(row);
    }
  }

  function visualOf(square) {
    for (let visual = 0; visual < 64; visual += 1) {
      if (chessSquare(visual) === square) return visual;
    }
    return 0;
  }
  function colOf(visual) { return visual % 8; }
  function rowOf(visual) { return Math.floor(visual / 8); }

  function stopDrag(event) {
    if (!drag) return;
    const start = drag.sq;
    const moved = drag.moved;
    drag = null;
    ghost.hidden = true;
    ghost.innerHTML = '';
    window.removeEventListener('pointermove', followDrag);
    window.removeEventListener('pointerup', stopDrag);
    if (!moved) return;
    suppressClick = true;
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-sq]');
    paint();
    if (hit) handlers.onDrop(start, Number(hit.dataset.sq));
  }
  board.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const cell = event.target.closest?.('[data-sq]');
    if (!cell || !view || view.locked) return;
    handlers.onSquare(Number(cell.dataset.sq));
  });
  function followDrag(event) {
    if (!drag || !view) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
    const piece = view.board[drag.sq];
    if (!piece || piece.c !== view.mover) return;
    if (!drag.moved) {
      drag.moved = true;
      paint();
    }
    ghost.hidden = false;
    ghost.className = `ghost ${piece.c}`;
    ghost.innerHTML = pieceSVG(piece.t, piece.c);
    ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  }
  board.addEventListener('pointerdown', (event) => {
    const cell = event.target.closest?.('[data-sq]');
    if (!cell || !view || view.locked) return;
    drag = { sq: Number(cell.dataset.sq), x: event.clientX, y: event.clientY, moved: false };
    window.addEventListener('pointermove', followDrag);
    window.addEventListener('pointerup', stopDrag);
  });

  return {
    update(next) {
      view = next;
      paint();
    },
    destroy() {
      ghost.remove();
    },
  };
}

function inHalf(square, color) {
  const rank = square >> 3;
  return color === 'w' ? rank <= 3 : rank >= 4;
}
