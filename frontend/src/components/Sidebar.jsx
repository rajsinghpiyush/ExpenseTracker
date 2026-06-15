import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import MemberAvatar from './MemberAvatar';
import {
  LayoutDashboard, Users, LogOut, Menu, X, ChevronRight,
  Settings, Activity, HelpCircle, Trophy, Layers, CreditCard, Plus
} from 'lucide-react';

export default function Sidebar({ groups: propGroups = null, currentGroupId = null, onAddGroupClick = null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [internalGroups, setInternalGroups] = useState([]);

  useEffect(() => {
    if (user) {
      api.get('/groups').then(res => {
        setInternalGroups(res.data.groups);
      }).catch(err => {
        console.error('Failed to load sidebar groups:', err);
      });
    }
  }, [user, location.pathname]);

  const groups = (propGroups && propGroups.length > 0) ? propGroups : internalGroups;

  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || (location.pathname === '/dashboard' ? 'dashboard' : '');

  const isTabActive = (tabName) => activeTab === tabName;


  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <>
      <div className="nav-logo">
        <div className="corporate-sidebar-logo-box">S</div>
        <span>SplitSmart</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <Link
          to="/dashboard"
          className={`nav-item ${isTabActive('dashboard') ? 'active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </Link>

        <Link
          to="/dashboard?tab=friends"
          className={`nav-item ${isTabActive('friends') ? 'active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <Users size={18} />
          Friends
        </Link>

        <Link
          to="/dashboard?tab=groups"
          className={`nav-item ${isTabActive('groups') ? 'active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <Users size={18} />
          Groups
        </Link>

        <Link
          to="/dashboard?tab=activity"
          className={`nav-item ${isTabActive('activity') ? 'active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <Activity size={18} />
          Activity
        </Link>

        <Link
          to="/dashboard?tab=settings"
          className={`nav-item ${isTabActive('settings') ? 'active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <Settings size={18} />
          Settings
        </Link>
      </nav>

      {/* Groups Section */}
      <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 1.5rem', marginBottom: '0.5rem',
          fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em'
        }}>
          <span>Groups</span>
          <button
            onClick={(e) => {
              e.preventDefault();
              if (onAddGroupClick) {
                onAddGroupClick();
              } else {
                navigate('/dashboard?createGroup=true');
              }
            }}
            style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
            title="Create a Group"
          >
            <Plus size={14} />
          </button>
        </div>
        <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '0 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }} className="sidebar-group-list">
          {groups.length === 0 ? (
            <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
              No groups yet
            </div>
          ) : (
            groups.map(g => (
              <Link
                key={g.id}
                to={`/groups/${g.id}`}
                className={`nav-item ${currentGroupId === g.id ? 'active' : ''}`}
                style={{
                  padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px',
                  display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0,
                  height: 'auto'
                }}
                onClick={() => setMobileOpen(false)}
              >
                <span style={{ fontSize: '0.9rem' }}>🏠</span>
                <span className="truncate" style={{ fontWeight: currentGroupId === g.id ? 700 : 500 }}>{g.name}</span>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Upgrade to Pro Banner */}
      <div className="corporate-pro-banner">
        {/* Simple decorative background graphic elements */}
        <div style={{
          position: 'absolute', right: '-10px', bottom: '-20px',
          width: '60px', height: '60px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', pointerEvents: 'none'
        }} />
        <div className="corporate-pro-title">Upgrade to Pro</div>
        <div className="corporate-pro-desc">Make the most out of Splitwise with Pro</div>
        <button className="corporate-pro-btn">Upgrade</button>
      </div>

      <div className="nav-bottom" style={{ marginTop: 'auto', borderTop: '1px solid #e5e7eb', paddingTop: '1rem', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
        {user && (
          <div
            className="nav-item"
            style={{ gap: '0.75rem', cursor: 'default', marginBottom: '0.5rem', background: 'transparent', hover: 'none', padding: '0.5rem 0' }}
          >
            <MemberAvatar name={user.name} color={user.avatarColor} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1f2937' }} className="truncate">
                {user.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280' }} className="truncate">
                {user.email}
              </div>
            </div>
          </div>
        )}
        <button className="nav-item" onClick={handleLogout} style={{ width: '100%', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="btn btn-ghost btn-icon"
        onClick={() => setMobileOpen(!mobileOpen)}
        style={{
          position: 'fixed', top: '1rem', left: '1rem',
          zIndex: 400, display: 'none',
        }}
        id="mobile-sidebar-toggle"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside className={`sidebar corporate-sidebar ${mobileOpen ? 'open' : ''}`}>
        <SidebarContent />
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 200, display: 'none',
          }}
          id="sidebar-backdrop"
        />
      )}
    </>
  );
}


