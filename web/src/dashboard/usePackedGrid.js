import { useLayoutEffect, useState } from 'react';

// Masonry-style packing for the dashboard grid. The grid uses 1px rows (see
// .dash-grid.packed) and every card gets an explicit column and row.
//
// Cards only start on their own size's column lines (on the 6-column grid a
// small card starts at column 1, 3 or 5 and a medium one at 1 or 4), so they
// line up in tidy columns instead of landing wherever the browser's
// auto-placement finds the next free cell. In order, each card goes into the
// slot whose top is highest, which fills the shortest column first.
export function spanFor(height, gap) {
  return Math.max(1, Math.ceil(height + gap));
}

// How many grid columns a card of this size covers when the grid has `cols`.
// 6 columns: s = 2, m = 3, l = 6. 2 columns (tablets): s and m = 1, l = 2.
export function columnsFor(size, cols) {
  if (size === 'l') return cols;
  return Math.max(1, Math.min(cols, Math.round(cols * (size === 's' ? 1 / 3 : 1 / 2))));
}

// items: [{ span, height }] in page order. Returns [{ col, span, row, rows }]: a
// 0-based column, its width in columns, and its row and height in 1px rows,
// or null for a hidden card (height 0).
export function placeCards(items, cols, gap) {
  const tops = new Array(cols).fill(0);
  return items.map(({ span, height }) => {
    if (!height) return null;
    const w = Math.max(1, Math.min(cols, span));
    let best = 0;
    let bestTop = Infinity;
    for (let start = 0; start + w <= cols; start += w) {
      const top = Math.max(...tops.slice(start, start + w));
      if (top < bestTop) { bestTop = top; best = start; }
    }
    const rows = spanFor(height, gap);
    for (let c = best; c < best + w; c++) tops[c] = bestTop + rows;
    return { col: best, span: w, row: bestTop, rows };
  });
}

const sizeOf = (item) => (item.classList.contains('size-l') ? 'l' : item.classList.contains('size-s') ? 's' : 'm');

export function usePackedGrid(ref) {
  const [packed, setPacked] = useState(false);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const style = getComputedStyle(grid);
      const gap = parseFloat(style.columnGap) || 0;
      const cols = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
      const items = [...grid.children];
      const places = placeCards(items.map((item) => ({
        span: item.matches('.dash-item') ? columnsFor(sizeOf(item), cols) : cols,
        height: item.getBoundingClientRect().height,
      })), cols, gap);
      items.forEach((item, i) => {
        const p = places[i];
        const column = p ? `${p.col + 1} / span ${p.span}` : '';
        const row = p ? `${p.row + 1} / span ${p.rows}` : '';
        if (item.style.gridColumn !== column) item.style.gridColumn = column;
        if (item.style.gridRow !== row) item.style.gridRow = row;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    const ro = new ResizeObserver(schedule);
    // A card's size (S, M, L) is its class, so watch that as well as its height.
    const sizes = new MutationObserver(schedule);
    const watch = () => {
      ro.disconnect();
      sizes.disconnect();
      ro.observe(grid); // the column count changes with the window width
      for (const item of grid.children) {
        ro.observe(item);
        sizes.observe(item, { attributes: true, attributeFilter: ['class'] });
      }
    };
    // Cards are added, removed and moved while customizing.
    const mo = new MutationObserver(() => { watch(); schedule(); });
    mo.observe(grid, { childList: true });
    watch();
    measure();
    setPacked(true);

    return () => {
      ro.disconnect();
      mo.disconnect();
      sizes.disconnect();
      if (frame) cancelAnimationFrame(frame);
      for (const item of grid.children) {
        item.style.gridColumn = '';
        item.style.gridRow = '';
      }
    };
  }, [ref]);

  return packed;
}
