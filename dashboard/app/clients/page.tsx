'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '../../components/DashboardLayout';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface TenantPricing {
  chatPricePerRequest: number;
  chatPricePerToken: number;
  realtimePricePerMinute: number;
  realtimePricePerRequest: number;
  monthlyMinimum: number;
  discountPercent: number;
}

interface TenantUsage {
  chatRequests: number;
  chatTotalTokens: number;
  realtimeRequests: number;
  realtimeMinutes: number;
  costOpenAI: number;
  revenueTotal: number;
  uniqueUsers: number;
}

interface TenantBilling {
  id: string;
  subtotal: number;
  discount: number;
  total: number;
  costOpenAI: number;
  profit: number;
  margin: number;
  status: 'pending' | 'invoiced' | 'paid' | 'overdue';
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  email?: string;
  description?: string;
  active: boolean;
  createdAt: string;
  pricing?: TenantPricing;
  userCount?: number;
  currentUsage?: TenantUsage;
  currentBilling?: TenantBilling;
}

interface GlobalStats {
  period: string;
  tenants: { total: number; active: number };
  usage: {
    totalRequests: number;
    totalTokens: number;
    totalUsers: number;
    chatRequests: number;
    realtimeRequests: number;
    realtimeMinutes: number;
  };
  financial: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    avgMargin: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════════════════

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1';

async function fetchTenants(): Promise<Tenant[]> {
  try {
    const res = await fetch(`${API}/tenants/all-with-stats`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return [];
  }
}

async function fetchGlobalStats(): Promise<GlobalStats | null> {
  try {
    const res = await fetch(`${API}/tenants/stats`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
  }
}

async function createTenant(data: { name: string; slug: string; email?: string }): Promise<Tenant | null> {
  try {
    const res = await fetch(`${API}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
  }
}

async function generateBilling(tenantId: string): Promise<any> {
  try {
    const res = await fetch(`${API}/tenants/${tenantId}/billing/generate`, { method: 'POST' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
  }
}

async function forceAggregation(): Promise<any> {
  try {
    const res = await fetch(`${API}/tenants/cron/aggregate`, { method: 'POST' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const s = {
  grid: { display: 'grid', gap: '16px', marginBottom: '24px' },
  grid4: { gridTemplateColumns: 'repeat(4, 1fr)' },
  grid3: { gridTemplateColumns: 'repeat(3, 1fr)' },
  card: { border: '1px solid #27272a', borderRadius: '8px', padding: '16px', background: '#0a0a0a' },
  cardTitle: { fontSize: '10px', color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '12px' },
  metric: { fontSize: '28px', fontWeight: 'bold' },
  metricLabel: { fontSize: '11px', color: '#71717a', marginTop: '4px' },
  table: { width: '100%', fontSize: '12px', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, padding: '12px 8px', borderBottom: '1px solid #27272a', color: '#71717a', fontWeight: '500' },
  td: { padding: '12px 8px', borderBottom: '1px solid #27272a' },
  btn: { padding: '8px 16px', fontSize: '12px', border: '1px solid #3f3f46', borderRadius: '6px', background: 'transparent', color: '#fff', cursor: 'pointer' },
  btnPrimary: { padding: '8px 16px', fontSize: '12px', border: 'none', borderRadius: '6px', background: '#fff', color: '#000', cursor: 'pointer', fontWeight: '500' },
  btnSmall: { padding: '4px 10px', fontSize: '11px', border: '1px solid #3f3f46', borderRadius: '4px', background: 'transparent', color: '#fff', cursor: 'pointer' },
  badge: (color: string) => ({ 
    padding: '3px 10px', 
    fontSize: '10px', 
    borderRadius: '9999px', 
    fontWeight: '500',
    background: color === 'green' ? 'rgba(34,197,94,0.15)' : color === 'red' ? 'rgba(239,68,68,0.15)' : color === 'yellow' ? 'rgba(250,204,21,0.15)' : 'rgba(113,113,122,0.15)',
    color: color === 'green' ? '#4ade80' : color === 'red' ? '#f87171' : color === 'yellow' ? '#facc15' : '#a1a1aa',
  }),
  input: { width: '100%', padding: '10px 14px', fontSize: '13px', background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', color: '#fff', marginBottom: '12px', outline: 'none' },
  sectionTitle: { fontSize: '14px', fontWeight: '600', marginBottom: '16px', marginTop: '32px', display: 'flex', alignItems: 'center', gap: '8px' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={s.card}><div style={s.cardTitle}>{title}</div>{children}</div>;
}

function Metric({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return <div><div style={{ ...s.metric, color: color || '#fff' }}>{value}</div><div style={s.metricLabel}>{label}</div></div>;
}

function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(n < 100 ? 2 : 0);
}

function fmtCurrency(n: number): string {
  return `€${n.toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { paid: 'green', invoiced: 'yellow', pending: 'gray', overdue: 'red' };
  const labels: Record<string, string> = { paid: 'Payé', invoiced: 'Facturé', pending: 'En attente', overdue: 'En retard' };
  return <span style={s.badge(colors[status] || 'gray')}>{labels[status] || status}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function ClientsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: '', slug: '', email: '' });
  const [creating, setCreating] = useState(false);
  const [aggregating, setAggregating] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [t, s] = await Promise.all([fetchTenants(), fetchGlobalStats()]);
    setTenants(t);
    setGlobalStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreateTenant = async () => {
    if (!newTenant.name || !newTenant.slug) return;
    setCreating(true);
    const tenant = await createTenant(newTenant);
    if (tenant) {
      setShowNewForm(false);
      setNewTenant({ name: '', slug: '', email: '' });
      refresh();
    }
    setCreating(false);
  };

  const handleGenerateBilling = async (tenantId: string) => {
    await generateBilling(tenantId);
    refresh();
  };

  const handleForceAggregation = async () => {
    setAggregating(true);
    await forceAggregation();
    await refresh();
    setAggregating(false);
  };

  if (!mounted) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: '#71717a' }}>
          Chargement...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Actions Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: '#71717a' }}>
          Période: {globalStats?.period || 'Ce mois'}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={s.btn} onClick={handleForceAggregation} disabled={aggregating}>
            {aggregating ? '...' : '↻ Actualiser les stats'}
          </button>
          <button style={s.btnPrimary} onClick={() => setShowNewForm(true)}>
            + Nouveau Client
          </button>
        </div>
      </div>

