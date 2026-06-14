import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Landing() {
  const { isAuthenticated } = useAuth();

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing-page animate-fade-in">
      {/* --- HEADER --- */}
      <header className="landing-header">
        <div className="landing-logo">SplitSmart</div>
        <nav className="landing-nav">
          <a href="#about">About Us</a>
          <a href="#features">Features</a>
          <a href="#reviews">Reviews</a>
          <a href="#newsletter">Newsletter</a>
        </nav>
        <div className="landing-header-actions">
          <Link to="/login" className="landing-btn-signin">
            Sign In
          </Link>
          <Link to="/register" className="landing-btn-download">
            Download App
          </Link>
        </div>
      </header>

      {/* --- HERO SECTION --- */}
      <div className="landing-hero-container">
        {/* Left column */}
        <div className="landing-hero-left">
          <div className="landing-tag">
            <span className="landing-tag-icon">⚡</span> INSTANT SPLIT
          </div>
          <h1 className="landing-title">
            Split & Share <br />
            Expenses with <span className="landing-title-highlight">Friends and Family</span>
          </h1>
          <p className="landing-subtitle">
            Simplify group expenses effortlessly. Our user-friendly app makes bill splitting,
            expense tracking, and payments coordination seamless. Gain financial clarity
            and peace of mind with SplitSmart
          </p>

          <Link to="/register" className="landing-btn-cta">
            Open a SplitSmart Account
          </Link>

          <div className="landing-social-proof">
            <div className="landing-avatar-stack">
              <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&fit=crop&crop=faces&q=80" alt="User 1" />
              <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&fit=crop&crop=faces&q=80" alt="User 2" />
              <img src="https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=80&fit=crop&crop=faces&q=80" alt="User 3" />
              <img src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&fit=crop&crop=faces&q=80" alt="User 4" />
            </div>
            <p className="landing-social-text">
              The best application to manage <br /> your Expenses in group
            </p>
          </div>
        </div>

        {/* Right column (Mock UI / Phone Showcase) */}
        <div className="landing-hero-right">
          {/* Main frame container representing the phone showcase */}
          <div className="landing-mock-phone">
            {/* Header profile inside phone */}
            <div className="phone-user-header">
              <img
                className="phone-avatar"
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&fit=crop&crop=faces&q=80"
                alt="Kianna"
              />
              <div className="phone-user-text">
                <span className="phone-user-welcome">Hi Kianna</span>
                <span className="phone-user-sub">Make your groups and split bill easily</span>
              </div>
            </div>

            {/* Card: Trip to Paris */}
            <div className="phone-card-group">
              <div className="phone-card-header">
                <span className="phone-card-icon">🏰</span>
                <span className="phone-card-title">Trip to Paris</span>
              </div>
              <div className="phone-card-grid">
                <div>
                  <span className="phone-card-label">Total</span>
                  <span className="phone-card-val">$3800</span>
                </div>
                <div>
                  <span className="phone-card-label">To Collect</span>
                  <span className="phone-card-val-collect">$900</span>
                </div>
              </div>

              <div className="phone-card-footer">
                <div className="phone-card-split-users">
                  <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=60&fit=crop&crop=faces&q=80" alt="Split 1" />
                  <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60&fit=crop&crop=faces&q=80" alt="Split 2" />
                  <img src="https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=60&fit=crop&crop=faces&q=80" alt="Split 3" />
                  <img src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=60&fit=crop&crop=faces&q=80" alt="Split 4" />
                </div>
                <button type="button" className="phone-btn-view">
                  View Split
                </button>
              </div>
            </div>

            {/* Expense History List */}
            <div className="phone-history-section">
              <div className="phone-history-header">
                <span className="phone-history-title">Expense History</span>
                <span className="phone-history-link">View All</span>
              </div>

              <div className="phone-history-list">
                {/* Row 1 */}
                <div className="phone-history-row">
                  <div className="history-row-icon icon-resort">🌴</div>
                  <div className="history-row-details">
                    <span className="history-item-name">Resort Booking</span>
                    <span className="history-item-meta">Trip to Paris - Paid by Rini</span>
                    <span className="history-item-date">18 Mar 2026, 10:30 AM</span>
                  </div>
                  <span className="history-item-price">$600</span>
                </div>

                {/* Row 2 */}
                <div className="phone-history-row">
                  <div className="history-row-icon icon-food">🥐</div>
                  <div className="history-row-details">
                    <span className="history-item-name">Breakfast At Hotel</span>
                    <span className="history-item-meta">Trip to Paris - Paid by You</span>
                    <span className="history-item-date">12 Mar 2026, 08:15 PM</span>
                  </div>
                  <span className="history-item-price">$500</span>
                </div>

                {/* Row 3 */}
                <div className="phone-history-row">
                  <div className="history-row-icon icon-beach">🏄</div>
                  <div className="history-row-details">
                    <span className="history-item-name">Beach</span>
                    <span className="history-item-meta">Beach Shopping - Paid by Annie</span>
                  </div>
                  <span className="history-item-price">$300</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- FOOTER BANNER --- */}
      <footer className="landing-footer-banner">
        <h2>Your Partner in Group Finance Management</h2>
      </footer>
    </div>
  );
}
