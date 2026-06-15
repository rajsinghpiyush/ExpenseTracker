import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import MemberAvatar from '../components/MemberAvatar';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Minus, Trash2 } from 'lucide-react';

const SPLIT_TYPES = [
  { value: 'EQUAL',      label: 'Equal split',      desc: 'Divided equally among all members' },
  { value: 'UNEQUAL',    label: 'Exact amounts',     desc: 'Specify exact rupee amount per person' },
  { value: 'PERCENTAGE', label: 'Percentage split',  desc: 'Specify percentage share per person' },
  { value: 'SHARE',      label: 'Share ratio',       desc: 'Assign share units (e.g., 1x, 2x) per person' },
];

export default function ExpenseForm() {
  const { groupId, expenseId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(expenseId);

  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    description: '',
    amount: '',
    paidById: '',
    splitType: 'EQUAL',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    currency: 'INR',
  });

  // Per-member share inputs
  const [splitWith, setSplitWith] = useState([]); // [{ userId, name, avatarColor, value }]

  useEffect(() => {
    loadData();
  }, [groupId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [membersRes, groupsRes] = await Promise.all([
        api.get(`/groups/${groupId}/members`),
        api.get('/groups')
      ]);

      const activeMembers = membersRes.data.members.filter((m) => !m.leftAt);
      setMembers(activeMembers);
      setGroups(groupsRes.data.groups);

      // Default: all active members selected for split
      const defaultSplit = activeMembers.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        avatarColor: m.user.avatarColor,
        value: '', // will be computed or entered
        selected: true,
      }));
      setSplitWith(defaultSplit);

      if (isEdit) {
        const expRes = await api.get(`/groups/${groupId}/expenses/${expenseId}`);
        const exp = expRes.data.expense;
        setForm({
          description: exp.description,
          amount: String(exp.amount),
          paidById: exp.paidById,
          splitType: exp.splitType,
          date: exp.date.split('T')[0],
          notes: exp.notes || '',
          currency: exp.currency || 'INR',
        });
        // Restore shares
        const editSplit = activeMembers.map((m) => {
          const share = exp.shares?.find((s) => s.userId === m.userId);
          return {
            userId: m.userId,
            name: m.user.name,
            avatarColor: m.user.avatarColor,
            selected: Boolean(share),
            value: share
              ? exp.splitType === 'PERCENTAGE'
                ? String(parseFloat(share.percentage || 0))
                : exp.splitType === 'SHARE'
                ? String(share.shareUnit || 1)
                : String(parseFloat(share.amount || 0))
              : '',
          };
        });
        setSplitWith(editSplit);
      }
    } catch (err) {
      toast.error('Failed to load group data');
    } finally {
      setLoading(false);
    }
  };

  const selectedSplit = splitWith.filter((m) => m.selected);

  const toggleMember = (userId) => {
    setSplitWith((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, selected: !m.selected } : m))
    );
  };

  const updateValue = (userId, value) => {
    setSplitWith((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, value } : m))
    );
  };

  // Validation helpers
  const getValidationError = () => {
    if (!form.description.trim()) return 'Description is required';
    if (!form.amount || isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0)
      return 'Amount must be a positive number';
    if (!form.paidById) return 'Please select who paid';
    if (selectedSplit.length === 0) return 'At least one member must be in the split';

    const total = parseFloat(form.amount);

    if (form.splitType === 'UNEQUAL') {
      const sum = selectedSplit.reduce((a, m) => a + (parseFloat(m.value) || 0), 0);
      if (Math.abs(sum - total) > 0.02)
        return `Amounts must sum to ₹${total}. Currently: ₹${sum.toFixed(2)}`;
    }
    if (form.splitType === 'PERCENTAGE') {
      const sum = selectedSplit.reduce((a, m) => a + (parseFloat(m.value) || 0), 0);
      if (Math.abs(sum - 100) > 0.1)
        return `Percentages must sum to 100%. Currently: ${sum.toFixed(1)}%`;
    }
    if (form.splitType === 'SHARE') {
      const hasZero = selectedSplit.some((m) => !m.value || parseFloat(m.value) <= 0);
      if (hasZero) return 'All share units must be greater than 0';
    }
    return null;
  };

  const buildSharesInput = () => {
    const type = form.splitType;
    return selectedSplit.map((m) => {
      if (type === 'EQUAL')      return { userId: m.userId };
      if (type === 'UNEQUAL')    return { userId: m.userId, amount: parseFloat(m.value) };
      if (type === 'PERCENTAGE') return { userId: m.userId, percentage: parseFloat(m.value) };
      if (type === 'SHARE')      return { userId: m.userId, shareUnit: parseInt(m.value) || 1 };
      return { userId: m.userId };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = getValidationError();
    if (err) { toast.error(err); return; }

    setSubmitting(true);
    try {
      const payload = {
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        paidById: form.paidById,
        splitType: form.splitType,
        date: form.date,
        notes: form.notes.trim() || undefined,
        currency: form.currency,
        shares: buildSharesInput(),
      };

      if (isEdit) {
        await api.patch(`/groups/${groupId}/expenses/${expenseId}`, payload);
        toast.success('Expense updated!');
      } else {
        await api.post(`/groups/${groupId}/expenses`, payload);
        toast.success('Expense added!');
      }
      navigate(`/groups/${groupId}`);
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Failed to save expense');
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-fill equal values
  const autoFillEqual = () => {
    if (form.splitType === 'PERCENTAGE') {
      const pct = (100 / selectedSplit.length).toFixed(2);
      setSplitWith((prev) => prev.map((m) => m.selected ? { ...m, value: pct } : m));
    } else if (form.splitType === 'UNEQUAL' && form.amount) {
      const each = (parseFloat(form.amount) / selectedSplit.length).toFixed(2);
      setSplitWith((prev) => prev.map((m) => m.selected ? { ...m, value: each } : m));
    } else if (form.splitType === 'SHARE') {
      setSplitWith((prev) => prev.map((m) => m.selected ? { ...m, value: '1' } : m));
    }
  };

  const splitTotal = () => {
    if (form.splitType === 'PERCENTAGE')
      return selectedSplit.reduce((a, m) => a + (parseFloat(m.value) || 0), 0);
    if (form.splitType === 'UNEQUAL')
      return selectedSplit.reduce((a, m) => a + (parseFloat(m.value) || 0), 0);
    return null;
  };
  const total = splitTotal();
  const pctOff = form.splitType === 'PERCENTAGE' && total !== null ? Math.abs(total - 100) : 0;
  const amtOff = form.splitType === 'UNEQUAL' && total !== null && form.amount
    ? Math.abs(total - parseFloat(form.amount)) : 0;

  if (loading) {
    return (
      <div className="app-layout corporate-dashboard-body">
        <Sidebar groups={[]} />
        <main className="main-content" style={{ marginLeft: '240px', width: 'calc(100% - 240px)' }}>
          <div className="loading-overlay"><div className="spinner spinner-lg" style={{ borderTopColor: '#10b981' }} /></div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout corporate-dashboard-body">
      <Sidebar groups={groups} />
      <main className="main-content" style={{ padding: '2rem 2.5rem', marginLeft: '240px', width: 'calc(100% - 240px)' }}>
        <div className="content-container animate-fade-in" style={{ maxWidth: 640 }}>

          <Link to={`/groups/${groupId}`} className="corporate-view-all" style={{ marginBottom: '1.25rem', width: 'fit-content', display: 'flex', alignItems: 'center', gap: '0.35rem', margin: '0' }}>
            <ArrowLeft size={16} /> Back to Group
          </Link>

          <h1 className="corporate-title" style={{ marginTop: '1rem', marginBottom: '0.25rem' }}>
            {isEdit ? '✏️ Edit Expense' : '➕ Add Expense'}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '2rem' }}>
            {isEdit ? 'Update the expense details below.' : 'Fill in the details and choose how to split.'}
          </p>

          <form onSubmit={handleSubmit}>
            {/* ── Basic Info ── */}
            <div className="card corporate-card" style={{ marginBottom: '1rem' }}>
              <h3 className="corporate-card-title">Expense Details</h3>

              <div className="form-group">
                <label className="form-label" htmlFor="exp-description" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>Description *</label>
                <input
                  id="exp-description"
                  type="text"
                  className="corporate-form-input"
                  placeholder="e.g. Groceries BigBasket"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  required
                  autoFocus={!isEdit}
                />
              </div>

              <div className="grid col-2" style={{ gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="exp-amount" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>Amount *</label>
                  <input
                    id="exp-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="corporate-form-input"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="exp-currency" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>Currency</label>
                  <select
                    id="exp-currency"
                    className="corporate-form-select"
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  >
                    <option value="INR">INR ₹</option>
                    <option value="USD">USD $</option>
                    <option value="EUR">EUR €</option>
                  </select>
                </div>
              </div>

              <div className="grid col-2" style={{ gap: '1rem', marginTop: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="exp-date" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>Date *</label>
                  <input
                    id="exp-date"
                    type="date"
                    className="corporate-form-input"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="exp-paidby" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>Paid by *</label>
                  <select
                    id="exp-paidby"
                    className="corporate-form-select"
                    value={form.paidById}
                    onChange={(e) => setForm((f) => ({ ...f, paidById: e.target.value }))}
                    required
                  >
                    <option value="">Select payer</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.user.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1rem', marginBottom: 0 }}>
                <label className="form-label" htmlFor="exp-notes" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>Notes (optional)</label>
                <input
                  id="exp-notes"
                  type="text"
                  className="corporate-form-input"
                  placeholder="Any notes about this expense"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            {/* ── Split Type ── */}
            <div className="card corporate-card" style={{ marginBottom: '1rem' }}>
              <h3 className="corporate-card-title">How to Split</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                {SPLIT_TYPES.map((st) => {
                  const isActive = form.splitType === st.value;
                  return (
                    <button
                      key={st.value}
                      type="button"
                      id={`split-type-${st.value.toLowerCase()}`}
                      onClick={() => setForm((f) => ({ ...f, splitType: st.value }))}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '10px',
                        border: isActive ? '2px solid #10b981' : '1px solid #d1d5db',
                        background: isActive ? 'rgba(16, 185, 129, 0.05)' : '#ffffff',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isActive ? '#10b981' : '#1f2937' }}>
                        {st.label}
                      </div>
                      <div style={{ fontSize: '0.725rem', color: '#6b7280', marginTop: '0.125rem' }}>
                        {st.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ── Split With Members ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label className="form-label" style={{ marginBottom: 0, color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>Split among</label>
                {form.splitType !== 'EQUAL' && (
                  <button
                    type="button"
                    className="corporate-add-btn"
                    onClick={autoFillEqual}
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                  >
                    Auto-fill equal
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {splitWith.map((m) => {
                  const isChecked = m.selected;
                  return (
                    <div
                      key={m.userId}
                      className="flex items-center gap-3"
                      style={{
                        padding: '0.625rem 0.75rem',
                        borderRadius: '8px',
                        border: isChecked ? '1px solid #10b981' : '1px solid #e5e7eb',
                        background: isChecked ? 'rgba(16, 185, 129, 0.03)' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onClick={() => form.splitType !== 'EQUAL' ? toggleMember(m.userId) : null}
                    >
                      <input
                        type="checkbox"
                        checked={m.selected}
                        onChange={() => toggleMember(m.userId)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 16, height: 16, accentColor: '#10b981', flexShrink: 0 }}
                        id={`split-member-${m.userId}`}
                      />
                      <MemberAvatar name={m.name} color={m.avatarColor} size="xs" />
                      <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>{m.name}</span>

                      {/* Value input for non-EQUAL splits */}
                      {m.selected && form.splitType !== 'EQUAL' && (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="corporate-form-input"
                          style={{ width: 90, textAlign: 'right', padding: '0.375rem 0.5rem' }}
                          placeholder={
                            form.splitType === 'PERCENTAGE' ? '0%'
                            : form.splitType === 'SHARE' ? 'units'
                            : '₹0'
                          }
                          value={m.value}
                          onChange={(e) => { e.stopPropagation(); updateValue(m.userId, e.target.value); }}
                          onClick={(e) => e.stopPropagation()}
                          id={`split-value-${m.userId}`}
                        />
                      )}

                      {/* For EQUAL, show computed amount */}
                      {form.splitType === 'EQUAL' && form.amount && m.selected && (
                        <span style={{ fontSize: '0.8rem', color: '#6b7280', flexShrink: 0, fontWeight: 500 }}>
                          ≈ ₹{(parseFloat(form.amount) / selectedSplit.length).toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Running total validation */}
              {(form.splitType === 'PERCENTAGE' || form.splitType === 'UNEQUAL') && total !== null && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div className="flex justify-between" style={{ fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280', fontWeight: 500 }}>
                      {form.splitType === 'PERCENTAGE' ? 'Total %' : 'Total amount'}
                    </span>
                    <span style={{ fontWeight: 700, color: (pctOff < 0.1 && amtOff < 0.02) ? '#10b981' : '#ef4444' }}>
                      {form.splitType === 'PERCENTAGE' ? `${total.toFixed(1)}% / 100%` : `₹${total.toFixed(2)} / ₹${parseFloat(form.amount || 0).toFixed(2)}`}
                    </span>
                  </div>
                  <div className="progress-bar" style={{ marginTop: '0.375rem', background: '#e5e7eb', height: '6px' }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(form.splitType === 'PERCENTAGE' ? total : (total / parseFloat(form.amount || 1)) * 100, 100)}%`,
                        background: (pctOff < 0.1 && amtOff < 0.02) ? '#10b981' : '#ef4444',
                        height: '100%',
                        borderRadius: '9999px'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Submit ── */}
            <div className="flex gap-3 justify-end">
              <Link to={`/groups/${groupId}`} className="corporate-add-btn" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Cancel</Link>
              <button
                id="submit-expense-btn"
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                style={{
                  background: '#10b981',
                  borderColor: '#10b981',
                  color: 'white',
                  fontWeight: 700,
                  borderRadius: '9999px',
                  padding: '0.5rem 1.75rem'
                }}
              >
                {submitting ? 'Saving…' : isEdit ? '✓ Update Expense' : '✓ Add Expense'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
