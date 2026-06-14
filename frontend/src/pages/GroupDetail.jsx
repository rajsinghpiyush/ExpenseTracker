import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import MemberAvatar from '../components/MemberAvatar';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  Plus, Upload, Scale, ArrowLeft, Receipt, Users,
  ChevronDown, ChevronUp, Trash2, ExternalLink,
  TrendingUp, TrendingDown, ArrowRightLeft, Filter
} from 'lucide-react';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

const SPLIT_LABELS = {
  EQUAL: 'Equal',
  UNEQUAL: 'Unequal',
  PERCENTAGE: 'Percentage',
  SHARE: 'Shares',
};

export default function GroupDetail() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('expenses');
  const [expandedExpense, setExpandedExpense] = useState(null);
  const [deleting, setDeleting] = useState(null);
  
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberJoinDate, setNewMemberJoinDate] = useState(new Date().toISOString().split('T')[0]);
  const [addingMember, setAddingMember] = useState(false);

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) {
      toast.error('Email is required');
      return;
    }
    setAddingMember(true);
    try {
      await api.post(`/groups/${groupId}/members`, {
        email: newMemberEmail.trim().toLowerCase(),
        name: newMemberName.trim() || undefined,
        joinedAt: newMemberJoinDate,
      });
      toast.success('Member added successfully');
      setNewMemberEmail('');
      setNewMemberName('');
      loadAll();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to add member';
      toast.error(errorMsg);
    } finally {
      setAddingMember(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [groupId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [groupRes, expRes, balRes, settlRes, allGroupsRes] = await Promise.all([
        api.get(`/groups/${groupId}`),
        api.get(`/groups/${groupId}/expenses`),
        api.get(`/groups/${groupId}/balances`),
        api.get(`/groups/${groupId}/settlements`),
        api.get('/groups'),
      ]);
      setGroup(groupRes.data.group);
      setExpenses(expRes.data.expenses);
      setBalances(balRes.data);
      setSettlements(settlRes.data.settlements);
      setGroups(allGroupsRes.data.groups);
    } catch (err) {
      toast.error('Failed to load group data');
    } finally {
      setLoading(false);
    }
  };

  const deleteExpense = async (expenseId) => {
    if (!window.confirm('Delete this expense? This will affect everyone\'s balances.')) return;
    setDeleting(expenseId);
    try {
      await api.delete(`/groups/${groupId}/expenses/${expenseId}`);
      toast.success('Expense deleted');
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
      // Reload balances
      const balRes = await api.get(`/groups/${groupId}/balances`);
      setBalances(balRes.data);
    } catch {
      toast.error('Failed to delete expense');
    } finally {
      setDeleting(null);
    }
  };

  const myNetBalance = balances?.netBalances?.[user?.id] || 0;
  const mySettlements = balances?.minSettlements?.filter(
    (s) => s.from.id === user?.id || s.to.id === user?.id
  ) || [];

  const activeMembers = (group?.members || []).filter((m) => !m.leftAt);

  if (loading) {
    return (
      <div className="app-layout">
        <Sidebar groups={[]} />
        <main className="main-content">
          <div className="loading-overlay"><div className="spinner spinner-lg" /></div>
        </main>
      </div>
    );
  }

  if (!group) {
    return <div className="auth-page"><p>Group not found</p></div>;
  }

  return (
    <div className="app-layout">
      <Sidebar groups={groups} currentGroupId={groupId} />
      <main className="main-content">
        <div className="content-container animate-fade-in">

          {/* Back */}
          <Link to="/dashboard" className="btn btn-ghost btn-sm" style={{ marginBottom: '1.25rem', width: 'fit-content' }}>
            <ArrowLeft size={16} /> Dashboard
          </Link>

          {/* Group Header */}
          <div className="page-header" style={{ alignItems: 'flex-start' }}>
            <div>
              <h1 className="page-title">🏠 {group.name}</h1>
              {group.description && <p className="page-subtitle">{group.description}</p>}
              {/* Member avatars */}
              <div className="flex items-center gap-3" style={{ marginTop: '0.75rem' }}>
                <div className="avatar-stack">
                  {activeMembers.slice(0, 6).map((m) => (
                    <MemberAvatar key={m.userId} name={m.user.name} color={m.user.avatarColor} size="sm" showTooltip />
                  ))}
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <Link to={`/groups/${groupId}/expenses/new`} className="btn btn-primary" id="add-expense-btn">
                <Plus size={16} /> Add Expense
              </Link>
              <Link to={`/groups/${groupId}/settle`} className="btn btn-success" id="settle-btn">
                <ArrowRightLeft size={16} /> Settle
              </Link>
              <Link to={`/groups/${groupId}/import`} className="btn btn-ghost" id="import-btn">
                <Upload size={16} /> Import CSV
              </Link>
              <Link to={`/groups/${groupId}/balances`} className="btn btn-ghost" id="balances-btn">
                <Scale size={16} /> Full Balances
              </Link>
            </div>
          </div>

          {/* My Balance Summary Card */}
          <div
            className={`card ${myNetBalance >= 0 ? 'card-success' : 'card-danger'}`}
            style={{ marginBottom: '1.5rem' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Your balance in this group
                </p>
                <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
                  {myNetBalance >= 0 ? (
                    <span className="amount-positive">+{fmt(myNetBalance)}</span>
                  ) : (
                    <span className="amount-negative">{fmt(myNetBalance)}</span>
                  )}
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {myNetBalance > 0.01
                    ? 'Others owe you money'
                    : myNetBalance < -0.01
                    ? 'You owe money'
                    : 'You\'re all settled up!'}
                </p>
              </div>
              {mySettlements.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>To settle:</p>
                  {mySettlements.slice(0, 3).map((s, i) => (
                    <div key={i} style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                      {s.from.id === user?.id ? (
                        <span>
                          Pay <strong>{s.to.name}</strong>{' '}
                          <span className="amount-negative">{fmt(s.amount)}</span>
                        </span>
                      ) : (
                        <span>
                          <strong>{s.from.name}</strong> pays you{' '}
                          <span className="amount-positive">{fmt(s.amount)}</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-4" style={{ marginBottom: '1.5rem' }}>
            <div className="tabs">
              {['expenses', 'settlements', 'members'].map((tab) => (
                <button
                  key={tab}
                  id={`tab-${tab}`}
                  className={`tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            {activeTab === 'expenses' && (
              <span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Expenses Tab */}
          {activeTab === 'expenses' && (
            <div>
              {expenses.length === 0 ? (
                <div className="empty-state card">
                  <div className="empty-icon"><Receipt size={28} /></div>
                  <h3>No expenses yet</h3>
                  <p style={{ color: 'var(--text-muted)' }}>Add your first expense or import from CSV</p>
                  <Link to={`/groups/${groupId}/expenses/new`} className="btn btn-primary">
                    <Plus size={16} /> Add Expense
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {expenses.map((expense) => (
                    <ExpenseRow
                      key={expense.id}
                      expense={expense}
                      currentUserId={user?.id}
                      expanded={expandedExpense === expense.id}
                      onToggle={() => setExpandedExpense(expandedExpense === expense.id ? null : expense.id)}
                      onDelete={() => deleteExpense(expense.id)}
                      deleting={deleting === expense.id}
                      groupId={groupId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settlements Tab */}
          {activeTab === 'settlements' && (
            <div>
              {settlements.length === 0 ? (
                <div className="empty-state card">
                  <div className="empty-icon"><ArrowRightLeft size={28} /></div>
                  <h3>No settlements yet</h3>
                  <p style={{ color: 'var(--text-muted)' }}>Record payments between members to update balances</p>
                  <Link to={`/groups/${groupId}/settle`} className="btn btn-success">
                    <ArrowRightLeft size={16} /> Record Settlement
                  </Link>
                </div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Amount</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map((s) => (
                        <tr key={s.id}>
                          <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {format(new Date(s.date), 'dd MMM yyyy')}
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <MemberAvatar name={s.payer.name} color={s.payer.avatarColor} size="xs" />
                              {s.payer.name}
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <MemberAvatar name={s.receiver.name} color={s.receiver.avatarColor} size="xs" />
                              {s.receiver.name}
                            </div>
                          </td>
                          <td><span className="amount-positive">{fmt(s.amount)}</span></td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{s.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Add Member Form Card */}
              {group.members.find((m) => m.userId === user?.id)?.role === 'admin' && (
                <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-elevated)' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={16} style={{ color: 'var(--primary)' }} /> Add a New Group Member
                  </h3>
                  <form onSubmit={handleAddMember} className="flex gap-3 items-end" style={{ flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <label htmlFor="new-member-email" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="new-member-email"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        placeholder="flatmate@example.com"
                        className="form-control"
                        required
                        style={{ background: 'var(--bg-card)' }}
                      />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                      <label htmlFor="new-member-name" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Name (Optional)
                      </label>
                      <input
                        type="text"
                        id="new-member-name"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        placeholder="John Doe"
                        className="form-control"
                        style={{ background: 'var(--bg-card)' }}
                      />
                    </div>
                    <div style={{ flex: '1 1 150px' }}>
                      <label htmlFor="new-member-joindate" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Join Date
                      </label>
                      <input
                        type="date"
                        id="new-member-joindate"
                        value={newMemberJoinDate}
                        onChange={(e) => setNewMemberJoinDate(e.target.value)}
                        className="form-control"
                        required
                        style={{ background: 'var(--bg-card)' }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={addingMember}
                      style={{ height: '42px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <Plus size={16} />
                      {addingMember ? 'Adding...' : 'Add Member'}
                    </button>
                  </form>
                </div>
              )}

              {/* Members Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                {(group.members || []).map((m) => (
                  <div key={m.userId} className="card flex items-center gap-3">
                    <MemberAvatar name={m.user.name} color={m.user.avatarColor} size="md" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{m.user.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Joined {format(new Date(m.joinedAt), 'dd MMM yyyy')}
                      </div>
                      {m.leftAt && (
                        <div className="badge badge-muted" style={{ marginTop: '0.25rem', fontSize: '0.7rem' }}>
                          Left {format(new Date(m.leftAt), 'dd MMM yy')}
                        </div>
                      )}
                      {m.role === 'admin' && (
                        <div className="badge badge-primary" style={{ marginTop: '0.25rem', fontSize: '0.7rem' }}>Admin</div>
                      )}
                    </div>
                    {/* Net balance for this member */}
                    {balances?.netBalances?.[m.userId] !== undefined && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: balances.netBalances[m.userId] >= 0 ? 'var(--success)' : 'var(--danger)',
                        }}>
                          {balances.netBalances[m.userId] >= 0 ? '+' : ''}
                          {fmt(balances.netBalances[m.userId])}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

// ── Expense Row Component ──────────────────────────────────────────────────
function ExpenseRow({ expense, currentUserId, expanded, onToggle, onDelete, deleting, groupId }) {
  const myShare = expense.shares?.find((s) => s.userId === currentUserId);
  const paidByMe = expense.paidById === currentUserId;

  const fmt = (n) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

  return (
    <div className="card" style={{ padding: '0' }}>
      {/* Main row */}
      <div
        className="flex items-center gap-3"
        style={{ padding: '1rem 1.25rem', cursor: 'pointer' }}
        onClick={onToggle}
        id={`expense-row-${expense.id}`}
      >
        {/* Split type badge */}
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--radius-sm)',
          background: 'var(--primary-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Receipt size={16} style={{ color: 'var(--primary)' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: '0.125rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem' }} className="truncate">
              {expense.description}
            </span>
            <span className="badge badge-muted" style={{ flexShrink: 0, fontSize: '0.675rem' }}>
              {SPLIT_LABELS[expense.splitType]}
            </span>
            {expense.originalCurrency && (
              <span className="badge badge-info" style={{ flexShrink: 0, fontSize: '0.675rem' }}>
                {expense.originalCurrency}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {format(new Date(expense.date), 'dd MMM yyyy')} ·{' '}
            <span style={{ color: expense.paidBy.id === currentUserId ? 'var(--primary-light)' : 'var(--text-muted)' }}>
              Paid by {paidByMe ? 'you' : expense.paidBy.name}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>
            {fmt(expense.amount)}
          </div>
          {myShare && (
            <div style={{
              fontSize: '0.8125rem',
              color: paidByMe ? 'var(--success)' : 'var(--danger)',
              fontWeight: 500,
            }}>
              {paidByMe
                ? `you get back ${fmt(Number(expense.amount) - Number(myShare.amount))}`
                : `you owe ${fmt(myShare.amount)}`}
            </div>
          )}
        </div>

        <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '1rem 1.25rem',
          background: 'var(--bg-elevated)',
          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
        }}>
          {/* Original currency info */}
          {expense.originalCurrency && (
            <div className="alert alert-info" style={{ marginBottom: '0.75rem', fontSize: '0.825rem' }}>
              Originally {expense.originalCurrency} {expense.originalAmount} · converted at 1 {expense.originalCurrency} = ₹{expense.exchangeRate}
            </div>
          )}

          {/* Notes */}
          {expense.notes && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
              📝 {expense.notes}
            </p>
          )}

          {/* Per-person shares (Rohan's requirement: see exactly which shares make up the balance) */}
          <div style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
              Split breakdown
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {expense.shares?.map((share) => (
                <div key={share.userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MemberAvatar name={share.user.name} color={share.user.avatarColor} size="xs" />
                    <span style={{ fontSize: '0.875rem' }}>
                      {share.user.name}
                      {share.user.id === expense.paidById && (
                        <span className="badge badge-primary" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>paid</span>
                      )}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {share.percentage && <span style={{ color: 'var(--text-muted)', marginRight: '0.5rem' }}>{parseFloat(share.percentage).toFixed(1)}%</span>}
                    {share.shareUnit && <span style={{ color: 'var(--text-muted)', marginRight: '0.5rem' }}>×{share.shareUnit}</span>}
                    <strong>{fmt(share.amount)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2" style={{ marginTop: '0.75rem' }}>
            <Link
              to={`/groups/${groupId}/expenses/${expense.id}/edit`}
              className="btn btn-ghost btn-sm"
            >
              <ExternalLink size={14} /> Edit
            </Link>
            <button
              className="btn btn-danger btn-sm"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              disabled={deleting}
              id={`delete-expense-${expense.id}`}
            >
              <Trash2 size={14} />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