      {/* New Tenant Form */}
      {showNewForm && (
        <div style={{ ...s.card, marginBottom: '24px', maxWidth: '400px' }}>
          <div style={s.cardTitle}>Nouveau Client</div>
          <input
            style={s.input}
            placeholder="Nom (ex: Reccos)"
            value={newTenant.name}
            onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
          />
          <input
            style={s.input}
            placeholder="Slug (ex: reccos)"
            value={newTenant.slug}
            onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
          />
          <input
            style={s.input}
            placeholder="Email (optionnel)"
            value={newTenant.email}
            onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={s.btnPrimary} onClick={handleCreateTenant} disabled={creating}>
              {creating ? 'Création...' : 'Créer'}
            </button>
            <button style={s.btn} onClick={() => setShowNewForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* Global Financial Stats */}
      <div style={s.sectionTitle}><span>💰</span> Vue Financière Globale</div>
      <div style={{ ...s.grid, ...s.grid4 }}>
        <Card title="Clients Actifs">
          <Metric value={globalStats?.tenants.active ?? 0} label={`sur ${globalStats?.tenants.total ?? 0} total`} />
        </Card>
        <Card title="Revenus">
          <Metric value={fmtCurrency(globalStats?.financial.totalRevenue ?? 0)} label="ce mois" color="#4ade80" />
        </Card>
        <Card title="Coûts OpenAI">
          <Metric value={fmtCurrency(globalStats?.financial.totalCost ?? 0)} label="ce mois" color="#f87171" />
        </Card>
        <Card title="Bénéfice Net">
          <Metric 
            value={fmtCurrency(globalStats?.financial.totalProfit ?? 0)} 
            label={`marge: ${(globalStats?.financial.avgMargin ?? 0).toFixed(1)}%`}
            color={(globalStats?.financial.totalProfit ?? 0) >= 0 ? '#4ade80' : '#f87171'}
          />
        </Card>
      </div>

      {/* Usage Stats */}
      <div style={{ ...s.grid, ...s.grid4 }}>
        <Card title="Requêtes Totales">
          <Metric value={fmt(globalStats?.usage.totalRequests ?? 0)} label="ce mois" />
        </Card>
        <Card title="Tokens Consommés">
          <Metric value={fmt(globalStats?.usage.totalTokens ?? 0)} label="tokens" />
        </Card>
        <Card title="Utilisateurs">
          <Metric value={globalStats?.usage.totalUsers ?? 0} label="users uniques" />
        </Card>
        <Card title="Sessions Realtime">
          <Metric value={`${(globalStats?.usage.realtimeMinutes ?? 0).toFixed(1)} min`} label={`${globalStats?.usage.realtimeRequests ?? 0} sessions`} />
        </Card>
      </div>

      {/* Clients Table */}
      <div style={s.sectionTitle}><span>🏢</span> Clients ({tenants.length})</div>
      <div style={s.card}>
        {tenants.length === 0 ? (
          <div style={{ color: '#71717a', fontSize: '12px', padding: '32px', textAlign: 'center' }}>
            <div style={{ marginBottom: '8px' }}>Aucun client configuré</div>
            <button style={s.btnPrimary} onClick={() => setShowNewForm(true)}>
              Créer votre premier client
            </button>
          </div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Client</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Users</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Requêtes</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Coût OpenAI</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Revenus</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Bénéfice</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const usage = tenant.currentUsage;
                const billing = tenant.currentBilling;
                const profit = billing?.profit ?? ((usage?.revenueTotal ?? 0) - (usage?.costOpenAI ?? 0));
                
                return (
                  <tr key={tenant.id}>
                    <td style={s.td}>
                      <div style={{ fontWeight: '500' }}>{tenant.name}</div>
                      <div style={{ fontSize: '10px', color: '#71717a' }}>{tenant.slug} • {tenant.email || 'Pas d\'email'}</div>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{usage?.uniqueUsers ?? tenant.userCount ?? 0}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {fmt((usage?.chatRequests ?? 0) + (usage?.realtimeRequests ?? 0))}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#f87171' }}>
                      {fmtCurrency(usage?.costOpenAI ?? billing?.costOpenAI ?? 0)}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#4ade80' }}>
                      {fmtCurrency(usage?.revenueTotal ?? billing?.total ?? 0)}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', color: profit >= 0 ? '#4ade80' : '#f87171', fontWeight: '500' }}>
                      {fmtCurrency(profit)}
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <StatusBadge status={billing?.status ?? 'pending'} />
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button 
                          style={s.btnSmall} 
                          onClick={() => handleGenerateBilling(tenant.id)}
                          title="Générer facturation"
                        >
                          📄 Facturer
                        </button>
                        <button 
                          style={s.btnSmall}
                          onClick={() => router.push(`/clients/${tenant.id}`)}
                          title="Voir détails"
                        >
                          Détails →
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pricing Info */}
      <div style={s.sectionTitle}><span>💵</span> Tarifs par Défaut</div>
      <div style={{ ...s.grid, ...s.grid3 }}>
        <Card title="Chat">
          <div style={{ fontSize: '12px' }}>
            <div style={{ marginBottom: '8px' }}>Prix/requête: <strong style={{ color: '#fff' }}>€0.01</strong></div>
            <div>Prix/1K tokens: <strong style={{ color: '#fff' }}>€0.001</strong></div>
          </div>
        </Card>
        <Card title="Realtime">
          <div style={{ fontSize: '12px' }}>
            <div style={{ marginBottom: '8px' }}>Prix/minute: <strong style={{ color: '#fff' }}>€0.10</strong></div>
            <div>Prix/session: <strong style={{ color: '#fff' }}>€0.05</strong></div>
          </div>
        </Card>
        <Card title="Options">
          <div style={{ fontSize: '12px' }}>
            <div style={{ marginBottom: '8px' }}>Minimum mensuel: <strong style={{ color: '#fff' }}>€0</strong></div>
            <div>Remise par défaut: <strong style={{ color: '#fff' }}>0%</strong></div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

