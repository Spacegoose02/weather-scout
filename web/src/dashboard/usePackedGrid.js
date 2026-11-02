import { useLayoutEffect, useState } from 'react';

// Masonry-style packing for the dashboard grid. The grid uses 1px rows (see
// .dash-grid.packed); each card spans as many rows as it is tall plus the gap.
// Cards keep their custom order: CSS grid drops each one into the earliest
// spot that fits after the card before it, which fills the shortest column.
export function spanFor(height, gap) {
  return Math.max(1, Math.ceil(height + gap));
}

export function usePackedGrid(ref) {
  const [packed, setPacked] = useState(false);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      for (const item of grid.children) {
        if (!item.matches('.dash-item')) continue;
        const h = item.getBoundingClientRect().height;
        const end = h ? `span ${spanFor(h, gap)}` : '';
        if (item.style.gridRowEnd !== end) item.style.gridRowEnd = end;
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    const ro = new ResizeObserver(schedule);
    const watch = () => {
      ro.disconnect();
      for (const item of grid.children) ro.observe(item);
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
      if (frame) cancelAnimationFrame(frame);
      for (const item of grid.children) item.style.gridRowEnd = '';
    };
  }, [ref]);

  return packed;
}
