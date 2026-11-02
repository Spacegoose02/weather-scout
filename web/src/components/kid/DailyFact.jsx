import { useState } from 'react';
import SpeakButton from './SpeakButton.jsx';
import { speak } from '../../kid/speak.js';

export default function DailyFact({ fact, today, kid }) {
  const [shown, setShown] = useState(false);
  const heard = () => {
    const days = kid.data.factDays || [];
    if (days.includes(today)) return;
    const next = [...days, today].slice(-30);
    kid.update(() => ({ factDays: next }));
    if (next.length >= 7) kid.earn('fact-fan');
  };
  const joke = fact.type === 'joke';
  return (
    <section className="card kid-fact">
      <h2>{joke ? "Rocky's joke of the day" : "Rocky's fact of the day"}</h2>
      <p className="fact-text">{joke ? '😂 ' : '💡 '}{fact.text}</p>
      {joke && (shown
        ? <p className="fact-answer">{fact.answer}</p>
        : <button className="ghost" onClick={() => { setShown(true); speak(fact.answer); heard(); }}>Tell me the answer!</button>)}
      <SpeakButton text={joke ? fact.text : fact.speech} onSpeak={heard} />
    </section>
  );
}
