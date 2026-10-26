import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';

// Administrator only: post riddles, see open answers, and close a riddle.
export default function RiddleAdmin() {
  const { profile } = useSession();
  const [question, setQuestion] = useState('');
  const [answersText, setAnswersText] = useState('');
  const [limit, setLimit] = useState(10);
  const [open, setOpen] = useState([]);
  const [boards, setBoards] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from('riddles')
      .select('id, question, winners_count, winner_limit').eq('status', 'open').order('created_at');
    setOpen(data ?? []);
  }

  useEffect(() => { if (profile?.role === 'admin') load(); }, [profile]);

  if (profile?.role !== 'admin') return null;

  async function create(e) {
    e.preventDefault();
    setMessage(null);
    const answers = answersText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (answers.length === 0) {
      setMessage({ type: 'error', text: 'Enter at least one accepted answer, one per line.' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('admin_create_riddle', {
      p_question: question.trim(), p_answers: answers, p_limit: Number(limit),
    });
    setBusy(false);
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setQuestion('');
    setAnswersText('');
    setMessage({ type: 'ok', text: 'Riddle opened. It now appears in the community chat.' });
    load();
  }

  async function showBoard(id) {
    const { data, error } = await supabase.rpc('admin_riddle_board', { p_riddle: id });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setBoards({ ...boards, [id]: data });
  }

  async function close(r) {
    if (!window.confirm(`Close "${r.question}" now? The answers will be revealed in the community chat.`)) return;
    const { error } = await supabase.rpc('admin_close_riddle', { p_riddle: r.id });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setMessage({ type: 'ok', text: 'Riddle closed. The reveal is now in the community chat.' });
    load();
  }

  return (
    <section className="card">
      <h2>Riddles</h2>

      <form onSubmit={create}>
        <label htmlFor="rq">Riddle question</label>
        <textarea id="rq" required maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} />

        <label htmlFor="ra">Accepted answers (one per line; any of them counts as correct)</label>
        <textarea id="ra" required value={answersText} onChange={(e) => setAnswersText(e.target.value)}
          style={{ minHeight: '5rem' }} />

        <label htmlFor="rl">Winner limit (the riddle closes when this many members are correct)</label>
        <input id="rl" type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(e.target.value)} />

        <p><button type="submit" disabled={busy}>{busy ? 'Opening…' : 'Open riddle'}</button></p>
      </form>

      <h3>Open riddles</h3>
      {open.length === 0 && <p className="muted">No open riddles.</p>}
      {open.map((r) => (
        <div key={r.id} className="card" style={{ margin: '.6rem 0' }}>
          <strong>{r.question}</strong>{' '}
          <span className="status">{r.winners_count} of {r.winner_limit} correct</span>
          <div className="action-row">
            <button type="button" className="btn-secondary" onClick={() => showBoard(r.id)}>Show answers</button>
            <button type="button" className="btn-danger" onClick={() => close(r)}>Close now</button>
          </div>
          {boards[r.id] && (
            <div style={{ marginTop: '.6rem' }}>
              <p className="muted" style={{ margin: '0 0 .4rem' }}>
                Accepted: {boards[r.id].answers.join(', ') || 'none'}
              </p>
              <ul>
                {boards[r.id].entries.map((e, i) => (
                  <li key={i}>
                    {e.username}: {e.answer} <span className={e.correct ? 'ok' : 'error'}>{e.correct ? '✓' : '✗'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}

      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}
    </section>
  );
}
