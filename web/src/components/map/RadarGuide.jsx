import { guideFor } from './radarGuide.js';

// "What am I seeing?" box for the one-radar products: a kid-friendly
// explanation, what to look for, and a button to flip to the product that
// gives a second opinion.
export default function RadarGuide({ product, legend, full, site, products = [], onPick }) {
  const guide = guideFor(product);
  if (!guide) return null;
  const pair = products.find((p) => p.id === guide.pair);
  // On a phone the full-screen map is small, so start folded up there.
  const small = full && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches;
  return (
    <details className={`radar-guide ${full ? 'floating' : ''}`} key={product.id} open={!small}>
      <summary>
        <span className="rg-emoji" aria-hidden="true">{guide.emoji}</span>
        <span><b>What am I seeing?</b> {guide.title}</span>
      </summary>
      <p>{guide.body}</p>
      {!full && product.legend !== 'dbz' && (
        <div className="radar-legend" aria-label={`${legend.label} color scale`}>
          <span className="lg-label">{legend.label}</span>
          <span className="lg-bar" style={{ background: `linear-gradient(90deg, ${legend.stops.join(', ')})` }} />
          <span className="lg-ends">{legend.ends.map((e, i) => <span key={i}>{e}</span>)}</span>
        </div>
      )}
      <p className="rg-look-h">Look for</p>
      <ul>{guide.look.map((l) => <li key={l}>{l}</li>)}</ul>
      {guide.safety && <p className="rg-safety">⚠️ {guide.safety}</p>}
      <div className="rg-foot">
        <span>{site ? `${site.id} · ${site.name}` : 'Tap a radar pin to pick one'}</span>
        {pair && <button type="button" onClick={() => onPick(pair.id)}>Compare with {pair.name} →</button>}
      </div>
    </details>
  );
}
