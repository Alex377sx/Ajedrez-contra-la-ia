/**
 * Tablero y piezas. No decide si una jugada es legal.
 */

const FILE = { p: 'P', r: 'R', n: 'N', b: 'B', q: 'Q', k: 'K' };

const STAR = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.2 7.3 4.4 10.8 4.7 8.1 6.9 9 10.2 6 8.4 3 10.2 3.9 6.9 1.2 4.7 4.7 4.4z"/></svg>';
const FROST = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M2.2 3.2l7.6 5.6M9.8 3.2 2.2 8.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

export function pieceSrc(type, color) {
  const name = `${color}${FILE[type] || 'P'}.svg`;
  return new URL(`../../assets/pieces/${name}`, import.meta.url).href;
}

export function pieceSVG(type, color) {
  return `<img class="fig ${color}" src="${pieceSrc(type, color)}" alt="" draggable="false" />`;
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
