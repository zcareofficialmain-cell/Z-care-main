import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Pill,
  Shield,
  Stethoscope,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import Logo from '@/components/ui/Logo';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/records', label: 'Records', icon: FileText },
  { to: '/medications', label: 'Medications', icon: Pill },
  { to: '/insurance', label: 'Insurance', icon: Shield },
  { to: '/consultations', label: 'Doctor History', icon: Stethoscope },
  { to: '/reminders', label: 'Reminders', icon: Bell },
  { to: '/assistant', label: 'Assistant', icon: Sparkles },
];

export default function AppNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { signOut, profile, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <nav className="nav-bar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <NavLink to="/dashboard" className="flex items-center no-underline">
            <Logo size="sm" />
          </NavLink>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'active' : ''}`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2">
            <NavLink
              to="/settings"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Settings size={16} />
            </NavLink>
            <div className="flex items-center gap-2 ml-2 pl-2" style={{ borderLeft: '1px solid var(--color-border-light)' }}>
              <div className="flex items-center justify-center rounded-full bg-mint-soft" style={{ width: 32, height: 32, backgroundColor: 'var(--color-mint-soft)' }}>
                <User size={16} style={{ color: 'var(--color-emerald-primary)' }} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium truncate max-w-[120px]">
                  {profile?.full_name || user?.email?.split('@')[0] || 'User'}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="btn-icon btn-ghost ml-1"
                aria-label="Sign Out"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden btn-icon btn-ghost"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 border-t" style={{ borderColor: 'var(--color-border-light)' }}>
            <div className="flex flex-col gap-1 pt-3">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'active' : ''}`
                  }
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <item.icon size={16} />
                  {item.label}
                </NavLink>
              ))}
              <NavLink
                to="/settings"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Settings size={16} />
                Settings
              </NavLink>
              <button
                onClick={handleSignOut}
                className="nav-link text-left"
                style={{ color: 'var(--color-danger)' }}
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
