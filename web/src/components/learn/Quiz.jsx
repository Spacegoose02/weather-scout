import { useState } from 'react';
import { speak } from '../../kid/speak.js';

// One or more quick multiple-choice questions with instant feedback.
export default function Quiz({ questions }) {
  const list = Array.isArray(questions) ? questions : [questions];
  const [picked, setPicked] = useState({});
  const score = list.filter((q, i) => picked[i] === q.answer).length;
  const done = Object.keys(picked).length === list.length;
  return (
    <div className="learn-quiz">
      <h3>Quick quiz</h3>
      {list.map((q, i) => {
        const p = picked[i];
        return (
          <div key={q.q} className="quiz-q">
            <p><strong>{q.q}</strong></p>
            <div className="quiz-options">
              {q.options.map((o, j) => (
                <button
                  key={o}
                  className={`ghost ${p == null ? '' : j === q.answer ? 'right' : j === p ? 'wrong' : ''}`}
                  disabled={p != null}
                  onClick={() => {
                    setPicked((x) => ({ ...x, [i]: j }));
                    speak(j === q.answer ? `Yes! ${q.why}` : `Not quite. ${q.why}`);
                  }}
                >
                  {o}
                </button>
              ))}
            </div>
            {p != null && <p className="quiz-why">{p === q.answer ? '🎉 Yes! ' : '🤔 Not quite. '}{q.why}</p>}
          </div>
        );
      })}
      {done && list.length > 1 && <p className="quiz-score">You got {score} of {list.length}{score === list.length ? '. Weather genius! 🏆' : '.'}</p>}
    </div>
  );
}
