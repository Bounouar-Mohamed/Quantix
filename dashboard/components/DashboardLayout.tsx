'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface AuthUser {
  email: string;
}

interface HealthStatus {
  openai: boolean;
  overall: boolean;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Charger l'utilisateur
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setUser({ email: data.email });
        }
      })
      .catch(() => {});

    // Charger le health status
    fetch(`${API}/ai/health`)
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(() => setHealth({ openai: false, overall: false }));
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (error) {
      setLoggingOut(false);
    }
  };

  const navItems = [
    { href: '/', label: 'Dashboard', icon: '📊' },
    { href: '/clients', label: 'Clients', icon: '🏢' },
  ];

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <div style={styles.logoBox}>Q</div>
            <span style={styles.title}>Quantix</span>
          </div>
          <div style={styles.status}>
            <span style={{
              ...styles.dot,
              background: health?.overall ? '#22c55e' : '#ef4444',
            }} />
            <span style={{ fontSize: '11px', color: '#71717a' }}>
              {health?.overall ? 'Opérationnel' : 'Hors ligne'}
            </span>
          </div>
        </div>
        <div style={styles.headerRight}>
          {user && (
            <div style={styles.userBadge}>
              <span style={{ color: '#22c55e' }}>●</span>
              <span>{user.email}</span>
            </div>
          )}
          <button 
            onClick={handleLogout} 
            disabled={loggingOut}
            style={{
              ...styles.logoutBtn,
              opacity: loggingOut ? 0.5 : 1,
              cursor: loggingOut ? 'not-allowed' : 'pointer',
            }}
          >
            {loggingOut ? 'Déconnexion...' : 'Déconnexion'}
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav style={styles.nav}>
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            style={{
              ...styles.navLink,
              background: pathname === item.href ? '#fff' : 'transparent',
              color: pathname === item.href ? '#000' : '#fff',
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Content */}
      <main style={styles.main}>
        {children}
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <span>Quantix AI Service • v1.0.0</span>
        <span style={{ color: '#3f3f46' }}>•</span>
        <span>Backend: {API}</span>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: '1px solid #27272a',
    background: '#09090b',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoBox: {
    width: '32px',
    height: '32px',
    background: '#fff',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#000',
    fontWeight: 'bold',
    fontSize: '14px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  userBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: '#18181b',
    borderRadius: '6px',
    fontSize: '12px',
  },
  logoutBtn: {
    padding: '8px 16px',
    fontSize: '12px',
    border: '1px solid #7f1d1d',
    borderRadius: '6px',
    background: 'transparent',
    color: '#f87171',
    fontWeight: '500',
  },
  nav: {
    display: 'flex',
    gap: '8px',
    padding: '16px 24px',
    borderBottom: '1px solid #27272a',
    background: '#0a0a0a',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    border: '1px solid #27272a',
    borderRadius: '6px',
    textDecoration: 'none',
    transition: 'all 0.2s',
  },
  main: {
    flex: 1,
    padding: '24px',
    maxWidth: '1400px',
    width: '100%',
    margin: '0 auto',
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    padding: '24px',
    borderTop: '1px solid #27272a',
    fontSize: '11px',
    color: '#52525b',
  },
};

