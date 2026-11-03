import { useMemo, useState } from 'react';
import Quiz from '../../learn/Quiz.jsx';
import SpeakButton from '../SpeakButton.jsx';
import RadarScope from './RadarScope.jsx';
import {
  ACE_SCORE, CHALLENGE_KINDS, CHALLENGE_ROUNDS, COUPLET, RADAR_LESSONS, SCENES, challengeRounds, hitTarget, lessonById, radarStatus,
} from '../../../kid/chaser/radar.js';
import '../../../learn/learn.css';
import '../../../kid/chaser/train.css';

// Radar Detective: learn to read storm radar like a forecaster, one pattern at
// a time, then name storms in the challenge.
export default function RadarDetective({ kid }) {
  const rd = kid.data.radarDetective || {};
  const status = radarStatus(rd);
  const firstUndone = RADAR_LESSONS.find((l) => rd.lessons?.[l.id] == null) || RADAR_LESSONS[0];
  const [id, setId] = useState(firstUndone.id);
  const lesson = lessonById[id];

  const save = (patch) => kid.update((prev) => ({ radarDetective: { ...(prev.radarDetective || {}), ...patch(prev.radarDetective || {}) } }));

  const finishLesson = (right) => {
    save((p) => ({ lessons: { ...(p.lessons || {}), [lesson.id]: Math.max(right, p.lessons?.[lesson.id] ?? 0) } }));
    const after = radarStatus({ ...rd, lessons: { ...(rd.lessons || {}), [lesson.id]: right } });
    kid.earn('radar-rookie', ...(after.all ? ['radar-detective'] : []));
  };

  return (
    <>
      <section className="card train-wide radar-detective">
        <div className="card-title">
          <h2>🕵️ Radar Detective</h2>
          <span className="hint">{status.done} of {status.total} lessons solved</span>
        </div>
        <div className="train-pills" role="tablist" aria-label="Radar lessons">
          {RADAR_LESSONS.map((l) => (
            <button key={l.id} role="tab" aria-selected={l.id === id} className={l.id === id ? 'active' : ''} onClick={() => setId(l.id)}>
              <span aria-hidden>{rd.lessons?.[l.id] != null ? '✅' : l.emoji}</span> {l.title}
            </button>
          ))}
        </div>
        <Lesson key={lesson.id} lesson={lesson} found={!!rd.found?.[lesson.id]} onFound={() => save((p) => ({ found: { ...(p.found || {}), [lesson.id]: 1 } }))} onQuiz={finishLesson} />
      </section>
      <Challenge best={status.best} onScore={(score) => {
        save((p) => ({ best: Math.max(score, p.best || 0) }));
        if (score >= ACE_SCORE) kid.earn('radar-ace');
      }} />
    </>
  );
}

function Lesson({ lesson, found, onFound, onQuiz }) {
  const [mark, setMark] = useState(null);
  const target = lesson.scene === 'velocity' ? COUPLET : SCENES[lesson.scene].target;
  const hit = mark?.hit;
  return (
    <div className="radar-lesson">
      <div className="radar-lesson-text">
        <h3>{lesson.emoji} {lesson.title}</h3>
        <p>{lesson.say}</p>
        <SpeakButton text={lesson.say} label="Read it to me" />
        <h4>Look for</h4>
        <ul className="look-for">{lesson.look.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
      <div className="radar-lesson-scope">
        <p className="radar-find"><strong>🔎 Detective task:</strong> {lesson.find}</p>
        <RadarScope
          scene={lesson.scene}
          label={lesson.find}
          mark={mark}
          onTap={(tap) => {
            const ok = hitTarget(target, tap);
            setMark({ ...tap, hit: ok });
            if (ok && !found) onFound();
          }}
        />
        {mark && <p className={`radar-found ${hit ? 'yes' : 'no'}`} role="status">{hit ? `🎉 ${lesson.found}` : '🤔 Not quite. Look again at the clues and tap another spot.'}</p>}
        {!mark && found && <p className="hint">✅ You already solved this one. Tap to try again.</p>}
      </div>
      <div className="radar-lesson-quiz">
        <Quiz questions={lesson.quiz} quizId={`radar-${lesson.id}`} onDone={onQuiz} />
      </div>
    </div>
  );
}

function Challenge({ best, onScore }) {
  const [seed, setSeed] = useState(null);
  const rounds = useMemo(() => (seed == null ? [] : challengeRounds(seed)), [seed]);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState([]);
  const start = () => {
    setSeed(Math.floor(Math.random() * 100000));
    setI(0);
    setAnswers([]);
  };
  const round = rounds[i];
  const picked = answers[i];
  const score = answers.filter((a, k) => a === rounds[k]?.answer).length;
  const over = rounds.length > 0 && answers.length === rounds.length && i === rounds.length - 1;

  return (
    <section className="card train-wide radar-challenge">
      <div className="card-title">
        <h2>📡 Radar challenge</h2>
        <span className="hint">{best ? `Best: ${best} of ${CHALLENGE_ROUNDS}` : `Name ${ACE_SCORE} of ${CHALLENGE_ROUNDS} to become a Radar Ace`}</span>
      </div>
      {!round ? (
        <>
          <p>Forecasters look at radar all day. Can you name each storm just by its shape? Six radar pictures, one guess each.</p>
          <button onClick={start}>Start the challenge 🕵️</button>
        </>
      ) : (
        <div className="challenge-body">
          <div>
            <p className="hint">Storm {i + 1} of {rounds.length}</p>
            <RadarScope scene={round.name} seed={round.seed % 97 + 1} ox={round.ox} oy={round.oy} label="Which kind of storm is this?" />
          </div>
          <div>
            <p><strong>What kind of storm is this?</strong></p>
            <div className="challenge-options">
              {CHALLENGE_KINDS.map((k) => (
                <button
                  key={k.kind}
                  className={`ghost ${picked == null ? '' : k.kind === round.answer ? 'right' : k.kind === picked ? 'wrong' : ''}`}
                  disabled={picked != null}
                  onClick={() => {
                    const next = [...answers];
                    next[i] = k.kind;
                    setAnswers(next);
                    if (next.filter(Boolean).length === rounds.length) onScore(next.filter((a, kk) => a === rounds[kk].answer).length);
                  }}
                >
                  <span aria-hidden>{k.emoji}</span> {k.label}
                </button>
              ))}
            </div>
            {picked != null && (
              <p className="quiz-why">
                {picked === round.answer ? '🎉 Nice detective work!' : `🤔 This one was a ${CHALLENGE_KINDS.find((k) => k.kind === round.answer).label.toLowerCase()}.`}
              </p>
            )}
            {picked != null && !over && <button onClick={() => setI(i + 1)}>Next storm →</button>}
            {over && (
              <>
                <p className="quiz-score">You named {score} of {rounds.length}.{score >= ACE_SCORE ? ' Radar Ace! 🏆' : ' Study the lessons and try again!'}</p>
                <button onClick={start}>Play again</button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
