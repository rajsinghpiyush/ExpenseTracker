import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import MemberAvatar from '../components/MemberAvatar';
import { format } from 'date-fns';
import { ArrowLeft, TrendingUp, TrendingDown, ArrowRightLeft, Info } from 'lucide-react';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Math.abs(n));

export default function Balances() {
  const { groupId } = useParams();
  const [balances, setBalances] = useState(null);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [groupId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [balRes, groupRes] = await Promise.all([
        api.get(`/groups/${groupId}/balances`),
        api.get(`/groups/${groupId}`),
      ]);
      setBalances(balRes.data);
      setGroup(groupRes.data.group);
    } finally {
      setLoading(false);
    }
  };

  const loadBreakdown = async (userId) => {
    setSelectedUser(userId);
    setBreakdownLoading(true);
    try {
      const res = await api.get(`/groups/${groupId}/balances/${userId}/breakdown`);
      setBreakdown(res.data);
    } finally {
      setBreakdownLoading(false);
    }
  };

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

  const users = balances?.users || {};
  const netBalances = balances?.netBalances || {};
  const minSettlements = balances?.minSettlements || [];

  const maxAbs = Math.max(...Object.values(netBalances).map(Math.abs), 1);

  return (
    <div className="app-layout">
      <Sidebar groups={[]} />
      <main className="main-content">
        <div className="content-container animate-fade-in">
          <Link to={`/groups/${groupId}`} className="btn btn-ghost btn-sm" style={{ marginBottom: '1.25rem', width: 'fit-content' }}>
            <ArrowLeft size={16} /> Back to Group
          </Link>

          <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>⚖️ Group Balances</h1>
          <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
            {group?.name} · {balances?.expenseCount} expenses · {balances?.settlementCount} settlements
          </p>

          {/* Aisha's requirement: one number per person */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Net Balance per Member</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Click any member to see which expenses contribute to their balance.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {Object.entries(netBalances)
                .sort(([, a], [, b]) => b - a)
                .map(([userId, balance]) => {
                  const user = users[userId];
                  if (!user) return null;
                  const pct = (Math.abs(balance) / maxAbs) * 100;
                  const isPos = balance >= 0;

                  return (
                    <div
                      key={userId}
                      className="flex items-center gap-3"
                      style={{ cursor: 'pointer' }}
                      onClick={() => loadBreakdown(userId)}
                      id={`balance-row-${userId}`}
                    >
                      <MemberAvatar name={user.name} color={user.avatarColor} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex justify-between" style={{ marginBottom: '0.375rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{user.name}</span>
                          <span style={{
                            fontWeight: 700,
                            color: isPos ? 'var(--success)' : balance < -0.01 ? 'var(--danger)' : 'var(--text-muted)',
                            fontSize: '1rem',
                          }}>
                            {balance > 0.01 ? '+' : balance < -0.01 ? '−' : ''}
                            {fmt(balance)}
                          </span>
                        </div>
                        <div className="balance-bar-wrap">
                          <div style={{ flex: 1 }}>
                            <div className="balance-bar-bg">
                              <div
                                className="balance-bar-fill"
                                style={{
                                  width: `${pct}%`,
                                  background: isPos ? 'var(--success)' : 'var(--danger)',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          Paid {fmt(balances.paidByUser[userId] || 0)} · Owed {fmt(balances.owedByUser[userId] || 0)}
                          {balances.settlementEffects?.[userId]
                            ? ` · Settlements ${balances.settlementEffects[userId] >= 0 ? '+' : ''}${fmt(balances.settlementEffects[userId])}`
                            : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Minimum settlements (Aisha's requirement: who pays whom) */}
          {minSettlements.length > 0 ? (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>💡 Minimum Settlements Required</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                {minSettlements.length} transfer{minSettlements.length !== 1 ? 's' : ''} to clear all debts
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {minSettlements.map((s, i) => (
                  <div key={i} className="flex items-center gap-3"
                    style={{
                      padding: '0.875rem 1rem',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-md)',
                    }}
                    id={`settlement-suggestion-${i}`}
                  >
                    <MemberAvatar name={s.from.name} color={s.from.avatarColor} size="sm" />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600 }}>{s.from.name}</span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 0.5rem' }}>pays</span>
                      <span style={{ fontWeight: 600 }}>{s.to.name}</span>
                    </div>
                    <ArrowRightLeft size={16} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--success)' }}>
                      {fmt(s.amount)}
                    </div>
                    <Link
                      to={`/groups/${groupId}/settle?from=${s.from.id}&to=${s.to.id}&amount=${s.amount}`}
                      className="btn btn-success btn-sm"
                    >
                      Settle
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '2rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎉</div>
              <h3>All settled up!</h3>
              <p style={{ color: 'var(--text-muted)' }}>No outstanding debts in this group.</p>
            </div>
          )}

          {/* Rohan's requirement: expense drill-down */}
          {selectedUser && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="flex items-center gap-3" style={{ marginBottom: '1rem' }}>
                {users[selectedUser] && (
                  <MemberAvatar name={users[selectedUser].name} color={users[selectedUser].avatarColor} size="md" />
                )}
                <div>
                  <h3>{users[selectedUser]?.name}'s Balance Breakdown</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Every expense that contributes to this balance
                  </p>
                </div>
              </div>

              {breakdownLoading ? (
                <div className="loading-overlay" style={{ minHeight: 100 }}>
                  <div className="spinner" />
                </div>
              ) : breakdown ? (
                <>
                  <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                    <div className="stat-card">
                      <div className="stat-label">Total Paid</div>
                      <div className="stat-value" style={{ color: 'var(--success)', fontSize: '1.25rem' }}>
                        {fmt(breakdown.totalPaid)}
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Total Owed</div>
                      <div className="stat-value" style={{ color: 'var(--danger)', fontSize: '1.25rem' }}>
                        {fmt(breakdown.totalOwed)}
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Net Balance</div>
                      <div className="stat-value" style={{
                        color: breakdown.netBalance >= 0 ? 'var(--success)' : 'var(--danger)',
                        fontSize: '1.25rem',
                      }}>
                        {breakdown.netBalance >= 0 ? '+' : '−'}{fmt(breakdown.netBalance)}
                      </div>
                    </div>
                  </div>

                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Paid by</th>
                          <th>Total</th>
                          <th>Their share</th>
                          <th>Effect</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.contributingExpenses?.map((e, i) => {
                          const paidBySelected = e.paidBy.id === selectedUser;
                          const effect = paidBySelected
                            ? Number(e.amount) - Number(e.shareAmount)
                            : -Number(e.shareAmount);
                          return (
                            <tr key={i}>
                              <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {format(new Date(e.date), 'dd MMM')}
                              </td>
                              <td>{e.description}</td>
                              <td>
                                <div className="flex items-center gap-1">
                                  <MemberAvatar name={e.paidBy.name} color={e.paidBy.avatarColor} size="xs" />
                                  <span style={{ fontSize: '0.875rem' }}>{paidBySelected ? 'them' : e.paidBy.name}</span>
                                </div>
                              </td>
                              <td>{fmt(e.amount)}</td>
                              <td>{fmt(e.shareAmount)}</td>
                              <td>
                                <span style={{ color: effect >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                  {effect >= 0 ? '+' : '−'}{fmt(effect)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
