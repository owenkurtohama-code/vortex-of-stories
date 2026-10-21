import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

// Address the verification and reset emails should return to (the site itself, without the #hash).
function siteUrl() {
  return window.location.origin + window.location.pathname;
}

export function Login() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
    setBusy(false);
    if (error) {
      setMessage({ type: 'error', text: 'Sign-in failed. Check your email and password. If you just registered, verify your email first.' });
      return;
    }
    navigate('/');
  }

  async function forgot() {
    if (!form.email.trim()) {
      setMessage({ type: 'error', text: 'Enter your email address above first.' });
      return;
    }
    await supabase.auth.resetPasswordForEmail(form.email.trim(), { redirectTo: siteUrl() });
    // Same message whether or not the account exists (prevents account enumeration).
    setMessage({ type: 'ok', text: 'If an account exists for that email, a reset link has been sent.' });
  }

  return (
    <section className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <p style={{ marginTop: '1rem' }}>
          <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>{' '}
          <button type="button" className="btn-secondary" onClick={forgot}>Forgot password?</button>
        </p>
      </form>
      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}
      <p className="muted">No account yet? <Link to="/register">Register</Link></p>
    </section>
  );
}

export function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setMessage(null);
    if (!USERNAME_RE.test(form.username)) {
      setMessage({ type: 'error', text: 'Username must be 3 to 20 letters, numbers or underscores.' });
      return;
    }
    if (form.password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { username: form.username }, emailRedirectTo: siteUrl() },
    });
    setBusy(false);
    if (error) {
      setMessage({ type: 'error', text: 'Registration could not be completed. The username or email may already be in use.' });
      return;
    }
    setMessage({ type: 'ok', text: 'Account created. Open the verification link in your email. Member features unlock after verification.' });
  }

  return (
    <section className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1>Create your account</h1>
      <form onSubmit={submit}>
        <label htmlFor="username">Username</label>
        <input id="username" required autoComplete="username" aria-describedby="username-help"
          value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <p id="username-help" className="muted">3 to 20 letters, numbers or underscores. Shown publicly.</p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required autoComplete="email"
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={8} autoComplete="new-password"
          aria-describedby="password-help" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <p id="password-help" className="muted">At least 8 characters.</p>
        <p><button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></p>
      </form>
      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}
      <p className="muted">Already registered? <Link to="/login">Sign in</Link></p>
    </section>
  );
}

// Shown after a password-reset link is opened (see App.jsx).
export function ResetPassword() {
  const { setRecovering } = useSession();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(null);

  async function save(e) {
    e.preventDefault();
    if (password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage({ type: 'error', text: 'The password could not be changed. Request a new reset link.' });
      return;
    }
    setRecovering(false);
    window.location.hash = '#/';
  }

  return (
    <section className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1>Choose a new password</h1>
      <form onSubmit={save}>
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" required minLength={8} autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <p><button type="submit">Save password</button></p>
      </form>
      {message && <p role="status" className="error">{message.text}</p>}
    </section>
  );
}
