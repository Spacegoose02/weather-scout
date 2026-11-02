// Rocky the raccoon, the face of Weather Scout. The base art is the brand
// illustration (web/public/rocky/rocky.webp, built from docs/brand/rocky-master.png
// by scripts/make-brand-assets.py). Outfit pieces are drawn on top of it in the
// master art's 1024x1024 coordinates, based on what the weather calls for. The
// pieces live in shared/rocky-outfit.js so the server can draw the same Rocky for
// other family apps (/api/connect/rocky.svg).
import { BODY, moodBadgeSvg, outfitSvg, rockyLabel } from '../../../shared/rocky-outfit.js';

export default function Raccoon({ items = [], mood = 'happy', size = 220 }) {
  // The markup is built only from the fixed drawings in shared/rocky-outfit.js;
  // item names pick pieces and are never written into it.
  const art = `<image href="/rocky/rocky.webp" x="${BODY.x}" y="${BODY.y}" width="${BODY.w}" height="${BODY.h}"/>${outfitSvg(items)}`;
  const badge = moodBadgeSvg(mood);
  return (
    <svg
      viewBox={`${BODY.x} ${BODY.y} ${BODY.w} ${BODY.h}`}
      width={size}
      height={Math.round((size * BODY.h) / BODY.w)}
      role="img"
      aria-label={rockyLabel(items)}
      className={`raccoon mood-${mood}`}
    >
      <g className="rocky" dangerouslySetInnerHTML={{ __html: art }} />
      {badge && <g dangerouslySetInnerHTML={{ __html: badge }} />}
    </svg>
  );
}
