import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import MemberAvatar from '../components/MemberAvatar';
import toast from 'react-hot-toast';
import { Plus, Users, TrendingUp, TrendingDown, Wallet, ArrowRight, X } from 'lucide-react';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [totalOwed, setTotalOwed] = useState(0);
  const [totalOwe, setTotalOwe] = useState(0);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const res = await api.get('/groups');
      setGroups(res.data.groups);
      // Aggregate quick net balance across all groups (optional future improvement)
    } catch (err) {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/groups', { name: newGroupName.trim() });
      toast.success('Group created!');
      setGroups((g) => [res.data.group, ...g]);
      setNewGroupName('');
      setShowCreate(false);
      navigate(`/groups/${res.data.group.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const activeMembers = (group) =>
    (group.members || []).filter((m) => !m.leftAt);

  return (
    <div className="app-layout">
      <Sidebar groups={groups} />
      <main className="main-content">
        <div className="content-container animate-fade-in">

          {/* Header */}
          <div className="page-header">
            <div>
              <h1 className="page-title">
                Hey, {user?.name?.split(' ')[0]} 👋
              </h1>
              <p className="page-subtitle">Here's an overview of your groups and balances</p>
            </div>
            <button
              id="create-group-btn"
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={18} /> New Group
            </button>
          </div>

          {/* Quick stats */}
          <div className="stats-grid" style={{ marginBottom: '2rem' }}>
            <div className="stat-card">
              <div className="stat-label"><Users size={14} /> Total Groups</div>
              <div className="stat-value" style={{ color: 'var(--primary-light)' }}>{groups.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><Wallet size={14} /> Active Groups</div>
              <div className="stat-value">{groups.filter((g) => !g.myLeftAt).length}</div>
            </div>
          </div>

          {/* Groups list */}
          {loading ? (
            <div className="loading-overlay"><div className="spinner spinner-lg" /></div>
          ) : groups.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-icon"><Users size={28} /></div>
              <h3>No groups yet</h3>
              <p style={{ color: 'var(--text-muted)' }}>Create a group to start tracking shared expenses</p>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={18} /> Create your first group
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {groups.map((group) => (
                <Link key={group.id} to={`/groups/${group.id}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ cursor: 'pointer', transition: 'all 0.2s', height: '100%' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
                      <div
                        style={{
                          width: 44, height: 44,
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--primary-dim)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '1.25rem',
                        }}
                      >
                        🏠
                      </div>
                      <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>

                    <h3 style={{ marginBottom: '0.375rem', fontSize: '1rem' }}>{group.name}</h3>
                    {group.description && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                        {group.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between" style={{ marginTop: '1rem' }}>
                      <div className="avatar-stack">
                        {activeMembers(group).slice(0, 5).map((m) => (
                          <MemberAvatar
                            key={m.userId}
                            name={m.user.name}
                            color={m.user.avatarColor}
                            size="xs"
                            showTooltip
                          />
                        ))}
                        {activeMembers(group).length > 5 && (
                          <div className="avatar avatar-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: '0.55rem' }}>
                            +{activeMembers(group).length - 5}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {group._count?.expenses || 0} expenses
                      </span>
                    </div>

                    {group.myLeftAt && (
                      <div className="badge badge-muted" style={{ marginTop: '0.75rem' }}>
                        Left {new Date(group.myLeftAt).toLocaleDateString('en-IN')}
                      </div>
                    )}
                  </div>
                </Link>
              ))}

              {/* Create group card */}
              <div
                className="card"
                style={{
                  cursor: 'pointer',
                  border: '2px dashed var(--border)',
                  background: 'transparent',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  minHeight: '160px', gap: '0.75rem',
                }}
                onClick={() => setShowCreate(true)}
                id="create-group-card"
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 'var(--radius-md)',
                  background: 'var(--primary-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Plus size={22} style={{ color: 'var(--primary)' }} />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Create new group</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Create Group Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create a New Group</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setShowCreate(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={createGroup}>
              <div className="form-group">
                <label className="form-label" htmlFor="group-name-input">Group name</label>
                <input
                  id="group-name-input"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Flat Expenses 2026"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button id="confirm-create-group" type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
