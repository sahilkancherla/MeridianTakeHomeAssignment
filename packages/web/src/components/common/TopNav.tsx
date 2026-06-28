import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';

/** Persistent top nav for Home and Settings (the Board has its own topbar). */
export function TopNav() {
  const email = useAuth((s) => s.user?.email);
  const signOut = useAuth((s) => s.signOut);
  const navigate = useNavigate();

  return (
    <header className="topnav">
      <Link className="topnav__brand" to="/">
        <span className="topnav__product">Meridian</span>
        <span className="topnav__mode">Whiteboard</span>
      </Link>
      <nav className="topnav__right">
        <Link to="/settings" className="topnav__link">
          Settings
        </Link>
        {email && <span className="topnav__user">{email}</span>}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={async () => {
            await signOut();
            navigate('/login', { replace: true });
          }}
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}
