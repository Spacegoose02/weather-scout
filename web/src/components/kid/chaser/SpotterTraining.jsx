import { useMemo, useState } from 'react';
import Quiz from '../../learn/Quiz.jsx';
import SpeakButton from '../SpeakButton.jsx';
import {
  EXAM_QUESTIONS, HAIL_SIZES, examQuestions, MODULES, PASS_EXAM, PASS_MODULE, buildReport, certificateHtml, moduleById, spotterStatus,
} from '../../../kid/chaser/spotter.js';
import '../../../learn/learn.css';
import '../../../kid/chaser/train.css';

// Junior Spotter Academy: five short lessons, a final exam and a certificate.
export default function SpotterTraining({ user, kid, today }) {
  const sp = kid.data.spotter || {};
  const status = spotterStatus(sp);
  const [id, setId] = useState(() => status.next?.id || 'exam');
  const save = (fn) => kid.update((prev) => ({ spotter: { ...(prev.spotter || {}), ...fn(prev.spotter || {}) } }));

  const passModule = (mid, right) => {
    save((p) => ({ modules: { ...(p.modules || {}), [mid]: Math.max(right, p.modules?.[mid] ?? 0) } }));
    if (right < PASS_MODULE) return;
    const after = spotterStatus({ ...sp, modules: { ...(sp.modules || {}), [mid]: right } });
    kid.earn(...(mid === 'safety' ? ['spotter-safety'] : []), ...(after.allPassed ? ['spotter-cadet'] : []));
  };

  return (
    <section className="card train-wide spotter">
      <div className="card-title">
        <h2>🎓 Junior Spotter Academy</h2>
        <span className="hint">{status.certified ? '📜 Certified Junior Storm Spotter' : `${status.passed.length} of ${MODULES.length} lessons passed`}</span>
      </div>
      <p className="hint">Storm spotters are the eyes of the weather service. This kid-sized course is based on the real spotter classes the National Weather Service teaches grown-ups. Pass all five lessons, then the final exam, to earn your certificate.</p>
      <ol className="spotter-path">
        {MODULES.map((m, i) => {
          const passed = status.passed.includes(m.id);
          return (
            <li key={m.id}>
              <button className={`${id === m.id ? 'active' : ''} ${passed ? 'passed' : ''}`} onClick={() => setId(m.id)} aria-current={id === m.id}>
                <span className="step" aria-hidden>{passed ? '✓' : i + 1}</span> <span aria-hidden>{m.emoji}</span> {m.title}
              </button>
            </li>
          );
        })}
        <li>
          <button className={`${id === 'exam' ? 'active' : ''} ${status.certified ? 'passed' : ''}`} onClick={() => setId('exam')} aria-current={id === 'exam'}>
            <span className="step" aria-hidden>{status.certified ? '✓' : '★'}</span> <span aria-hidden>📜</span> Final exam
          </button>
        </li>
      </ol>
      {id === 'exam' ? (
        <Exam status={status} sp={sp} user={user} today={today} onPass={(score, name) => {
          save((p) => ({ exam: Math.max(score, p.exam || 0), certDate: p.certDate || today, name: name || p.name }));
          kid.earn('spotter-certified');
        }} onName={(name) => save(() => ({ name }))} />
      ) : (
        <Module key={id} module={moduleById[id]} best={sp.modules?.[id]} onDone={(right) => passModule(id, right)} onNext={() => {
          const i = MODULES.findIndex((m) => m.id === id);
          setId(MODULES[i + 1]?.id || 'exam');
        }} />
      )}
    </section>
  );
}

function Module({ module: m, best, onDone, onNext }) {
  const [tries, setTries] = useState(0);
  const [result, setResult] = useState(null);
  const passed = result != null && result >= PASS_MODULE;
  return (
    <div className="spotter-module">
      <h3>{m.emoji} {m.title}</h3>
      <p>{m.intro}</p>
      <SpeakButton text={() => [m.intro, ...m.cards.map((c) => `${c.title}. ${c.body}`)].join(' ')} label="Read the lesson to me" />
      <ul className="spotter-cards">
        {m.cards.map((c) => (
          <li key={c.title}>
            <span className="emoji" aria-hidden>{c.emoji}</span>
            <div><strong>{c.title}</strong><p>{c.body}</p></div>
          </li>
        ))}
      </ul>
      {m.id === 'measure' && <HailRuler />}
      {m.id === 'report' && <ReportBuilder />}
      <Quiz key={tries} questions={m.quiz} title={`Lesson check (${PASS_MODULE} of ${m.quiz.length} to pass)`} onDone={(right) => {
        setResult(right);
        onDone(right);
      }} />
      {result != null && (
        <div className="row">
          {passed ? <p className="quiz-score">✅ Lesson passed!</p> : <p className="quiz-score">So close! Read the cards again and retry.</p>}
          {!passed && <button onClick={() => { setTries(tries + 1); setResult(null); }}>Try again</button>}
          {passed && <button onClick={onNext}>Next lesson →</button>}
        </div>
      )}
      {result == null && best >= PASS_MODULE && <p className="hint">✅ You already passed this lesson. You can take the check again for practice.</p>}
    </div>
  );
}

