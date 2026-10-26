import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendly } from '../lib/errors';

// Open riddles, shown above the community chat. Questions are public; answers are hidden on the server.
export default function Riddles({ canAnswer, isAdmin }) {
  const [riddles, setRiddles] = useState(null);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);

  async function load() {
    const { data } = await supabase.from('riddles')
      .select('id, question, winners_count, winner_limit')
      .eq('status', 'open')
      .order('created_at');
    setRiddles(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function submit(e, riddle) {
    e.preventDefault();
    const text = (answers[riddle.id] ?? '').trim();
    if (!text) return;
    setBusy(riddle.id);
    const { data, error } = await supabase.rpc('submit_riddle_answer', { p_riddle: riddle.id, p_answer: text });
    setBusy(null);
    if (error) {
      setResults({ ...results, [riddle.id]: { type: 'error', text: friendly(error) } });
      return;
    }
    let result;
    if (data.already) {
      result = { type: 'ok', text: 'You already answered this riddle correctly.' };
    } else if (data.correct) {
      result = { type: 'ok', text: `Correct! You earned ${data.coins} coins.${data.closed ? ' The riddle is now closed.' : ''}` };
      setAnswers({ ...answers, [riddle.id]: '' });
    } else {
      result = { type: 'error', text: 'Not quite. Try again.' };
    }
    setResults({ ...results, [riddle.id]: result });
    load();
  }

  if (riddles === null || riddles.length === 0) return null;

  return (
    <section aria-label="Open riddles">
      {riddles.map((r) => (
        <div key={r.id} className="card riddle-card">
          <p className="riddle-label">
            Riddle · {r.winners_count} of {r.winner_limit} correct so far · 2 coins for each correct answer
          </p>
          <p className="riddle-question">{r.question}</p>

          {canAnswer && !isAdmin ? (
            <form onSubmit={(e) => submit(e, r)}>
              <label htmlFor={`riddle-${r.id}`}>Your answer</label>
              <input id={`riddle-${r.id}`} maxLength={300} value={answers[r.id] ?? ''}
                onChange={(e) => setAnswers({ ...answers, [r.id]: e.target.value })} />
              <p>
                <button type="submit" disabled={busy === r.id || !(answers[r.id] ?? '').trim()}>
                  {busy === r.id ? 'Checking…' : 'Submit answer'}
                </button>
              </p>
            </form>
          ) : (
            <p className="muted">
              {isAdmin ? 'Admin view: members cannot see the answers until the riddle closes.'
                : 'Sign in and verify your email to answer.'}
            </p>
          )}

          {results[r.id] && (
            <p role="status" className={results[r.id].type === 'error' ? 'error' : 'ok'}>{results[r.id].text}</p>
          )}
        </div>
      ))}
    </section>
  );
}
