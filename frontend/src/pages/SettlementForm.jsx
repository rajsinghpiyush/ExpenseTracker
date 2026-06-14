import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import MemberAvatar from '../components/MemberAvatar';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRightLeft } from 'lucide-react';

export default function SettlementForm() {
  const { groupId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({
    payerId: searchParams.get('from') || '',
    receiverId: searchParams.get('to') || '',
    amount: searchParams.get('amount') || '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get(`/groups/${groupId}/members`).then((res) => setMembers(res.data.members));
  }, [groupId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.payerId === form.receiverId) {
      toast.error('Payer and receiver cannot be the same person');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/groups/${groupId}/settlements`, form);
      toast.success('Settlement recorded!');
      navigate(`/groups/${groupId}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record settlement');
    } finally {
      setLoading(false);
    }
  };

  const activeMembers = members.filter((m) => !m.leftAt);

  return (
    <div className="app-layout">
      <Sidebar groups={[]} />
      <main className="main-content">
        <div className="content-container animate-fade-in" style={{ maxWidth: 540 }}>
          <Link to={`/groups/${groupId}`} className="btn btn-ghost btn-sm" style={{ marginBottom: '1.25rem', width: 'fit-content' }}>
            <ArrowLeft size={16} /> Back to Group
          </Link>
          <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>💸 Record Settlement</h1>
          <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
            Mark a payment between two members to update group balances.
          </p>

          <div className="card">
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="payer-select">Who paid?</label>
                <select
                  id="payer-select"
                  className="form-select"
                  value={form.payerId}
                  onChange={(e) => setForm((f) => ({ ...f, payerId: e.target.value }))}
                  required
                >
                  <option value="">Select payer</option>
                  {activeMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ textAlign: 'center', margin: '0.5rem 0', color: 'var(--text-muted)' }}>
                <ArrowRightLeft size={20} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="receiver-select">Who received?</label>
                <select
                  id="receiver-select"
                  className="form-select"
                  value={form.receiverId}
                  onChange={(e) => setForm((f) => ({ ...f, receiverId: e.target.value }))}
                  required
                >
                  <option value="">Select receiver</option>
                  {activeMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="settlement-amount">Amount (₹)</label>
                <input
                  id="settlement-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="settlement-date">Date</label>
                <input
                  id="settlement-date"
                  type="date"
                  className="form-input"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="settlement-notes">Notes (optional)</label>
                <input
                  id="settlement-notes"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Paid via UPI"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <button
                id="record-settlement-btn"
                type="submit"
                className="btn btn-success btn-full btn-lg"
                disabled={loading}
                style={{ marginTop: '0.5rem' }}
              >
                {loading ? 'Recording…' : '✓ Record Settlement'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