// Hail sizes drawn to scale, compared with everyday things.
function HailRuler() {
  return (
    <div className="hail-ruler" aria-label="Hail sizes, drawn to scale">
      {HAIL_SIZES.map((h) => (
        <figure key={h.id} className={h.severe ? 'severe' : ''}>
          <svg viewBox="0 0 100 100" style={{ width: `${Math.max(14, h.inches * 22)}px` }} aria-hidden>
            <circle cx="50" cy="50" r="46" className="stone" />
            <circle cx="50" cy="50" r="30" className="layer" />
            <circle cx="50" cy="50" r="14" className="layer" />
          </svg>
          <figcaption>{h.label}<small>{h.inches}″{h.severe ? ' · severe' : ''}</small></figcaption>
        </figure>
      ))}
    </div>
  );
}

const WHAT = [
  ['hail', '🧊 Hail'], ['rotating wall cloud', '🧱 Rotating wall cloud'], ['funnel cloud', '🌀 Funnel cloud'],
  ['tree branches down', '🌳 Branches down'], ['water over the road', '🌊 Water over the road'],
];
const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

function ReportBuilder() {
  const [r, setR] = useState({ who: 'Junior spotter at home', what: 'hail', hail: 'quarter', distance: '2', direction: 'west', time: '' });
  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const text = buildReport({ ...r, time: r.time ? new Date(`2000-01-01T${r.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '' });
  return (
    <div className="report-builder">
      <h4>📝 Practice report</h4>
      <div className="report-fields">
        <label>What<select value={r.what} onChange={(e) => set({ what: e.target.value })}>{WHAT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {r.what === 'hail' && <label>Size<select value={r.hail} onChange={(e) => set({ hail: e.target.value })}>{HAIL_SIZES.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}</select></label>}
        <label>How far<select value={r.distance} onChange={(e) => set({ distance: e.target.value })}>{['0', '1', '2', '3', '5', '10'].map((d) => <option key={d} value={d}>{d === '0' ? 'Right here' : `${d} mile${d === '1' ? '' : 's'}`}</option>)}</select></label>
        {r.distance !== '0' && <label>Which way<select value={r.direction} onChange={(e) => set({ direction: e.target.value })}>{DIRS.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>}
        <label>When<input type="time" value={r.time} onChange={(e) => set({ time: e.target.value })} /></label>
      </div>
      <p className="report-out">“{text}”</p>
      <SpeakButton text={text} label="Say my report" />
    </div>
  );
}

function Exam({ status, sp, user, today, onPass, onName }) {
  const [seed, setSeed] = useState(() => Date.now());
  const [taking, setTaking] = useState(false);
  const [result, setResult] = useState(null);
  const [name, setName] = useState(sp.name || user?.displayName || '');

  if (!status.examReady) {
    return (
      <div className="spotter-module">
        <h3>📜 Final exam</h3>
        <p>Pass all five lessons to unlock the final exam. Next up: <strong>{status.next.emoji} {status.next.title}</strong>.</p>
      </div>
    );
  }

  const printCert = () => {
    const w = window.open('', '_blank', 'width=1100,height=800');
    if (!w) {
      window.alert('Your browser blocked the certificate window. Allow pop-ups for Weather Scout and try again.');
      return;
    }
    w.document.write(certificateHtml({ name: name.trim() || 'Junior Spotter', date: sp.certDate || today, score: sp.exam ?? result }));
    w.document.close();
    w.focus();
  };

  return (
    <div className="spotter-module">
      <h3>📜 Final exam</h3>
      {(status.certified || (result != null && result >= PASS_EXAM)) && (
        <div className="cert-ready">
          <p className="quiz-score">🎉 You are a certified Junior Storm Spotter!</p>
          <label>Name on the certificate
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => onName(name.trim())} placeholder="Your name" />
          </label>
          <button onClick={printCert}>🖨️ Print my certificate</button>
        </div>
      )}
      {!taking ? (
        <>
          <p>{EXAM_QUESTIONS} questions from all five lessons. Get {PASS_EXAM} right to earn your Junior Storm Spotter certificate.</p>
          <button onClick={() => { setSeed(Date.now()); setResult(null); setTaking(true); }}>{status.certified ? 'Take the exam again' : 'Start the final exam'}</button>
        </>
      ) : (
        <ExamQuiz seed={seed} onDone={(right) => {
          setResult(right);
          if (right >= PASS_EXAM) onPass(right, name.trim());
        }} onAgain={() => { setSeed(Date.now()); setResult(null); }} result={result} />
      )}
    </div>
  );
}

function ExamQuiz({ seed, onDone, result, onAgain }) {
  const qs = useMemo(() => examQuestions(seed), [seed]);
  return (
    <>
      <Quiz key={seed} questions={qs} title="Final exam" onDone={onDone} />
      {result != null && result < PASS_EXAM && (
        <div className="row">
          <p className="quiz-score">You got {result}. You need {PASS_EXAM} to pass. Review the lessons and try again!</p>
          <button onClick={onAgain}>Try again</button>
        </div>
      )}
    </>
  );
}
