// Shared field pieces for the Family & settings panels (AI and app settings).
// They live outside the panels so inputs keep focus while typing.
export function Source({ ctx, k }) {
  const r = ctx.rows[k];
  if (!r) return null;
  if (r.source === 'saved') {
    return (
      <span className="ai-src saved">
        saved here
        <button type="button" className="link" onClick={() => ctx.save({ [k]: null }, r.envSet ? 'Back to the Unraid template value.' : 'Back to the default.')}>
          {r.envSet ? 'use template value' : 'use default'}
        </button>
      </span>
    );
  }
  return <span className="ai-src">{r.source === 'env' ? 'from Unraid template' : 'default'}</span>;
}

export function Secret({ ctx, k, label, help }) {
  const r = ctx.rows[k];
  return (
    <label>
      <span>{label} <Source ctx={ctx} k={k} /></span>
      <input
        type="password" autoComplete="new-password" spellCheck={false}
        placeholder={r.set ? `•••• ${r.hint} (type a new one to replace it)` : 'not set'}
        value={ctx.form[k]} onChange={ctx.set(k)}
      />
      {help && <small className="hint">{help}</small>}
    </label>
  );
}

export function Text({ ctx, k, label, placeholder, help, list }) {
  return (
    <label>
      <span>{label} <Source ctx={ctx} k={k} /></span>
      <input type="text" spellCheck={false} placeholder={placeholder ?? ctx.defaults?.[k] ?? ''} value={ctx.form[k]} onChange={ctx.set(k)} list={list} />
      {help && <small className="hint">{help}</small>}
    </label>
  );
}

export function Result({ ctx, target }) {
  const r = ctx.tests[target];
  if (!r) return null;
  if (r.pending) return <p className="ai-test" role="status">Checking…</p>;
  return <p className={`ai-test ${r.ok ? 'good' : 'bad'}`} role="status">{r.ok ? '🟢' : '🔴'} {r.message}</p>;
}
