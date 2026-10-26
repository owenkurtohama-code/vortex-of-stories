import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';
import RiddleAdmin from '../components/RiddleAdmin.jsx';

// Visibility here is cosmetic. Every action is enforced again on the server (is_admin()).

function askReason(prompt) {
  const reason = window.prompt(prompt);
  if (!reason || reason.trim().length < 3) return null;
  return reason.trim();
}

export default function Admin() {
  const { profile } = useSession();
  const isAdmin = profile?.role === 'admin';
  const [books, setBooks] = useState([]);
  const [payments, setPayments] = useState([]);
  const [reports, setReports] = useState([]);
  const [audit, setAudit] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [entitlements, setEntitlements] = useState([]);
  const [grantReason, setGrantReason] = useState('');
  const [message, setMessage] = useState(null);

  const loadQueues = useCallback(async () => {
    const [b, p, r, a] = await Promise.all([
      supabase.from('books').select('id, title, author_id').eq('status', 'pending_review').order('updated_at'),
      supabase.from('payment_submissions')
        .select('id, package_months, order_reference, created_at, profiles!user_id(username)')
        .eq('status', 'pending').order('created_at'),
      supabase.from('content_reports').select('id, target_type, target_id, reason, created_at')
        .eq('status', 'open').order('created_at'),
      supabase.rpc('admin_list_audit', { p_limit: 100 }),
    ]);
    setBooks(b.data ?? []);
    setPayments(p.data ?? []);
    setReports(r.data ?? []);
    setAudit(a.data ?? []);
  }, []);

  useEffect(() => { if (isAdmin) loadQueues(); }, [isAdmin, loadQueues]);

  if (!isAdmin) return <p className="card">You do not have access to this page.</p>;

  function show(type, text) { setMessage({ type, text }); }

  async function loadEntitlements(userId) {
    const { data, error } = await supabase.rpc('admin_user_entitlements', { p_user: userId });
    if (error) { show('error', friendly(error)); return; }
    setEntitlements(data ?? []);
  }

  async function reviewBook(id, approve) {
    const reason = approve ? 'Approved' : askReason('Reason for rejection (shown to the author, at least 3 characters):');
    if (!reason) return;
    const { error } = await supabase.rpc('review_book', { p_book: id, p_approve: approve, p_reason: reason });
    if (error) { show('error', friendly(error)); return; }
    show('ok', approve ? 'Book approved.' : 'Book rejected.');
    loadQueues();
  }

  async function reviewPayment(id, approve, orderRef, username) {
    const note = askReason(
      `${approve ? 'Approve' : 'Reject'} order ${orderRef} for ${username}.\nCheck it against the real Ko-fi record first.\nNote (at least 3 characters):`
    );
    if (!note) return;
    const { error } = await supabase.rpc('review_payment', { p_payment: id, p_approve: approve, p_note: note });
    if (error) { show('error', friendly(error)); return; }
    show('ok', 'Payment decision recorded.');
    loadQueues();
  }

  async function resolveReport(report, action) {
    const reason = askReason(
      action === 'hide'
        ? 'Reason for hiding this content (recorded):'
        : 'Reason for dismissing this report (recorded):'
    );
    if (!reason) return;
    if (action === 'hide') {
      const { error: hideErr } = await supabase.rpc('admin_set_hidden', {
        p_type: report.target_type, p_target: report.target_id, p_hidden: true, p_reason: reason,
      });
      if (hideErr) { show('error', friendly(hideErr)); return; }
    }
    const { error } = await supabase.rpc('admin_review_report', {
      p_report: report.id, p_status: action === 'hide' ? 'resolved' : 'dismissed', p_reason: reason,
    });
    if (error) { show('error', friendly(error)); return; }
    show('ok', action === 'hide' ? 'Content hidden and report resolved.' : 'Report dismissed.');
    loadQueues();
  }

  async function searchMembers(e) {
    e.preventDefault();
    const { data, error } = await supabase.rpc('admin_find_member', { p_query: searchText.trim() });
    if (error) { show('error', friendly(error)); return; }
    setMembers(data ?? []);
  }

  async function setSuspended(member, suspended) {
    const reason = askReason(`${suspended ? 'Suspension' : 'Restoration'} reason for ${member.username} (recorded):`);
    if (!reason) return;
    if (suspended && !window.confirm(`Suspend ${member.username}? They will be unable to sign in or take any action.`)) return;
    const { error } = await supabase.rpc('admin_set_suspended', {
      p_user: member.user_id, p_suspended: suspended, p_reason: reason,
    });
    if (error) { show('error', friendly(error)); return; }
    show('ok', suspended ? 'Account suspended.' : 'Account restored.');
    searchMembers({ preventDefault: () => {} });
    loadQueues();
  }

  function pickMember(member) {
    setSelected(member);
    setGrantReason('');
    loadEntitlements(member.user_id);
  }

  async function grantPremium(e) {
    e.preventDefault();
    if (!selected) return;
    if (grantReason.trim().length < 3) { show('error', 'Please enter a reason of at least 3 characters.'); return; }
    if (!window.confirm(`Grant permanent Premium to ${selected.username}?`)) return;
    const { error } = await supabase.rpc('admin_grant_premium', {
      p_user: selected.user_id, p_reason: grantReason.trim(),
    });
    if (error) { show('error', friendly(error)); return; }
    show('ok', 'Premium granted and recorded in the audit log.');
    setGrantReason('');
    loadEntitlements(selected.user_id);
    searchMembers({ preventDefault: () => {} });
  }

  async function revokeEntitlement(ent) {
    const reason = askReason(`Reason for revoking entitlement ${ent.id} (${ent.source}, recorded):`);
    if (!reason) return;
    if (!window.confirm('Revoke this entitlement now?')) return;
    const { error } = await supabase.rpc('admin_revoke_entitlement', { p_entitlement: ent.id, p_reason: reason });
    if (error) { show('error', friendly(error)); return; }
    show('ok', 'Entitlement revoked and recorded in the audit log.');
    loadEntitlements(selected.user_id);
    searchMembers({ preventDefault: () => {} });
  }

  return (
    <section>
      <h1>Administration</h1>
      <RiddleAdmin />
      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}

      <section className="card">
        <h2>Books awaiting review</h2>
        {books.length === 0 && <p className="muted">Nothing waiting.</p>}
        <ul>
          {books.map((b) => (
            <li key={b.id}>
              {b.title}{' '}
              <button type="button" className="btn-small" onClick={() => reviewBook(b.id, true)}>Approve</button>{' '}
              <button type="button" className="btn-small" onClick={() => reviewBook(b.id, false)}>Reject</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Premium orders awaiting verification</h2>
        <p className="muted">Verify each order against the real Ko-fi payment record before approving.</p>
        {payments.length === 0 && <p className="muted">Nothing waiting.</p>}
        <ul>
          {payments.map((p) => (
            <li key={p.id}>
              {p.profiles?.username} · {p.package_months} months · ref <code>{p.order_reference}</code>{' '}
              <button type="button" className="btn-small" onClick={() => reviewPayment(p.id, true, p.order_reference, p.profiles?.username)}>Approve</button>{' '}
              <button type="button" className="btn-small" onClick={() => reviewPayment(p.id, false, p.order_reference, p.profiles?.username)}>Reject</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Reports</h2>
        {reports.length === 0 && <p className="muted">No open reports.</p>}
        <ul>
          {reports.map((r) => (
            <li key={r.id} style={{ margin: '.6rem 0' }}>
              <span className="status">{r.target_type.replace(/_/g, ' ')}</span> {r.reason}{' '}
              <button type="button" className="btn-small" onClick={() => resolveReport(r, 'hide')}>Hide content</button>{' '}
              <button type="button" className="btn-small" onClick={() => resolveReport(r, 'dismiss')}>Dismiss</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Members</h2>
        <form onSubmit={searchMembers}>
          <label htmlFor="search">Username starts with</label>
          <input id="search" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          <p><button type="submit">Search</button></p>
        </form>
        {members.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>Username</th><th>Email</th><th>Role</th><th>Verified</th><th>Premium</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} style={{ borderTop: '1px solid var(--surface-2)' }}>
                  <td>{m.username}</td>
                  <td>{m.email}</td>
                  <td>{m.role}</td>
                  <td>{m.email_verified ? 'Yes' : 'No'}</td>
                  <td>{m.premium_now ? 'Yes' : 'No'}</td>
                  <td>{m.suspended ? 'Suspended' : 'Active'}</td>
                  <td>
                    <button type="button" className="btn-small" onClick={() => pickMember(m)}>Manage</button>{' '}
                    {m.role !== 'admin' && (
                      <button type="button" className="btn-small" onClick={() => setSuspended(m, !m.suspended)}>
                        {m.suspended ? 'Restore' : 'Suspend'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected && (
        <section className="card">
          <h2>Premium for {selected.username}</h2>
          <form onSubmit={grantPremium}>
            <label htmlFor="grant-reason">Reason for granting permanent Premium (recorded)</label>
            <input id="grant-reason" value={grantReason} onChange={(e) => setGrantReason(e.target.value)} />
            <p><button type="submit">Grant permanent Premium</button></p>
          </form>
          <h3>Entitlements</h3>
          {entitlements.length === 0 && <p className="muted">No entitlements.</p>}
          <ul>
            {entitlements.map((ent) => (
              <li key={ent.id} style={{ margin: '.5rem 0' }}>
                #{ent.id} · {ent.source} · from {new Date(ent.starts_at).toLocaleDateString()} ·{' '}
                {ent.ends_at ? `until ${new Date(ent.ends_at).toLocaleDateString()}` : 'permanent'}{' '}
                {ent.revoked_at
                  ? <span className="status">revoked</span>
                  : <button type="button" className="btn-small" onClick={() => revokeEntitlement(ent)}>Revoke</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Audit log</h2>
        <p className="muted">The 100 most recent administrator actions.</p>
        {audit.length === 0 && <p className="muted">No actions recorded yet.</p>}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}><th>When</th><th>Action</th><th>Target</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--surface-2)' }}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.action}</td>
                  <td>{a.target}</td>
                  <td>{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
