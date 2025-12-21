'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '../../../components/DashboardLayout';

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
  period: string;
  chatRequests: number;
  chatTokensIn: number;
  chatTokensOut: number;
  chatTotalTokens: number;
  realtimeRequests: number;
  realtimeMinutes: number;
  costOpenAI: number;
  revenueChat: number;
  revenueRealtime: number;
  revenueTotal: number;
  uniqueUsers: number;
}

interface TenantBilling {
  id: string;
  period: string;
  subtotal: number;
  discount: number;
  total: number;
  costOpenAI: number;
  profit: number;
  margin: number;
  status: 'pending' | 'invoiced' | 'paid' | 'overdue';
  invoiceRef?: string;
}

interface UserUsage {
  id: string;
  userId: string;
  channel: string;
  requests: number;
  totalTokens: number;
  totalCost: number;
  lastSeen: string;
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
}

// ═══════════════════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════════════════

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1';

async function fetchTenant(id: string): Promise<Tenant | null> {
  try {
    const res = await fetch(`${API}/tenants/${id}`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch { return null; }
}

async function fetchUsage(id: string): Promise<TenantUsage | null> {
  try {
    const res = await fetch(`${API}/tenants/${id}/usage`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch { return null; }
}

async function fetchUsageHistory(id: string): Promise<TenantUsage[]> {
  try {
    const res = await fetch(`${API}/tenants/${id}/usage/history`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch { return []; }
}

async function fetchUsers(id: string): Promise<UserUsage[]> {
  try {
    const res = await fetch(`${API}/tenants/${id}/users`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch { return []; }
}

async function fetchBillingHistory(id: string): Promise<TenantBilling[]> {
  try {
    const res = await fetch(`${API}/tenants/${id}/billing/history`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch { return []; }
}

async function updatePricing(id: string, pricing: Partial<TenantPricing>): Promise<any> {
  try {
    const res = await fetch(`${API}/tenants/${id}/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pricing),
    });
    if (!res.ok) throw new Error();
    return res.json();
  } catch { return null; }
}

async function generateBilling(id: string): Promise<any> {
  try {
    const res = await fetch(`${API}/tenants/${id}/billing/generate`, { method: 'POST' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch { return null; }
}

async function aggregateUsage(id: string): Promise<any> {
  try {
    const res = await fetch(`${API}/tenants/${id}/usage/aggregate`, { method: 'POST' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const s = {
  grid: { display: 'grid', gap: '16px', marginBottom: '24px' },
  grid4: { gridTemplateColumns: 'repeat(4, 1fr)' },
  grid2: { gridTemplateColumns: 'repeat(2, 1fr)' },
  card: { border: '1px solid #27272a', borderRadius: '8px', padding: '16px', background: '#0a0a0a' },
  cardTitle: { fontSize: '10px', color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '12px' },
  metric: { fontSize: '28px', fontWeight: 'bold' },
  metricLabel: { fontSize: '11px', color: '#71717a', marginTop: '4px' },
  table: { width: '100%', fontSize: '12px', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, padding: '10px 8px', borderBottom: '1px solid #27272a', color: '#71717a', fontWeight: '500' },
  td: { padding: '10px 8px', borderBottom: '1px solid #27272a' },
  btn: { padding: '8px 16px', fontSize: '12px', border: '1px solid #3f3f46', borderRadius: '6px', background: 'transparent', color: '#fff', cursor: 'pointer' },
  btnPrimary: { padding: '8px 16px', fontSize: '12px', border: 'none', borderRadius: '6px', background: '#fff', color: '#000', cursor: 'pointer', fontWeight: '500' },
  inputSmall: { padding: '8px 12px', fontSize: '12px', background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', color: '#fff', width: '120px', outline: 'none' },
  badge: (color: string) => ({ padding: '3px 10px', fontSize: '10px', borderRadius: '9999px', fontWeight: '500', background: color === 'green' ? 'rgba(34,197,94,0.15)' : color === 'red' ? 'rgba(239,68,68,0.15)' : color === 'yellow' ? 'rgba(250,204,21,0.15)' : 'rgba(113,113,122,0.15)', color: color === 'green' ? '#4ade80' : color === 'red' ? '#f87171' : color === 'yellow' ? '#facc15' : '#a1a1aa' }),
  sectionTitle: { fontSize: '14px', fontWeight: '600', marginBottom: '16px', marginTop: '32px', display: 'flex', alignItems: 'center', gap: '8px' },
};

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

function fmtCurrency(n: number): string { return `€${n.toFixed(2)}`; }

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { paid: 'green', invoiced: 'yellow', pending: 'gray', overdue: 'red' };
  const labels: Record<string, string> = { paid: 'Payé', invoiced: 'Facturé', pending: 'En attente', overdue: 'En retard' };
  return <span style={s.badge(colors[status] || 'gray')}>{labels[status] || status}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [mounted, setMounted] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [usageHistory, setUsageHistory] = useState<TenantUsage[]>([]);
  const [users, setUsers] = useState<UserUsage[]>([]);
  const [billingHistory, setBillingHistory] = useState<TenantBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPricing, setEditingPricing] = useState(false);
  const [pricingForm, setPricingForm] = useState<Partial<TenantPricing>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [t, u, uh, us, bh] = await Promise.all([
      fetchTenant(id), fetchUsage(id), fetchUsageHistory(id), fetchUsers(id), fetchBillingHistory(id),
    ]);
    setTenant(t);
    setUsage(u);
    setUsageHistory(uh);
    setUsers(us);
    setBillingHistory(bh);
    if (t?.pricing) setPricingForm(t.pricing);
    setLoading(false);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSavePricing = async () => {
    setSaving(true);
    await updatePricing(id, pricingForm);
    setEditingPricing(false);
    await refresh();
    setSaving(false);
  };

  const handleGenerateBilling = async () => {
    await aggregateUsage(id);
    await generateBilling(id);
    await refresh();
  };

  if (!mounted || loading) {
    return <DashboardLayout><div style={{ color: '#71717a', padding: '48px', textAlign: 'center' }}>Chargement...</div></DashboardLayout>;
  }

  if (!tenant) {
    return <DashboardLayout><div style={{ color: '#f87171', padding: '48px', textAlign: 'center' }}>Client non trouvé</div></DashboardLayout>;
  }

  const profit = (usage?.revenueTotal ?? 0) - (usage?.costOpenAI ?? 0);
  const margin = usage?.revenueTotal ? (profit / usage.revenueTotal * 100) : 0;

  return (
    <DashboardLayout>
      {/* Client Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <button onClick={() => router.push('/clients')} style={{ ...s.btn, padding: '6px 12px' }}>← Retour</button>
            <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0 }}>{tenant.name}</h1>
            <span style={s.badge(tenant.active ? 'green' : 'gray')}>{tenant.active ? 'Actif' : 'Inactif'}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#71717a' }}>
            {tenant.slug} • {tenant.email || 'Pas d\'email'} • Créé le {new Date(tenant.createdAt).toLocaleDateString()}
          </div>
        </div>
        <button style={s.btnPrimary} onClick={handleGenerateBilling}>
          📄 Générer Facturation
        </button>
      </div>

      {/* Current Period Stats */}
      <div style={s.sectionTitle}><span>📊</span> Période Courante</div>
      <div style={{ ...s.grid, ...s.grid4 }}>
        <Card title="Utilisateurs"><Metric value={usage?.uniqueUsers ?? 0} label="actifs ce mois" /></Card>
        <Card title="Revenus"><Metric value={fmtCurrency(usage?.revenueTotal ?? 0)} label="ce mois" color="#4ade80" /></Card>
        <Card title="Coûts OpenAI"><Metric value={fmtCurrency(usage?.costOpenAI ?? 0)} label="ce mois" color="#f87171" /></Card>
        <Card title="Bénéfice"><Metric value={fmtCurrency(profit)} label={`marge: ${margin.toFixed(1)}%`} color={profit >= 0 ? '#4ade80' : '#f87171'} /></Card>
      </div>

      <div style={{ ...s.grid, ...s.grid4 }}>
        <Card title="Requêtes Chat"><Metric value={fmt(usage?.chatRequests ?? 0)} label={`${fmt(usage?.chatTotalTokens ?? 0)} tokens`} /></Card>
        <Card title="Sessions Realtime"><Metric value={fmt(usage?.realtimeRequests ?? 0)} label={`${(usage?.realtimeMinutes ?? 0).toFixed(1)} min`} /></Card>
        <Card title="Revenu Chat"><Metric value={fmtCurrency(usage?.revenueChat ?? 0)} label="ce mois" /></Card>
        <Card title="Revenu Realtime"><Metric value={fmtCurrency(usage?.revenueRealtime ?? 0)} label="ce mois" /></Card>
      </div>

      {/* Pricing Configuration */}
      <div style={s.sectionTitle}>
        <span>💰</span> Configuration Tarifaire
        {!editingPricing && <button style={{ ...s.btn, marginLeft: '16px', fontSize: '11px', padding: '4px 12px' }} onClick={() => setEditingPricing(true)}>Modifier</button>}
      </div>
      <div style={{ ...s.grid, ...s.grid2 }}>
        <Card title="Tarifs Chat">
          {editingPricing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px' }}>Prix/requête (€)</span>
                <input style={s.inputSmall} type="number" step="0.001" value={pricingForm.chatPricePerRequest ?? 0.01} onChange={(e) => setPricingForm({ ...pricingForm, chatPricePerRequest: parseFloat(e.target.value) })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px' }}>Prix/1K tokens (€)</span>
                <input style={s.inputSmall} type="number" step="0.0001" value={pricingForm.chatPricePerToken ?? 0.001} onChange={(e) => setPricingForm({ ...pricingForm, chatPricePerToken: parseFloat(e.target.value) })} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '12px' }}>
              <div style={{ marginBottom: '8px' }}>Prix/requête: <strong>€{tenant.pricing?.chatPricePerRequest?.toFixed(3) ?? '0.010'}</strong></div>
              <div>Prix/1K tokens: <strong>€{tenant.pricing?.chatPricePerToken?.toFixed(4) ?? '0.0010'}</strong></div>
            </div>
          )}
        </Card>
        <Card title="Tarifs Realtime">
          {editingPricing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px' }}>Prix/minute (€)</span>
                <input style={s.inputSmall} type="number" step="0.01" value={pricingForm.realtimePricePerMinute ?? 0.10} onChange={(e) => setPricingForm({ ...pricingForm, realtimePricePerMinute: parseFloat(e.target.value) })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px' }}>Prix/session (€)</span>
                <input style={s.inputSmall} type="number" step="0.01" value={pricingForm.realtimePricePerRequest ?? 0.05} onChange={(e) => setPricingForm({ ...pricingForm, realtimePricePerRequest: parseFloat(e.target.value) })} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '12px' }}>
              <div style={{ marginBottom: '8px' }}>Prix/minute: <strong>€{tenant.pricing?.realtimePricePerMinute?.toFixed(2) ?? '0.10'}</strong></div>
              <div>Prix/session: <strong>€{tenant.pricing?.realtimePricePerRequest?.toFixed(2) ?? '0.05'}</strong></div>
            </div>
          )}
        </Card>
      </div>
      {editingPricing && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button style={s.btnPrimary} onClick={handleSavePricing} disabled={saving}>{saving ? 'Sauvegarde...' : 'Enregistrer'}</button>
          <button style={s.btn} onClick={() => setEditingPricing(false)}>Annuler</button>
        </div>
      )}

      {/* Users */}
      <div style={s.sectionTitle}><span>👥</span> Utilisateurs ({users.length})</div>
      <Card title="Activité par Utilisateur">
        {users.length === 0 ? (
          <div style={{ color: '#71717a', fontSize: '12px', padding: '16px', textAlign: 'center' }}>Aucun utilisateur</div>
        ) : (
          <table style={s.table}>
            <thead><tr><th style={s.th}>User ID</th><th style={s.th}>Channel</th><th style={{ ...s.th, textAlign: 'right' }}>Requêtes</th><th style={{ ...s.th, textAlign: 'right' }}>Tokens</th><th style={{ ...s.th, textAlign: 'right' }}>Coût</th><th style={{ ...s.th, textAlign: 'right' }}>Dernière activité</th></tr></thead>
            <tbody>
              {users.slice(0, 15).map((u) => (
                <tr key={u.id}>
                  <td style={{ ...s.td, fontFamily: 'monospace' }}>{u.userId.length > 24 ? `${u.userId.slice(0, 24)}...` : u.userId}</td>
                  <td style={s.td}><span style={s.badge(u.channel === 'chat' ? 'gray' : 'yellow')}>{u.channel}</span></td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{fmt(u.requests)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>{fmt(u.totalTokens)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#f87171' }}>{fmtCurrency(u.totalCost)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>{new Date(u.lastSeen).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Billing History */}
      <div style={s.sectionTitle}><span>📄</span> Historique Facturation</div>
      <Card title="Factures">
        {billingHistory.length === 0 ? (
          <div style={{ color: '#71717a', fontSize: '12px', padding: '16px', textAlign: 'center' }}>Aucune facturation</div>
        ) : (
          <table style={s.table}>
            <thead><tr><th style={s.th}>Période</th><th style={{ ...s.th, textAlign: 'right' }}>Total</th><th style={{ ...s.th, textAlign: 'right' }}>Coût</th><th style={{ ...s.th, textAlign: 'right' }}>Bénéfice</th><th style={{ ...s.th, textAlign: 'right' }}>Marge</th><th style={{ ...s.th, textAlign: 'center' }}>Status</th></tr></thead>
            <tbody>
              {billingHistory.map((b) => (
                <tr key={b.id}>
                  <td style={s.td}>{b.period}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: '500' }}>{fmtCurrency(b.total)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#f87171' }}>{fmtCurrency(b.costOpenAI)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: b.profit >= 0 ? '#4ade80' : '#f87171' }}>{fmtCurrency(b.profit)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>{b.margin.toFixed(1)}%</td>
                  <td style={{ ...s.td, textAlign: 'center' }}><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Usage History */}
      <div style={s.sectionTitle}><span>📈</span> Historique Consommation</div>
      <Card title="Consommation Mensuelle">
        {usageHistory.length === 0 ? (
          <div style={{ color: '#71717a', fontSize: '12px', padding: '16px', textAlign: 'center' }}>Aucun historique</div>
        ) : (
          <table style={s.table}>
            <thead><tr><th style={s.th}>Période</th><th style={{ ...s.th, textAlign: 'right' }}>Chat</th><th style={{ ...s.th, textAlign: 'right' }}>Tokens</th><th style={{ ...s.th, textAlign: 'right' }}>RT Sessions</th><th style={{ ...s.th, textAlign: 'right' }}>RT Min</th><th style={{ ...s.th, textAlign: 'right' }}>Coût</th><th style={{ ...s.th, textAlign: 'right' }}>Revenus</th></tr></thead>
            <tbody>
              {usageHistory.map((u) => (
                <tr key={u.period}>
                  <td style={s.td}>{u.period}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{fmt(u.chatRequests)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>{fmt(u.chatTotalTokens)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{fmt(u.realtimeRequests)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>{u.realtimeMinutes.toFixed(1)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#f87171' }}>{fmtCurrency(u.costOpenAI)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#4ade80' }}>{fmtCurrency(u.revenueTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </DashboardLayout>
  );
}

