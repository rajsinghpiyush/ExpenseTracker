import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MemberAvatar from './MemberAvatar';
import {
  LayoutDashboard, Users, LogOut, Menu, X, ChevronRight,
  Wallet, Settings, CreditCard
} from 'lucide-react';

export default function Sidebar({ groups = [], currentGroupId = null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <>
      <div className="nav-logo">💸 SplitSmart</div>

      <nav>
        <div className="nav-section-label">Main</div>
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </NavLink>

        {groups.length > 0 && (
          <>
            <div className="nav-section-label">Your Groups</div>
            {groups.slice(0, 6).map((group) => (
              <NavLink
                key={group.id}
                to={`/groups/${group.id}`}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setMobileOpen(false)}
                style={{ overflow: 'hidden' }}
              >
                <div
                  style={{
                    width: 8, height: 8,
                    borderRadius: '50%',
                    background: '#6366f1',
                    flexShrink: 0,
                  }}
                />
                <span className="truncate">{group.name}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="nav-bottom">
        {user && (
          <div
            className="nav-item"
            style={{ gap: '0.75rem', cursor: 'default', marginBottom: '0.25rem' }}
          >
            <MemberAvatar name={user.name} color={user.avatarColor} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">
                {user.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} className="truncate">
                {user.email}
              </div>
            </div>
          </div>
        )}
        <button className="nav-item" onClick={handleLogout} style={{ width: '100%', color: 'var(--danger)' }}>
          <LogOut size={18} />
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
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
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
