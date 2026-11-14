/**
 * Tablero, piezas y capas visuales. No decide si una jugada es legal.
 */

const FIGS = {
  p: '<circle cx="32" cy="16" r="8"/><path d="M23 28h18l-2 8H25z"/><path d="M20 40h24l3 6H17z"/><path d="M15 50h34v6H15z"/>',
  r: '<path d="M14 12h8v6h6v-6h8v6h6v-6h8v14H14z"/><path d="M18 26h28v16H18z"/><path d="M14 46h36v6H14z"/>',
  n: '<path d="M42 50H16c2-8 4-12 2-18 6 2 8-2 10-8-6 2-10-2-12-8 8 0 14 4 16 12 6-4 12 0 12 8 0 6-2 10-6 14z"/>',
  b: '<circle cx="32" cy="11" r="4"/><path d="M32 17c9 4 13 12 11 20H21c-2-8 2-16 11-20z"/><path d="M30 24h4v8h-4z"/><path d="M20 41h24l4 6H16z"/><path d="M14 51h36v6H14z"/>',
  q: '<circle cx="16" cy="14" r="3.2"/><circle cx="32" cy="9" r="3.2"/><circle cx="48" cy="14" r="3.2"/><path d="M12 18l8 18h24l8-18-8 7-12-9-12 9z"/><path d="M18 40h28l4 7H14z"/><path d="M13 51h38v6H13z"/>',
  k: '<path d="M30 4h4v7h7v4h-7v7h-4v-7h-7V11h7z"/><path d="M16 28h32l-4 14H20z"/><path d="M18 44h28l4 6H14z"/><path d="M13 54h38v6H13z"/>',
};

export function pieceSVG(type, color) {
  return `<svg class="fig ${color}" viewBox="0 0 64 64" aria-hidden="true">${FIGS[type] || ''}</svg>`;
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
      const piece = view.board[square];
      if (piece && !(drag && drag.moved && drag.sq === square)) {
        const holder = document.createElement('span');
        holder.className = `piece ${piece.c}`;
        if (view.frozen?.[piece.id]) holder.classList.add('frozen');
        holder.innerHTML = pieceSVG(piece.t, piece.c);
        if (view.veteran?.[piece.id]) {
          const badge = document.createElement('i');
          badge.className = 'badge vet';
          badge.textContent = '★';
          holder.appendChild(badge);
        }
        if (view.frozen?.[piece.id]) {
          const badge = document.createElement('i');
          badge.className = 'badge ice';
          badge.textContent = '❄';
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
      for (const type of ['q', 'r', 'b', 'n']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = pieceSVG(type, view.promoColor || 'w');
        button.addEventListener('click', () => handlers.onPromote(type));
        promo.appendChild(button);
      }
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
