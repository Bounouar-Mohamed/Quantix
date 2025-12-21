'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Health {
  openai: boolean;
  overall: boolean;
  timestamp: string;
}

interface GlobalStats {
  uniqueUsers: number;
  totalRequests: number;
  totalTokens: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  avgTokensPerRequest: number;
  requestsByEndpoint: Record<string, number>;
  tokensByEndpoint: Record<string, number>;
  lastRequest: string;
}

interface UserStats {
  userId: string;
  totalRequests: number;
  totalTokens: number;
  requestsByEndpoint: Record<string, number>;
  lastRequest: string;
}

interface EndpointStats {
  endpoint: string;
  totalRequests: number;
  totalTokens: number;
  avgDuration: number;
  successRate: number;
  uniqueUsers: number;
}

interface TenantUsage {
  tenant: {
    id: string;
    name: string;
    slug: string;
    email?: string;
    active: boolean;
  };
  pricing: {
    billingModel: string;
    pricePerUser: number;
    flatMonthlyFee: number;
    chatPricePerRequest: number;
    chatPricePerToken: number;
    realtimePricePerMinute: number;
    monthlyMinimum: number;
    discountPercent: number;
  } | null;
  usage: {
    uniqueUsers: number;
    totalRequests: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
  };
  financials: {
    costOpenAI: number;
    revenue: number;
    profit: number;
    margin: number;
  };
}

interface DbUserUsage {
  id: string;
  userId: string;
  tenantId?: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  totalCost: number;
  channel: string;
  lastSeen: string;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
  pricing?: {
    billingModel: string;
    pricePerUser: number;
  };
  revenuePerUser: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════════════════

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1';

async function fetchHealth(): Promise<Health> {
  try {
    const res = await fetch(`${API}/ai/health`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return { openai: false, overall: false, timestamp: new Date().toISOString() };
  }
}

async function fetchStats(): Promise<GlobalStats | null> {
  try {
    const res = await fetch(`${API}/monitoring/stats`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
  }
}

async function fetchUsers(): Promise<UserStats[]> {
  try {
    const res = await fetch(`${API}/monitoring/users`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return [];
  }
}

async function fetchModels(): Promise<string[]> {
  try {
    const res = await fetch(`${API}/ai/models`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return [];
  }
}

async function fetchEndpointStats(endpoint: string): Promise<EndpointStats | null> {
  try {
    const res = await fetch(`${API}/monitoring/endpoint/${encodeURIComponent(endpoint)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
  }
}

async function testAI(): Promise<{ ok: boolean; msg: string; ms?: number }> {
  try {
    const t0 = Date.now();
    const res = await fetch(`${API}/ai/test`, { method: 'POST', cache: 'no-store' });
    const ms = Date.now() - t0;
    if (!res.ok) throw new Error('Test failed');
    const data = await res.json();
    return { ok: true, msg: data.message || 'OK', ms };
  } catch (e: any) {
    return { ok: false, msg: e.message || 'Error' };
  }
}

async function fetchTenantUsage(): Promise<{ tenants: TenantUsage[]; totals: any } | null> {
  try {
    const res = await fetch(`${API}/monitoring/db/usage/by-tenant`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
  }
}

async function fetchDbUsage(): Promise<DbUserUsage[]> {
  try {
    const res = await fetch(`${API}/monitoring/db/usage?limit=20`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const s = {
  grid: { display: 'grid', gap: '16px', marginBottom: '24px' },
  grid4: { gridTemplateColumns: 'repeat(4, 1fr)' },
  grid3: { gridTemplateColumns: 'repeat(3, 1fr)' },
  grid2: { gridTemplateColumns: 'repeat(2, 1fr)' },
  card: { border: '1px solid #27272a', borderRadius: '8px', padding: '16px', background: '#0a0a0a' },
  cardTitle: { fontSize: '10px', color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '12px' },
  metric: { fontSize: '28px', fontWeight: 'bold' },
  metricLabel: { fontSize: '11px', color: '#71717a', marginTop: '4px' },
  btn: { padding: '8px 16px', fontSize: '12px', border: '1px solid #3f3f46', borderRadius: '6px', background: 'transparent', color: '#fff', cursor: 'pointer' },
  btnPrimary: { padding: '8px 16px', fontSize: '12px', border: 'none', borderRadius: '6px', background: '#fff', color: '#000', cursor: 'pointer', fontWeight: '500' },
  table: { width: '100%', fontSize: '12px', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, padding: '12px 8px', borderBottom: '1px solid #27272a', color: '#71717a', fontWeight: '500' },
  td: { padding: '12px 8px', borderBottom: '1px solid #27272a' },
  alert: (ok: boolean) => ({ padding: '12px 16px', borderRadius: '6px', fontSize: '12px', marginBottom: '24px', background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: ok ? '#4ade80' : '#f87171' }),
  sectionTitle: { fontSize: '14px', fontWeight: '600', marginBottom: '16px', marginTop: '32px', display: 'flex', alignItems: 'center', gap: '8px' },
  dot: (active: boolean) => ({ width: '8px', height: '8px', borderRadius: '50%', background: active ? '#22c55e' : '#ef4444' }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={s.card}>
      <div style={s.cardTitle}>{title}</div>
      {children}
    </div>
  );
}

function Metric({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div>
      <div style={{ ...s.metric, color: color || '#fff' }}>{value}</div>
      <div style={s.metricLabel}>{label}</div>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [users, setUsers] = useState<UserStats[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [endpointDetails, setEndpointDetails] = useState<Map<string, EndpointStats>>(new Map());
  const [tenantData, setTenantData] = useState<{ tenants: TenantUsage[]; totals: any } | null>(null);
  const [dbUsage, setDbUsage] = useState<DbUserUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; ms?: number } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [h, st, u, m, td, du] = await Promise.all([
      fetchHealth(), 
      fetchStats(), 
      fetchUsers(), 
      fetchModels(),
      fetchTenantUsage(),
      fetchDbUsage(),
    ]);
    setHealth(h);
    setStats(st);
    setUsers(u);
    setModels(m);
    setTenantData(td);
    setDbUsage(du);
    
    if (st?.requestsByEndpoint) {
      const endpoints = Object.keys(st.requestsByEndpoint).slice(0, 10);
      const details = await Promise.all(
        endpoints.map(async (ep) => {
          const detail = await fetchEndpointStats(ep);
          return [ep, detail] as [string, EndpointStats | null];
        })
      );
      const map = new Map<string, EndpointStats>();
      details.forEach(([ep, detail]) => {
        if (detail) map.set(ep, detail);
      });
      setEndpointDetails(map);
    }
    
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const r = await testAI();
    setTestResult(r);
    setTesting(false);
  };

  const topEndpoints = stats?.requestsByEndpoint 
    ? Object.entries(stats.requestsByEndpoint)
        .map(([endpoint, count]) => ({ 
          endpoint, 
          count,
          tokens: stats.tokensByEndpoint?.[endpoint] || 0,
          details: endpointDetails.get(endpoint)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    : [];

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
          Dernière mise à jour: {lastRefresh ? lastRefresh.toLocaleTimeString() : '-'}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={s.btn} onClick={refresh} disabled={loading}>
            {loading ? '...' : '↻ Rafraîchir'}
          </button>
          <button style={s.btnPrimary} onClick={handleTest} disabled={testing}>
            {testing ? 'Test...' : '⚡ Tester l\'IA'}
          </button>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div style={s.alert(testResult.ok)}>
          {testResult.ok ? '✓' : '✗'} {testResult.msg} {testResult.ms && `(${testResult.ms}ms)`}
        </div>
      )}

      {/* System Status */}
      <div style={s.sectionTitle}><span>📡</span> État du Système</div>
      <div style={{ ...s.grid, ...s.grid4 }}>
        <Card title="OpenAI API">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={s.dot(health?.openai ?? false)} />
            <span style={{ fontSize: '14px' }}>{health?.openai ? 'Connecté' : 'Déconnecté'}</span>
          </div>
        </Card>
        <Card title="Système">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={s.dot(health?.overall ?? false)} />
            <span style={{ fontSize: '14px' }}>{health?.overall ? 'Sain' : 'Dégradé'}</span>
          </div>
        </Card>
        <Card title="Utilisateurs Actifs">
          <Metric value={stats?.uniqueUsers ?? 0} label="utilisateurs uniques" />
        </Card>
        <Card title="Taux de Succès">
          <Metric 
            value={`${(stats?.successRate ?? 0).toFixed(1)}%`} 
            label="requêtes réussies"
            color={stats?.successRate && stats.successRate > 95 ? '#4ade80' : stats?.successRate && stats.successRate > 80 ? '#facc15' : '#f87171'}
          />
        </Card>
      </div>

      {/* Key Metrics */}
      <div style={s.sectionTitle}><span>📊</span> Métriques Clés</div>
      <div style={{ ...s.grid, gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <Card title="Total Requêtes">
          <Metric value={fmt(stats?.totalRequests ?? 0)} label="depuis le départ" />
        </Card>
        <Card title="Réussies">
          <Metric value={fmt(stats?.successfulRequests ?? 0)} label="requêtes" color="#4ade80" />
        </Card>
        <Card title="Échouées">
          <Metric value={fmt(stats?.failedRequests ?? 0)} label="requêtes" color="#f87171" />
        </Card>
        <Card title="Total Tokens">
          <Metric value={fmt(stats?.totalTokens ?? 0)} label="consommés" />
        </Card>
        <Card title="Moy. Tokens/Req">
          <Metric value={(stats?.avgTokensPerRequest ?? 0).toFixed(0)} label="tokens par requête" />
        </Card>
      </div>

      {/* Endpoints */}
      <div style={s.sectionTitle}><span>🔗</span> Performance des Endpoints</div>
      <Card title="Statistiques par Endpoint">
        {topEndpoints.length === 0 ? (
          <span style={{ color: '#71717a', fontSize: '12px' }}>Aucune donnée disponible</span>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Endpoint</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Requêtes</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Tokens</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Latence Moy.</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Taux Succès</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Users</th>
              </tr>
            </thead>
            <tbody>
              {topEndpoints.map((ep) => (
                <tr key={ep.endpoint}>
                  <td style={{ ...s.td, fontFamily: 'monospace' }}>{ep.endpoint}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{fmt(ep.count)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>{fmt(ep.tokens)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#a1a1aa' }}>
                    {ep.details ? fmtMs(ep.details.avgDuration) : '-'}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', color: ep.details ? (ep.details.successRate > 95 ? '#4ade80' : ep.details.successRate > 80 ? '#facc15' : '#f87171') : '#71717a' }}>
                    {ep.details ? `${ep.details.successRate.toFixed(1)}%` : '-'}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>
                    {ep.details?.uniqueUsers ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Models & Users */}
      <div style={{ ...s.grid, ...s.grid2, marginTop: '24px' }}>
        <Card title="Modèles Disponibles">
          {models.length === 0 ? (
            <span style={{ color: '#71717a', fontSize: '12px' }}>Aucun modèle chargé</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {models.slice(0, 8).map((m) => (
                <div key={m} style={{ fontSize: '12px', fontFamily: 'monospace', padding: '4px 8px', background: '#18181b', borderRadius: '4px', width: 'fit-content' }}>{m}</div>
              ))}
              {models.length > 8 && <span style={{ color: '#71717a', fontSize: '11px' }}>+{models.length - 8} autres</span>}
            </div>
          )}
        </Card>
        <Card title="Quotas Journaliers">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px' }}>CHAT</div>
              <div style={{ fontSize: '12px' }}>Max Requêtes: <span style={{ color: '#a1a1aa' }}>1 000/jour</span></div>
              <div style={{ fontSize: '12px' }}>Max Tokens: <span style={{ color: '#a1a1aa' }}>500 000/jour</span></div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px' }}>REALTIME</div>
              <div style={{ fontSize: '12px' }}>Max Requêtes: <span style={{ color: '#a1a1aa' }}>500/jour</span></div>
              <div style={{ fontSize: '12px' }}>Durée: <span style={{ color: '#a1a1aa' }}>Illimitée</span></div>
            </div>
          </div>
        </Card>
      </div>

      {/* Consommation par Client */}
      <div style={s.sectionTitle}><span>🏢</span> Consommation par Client</div>
      {tenantData && tenantData.tenants.length > 0 ? (
        <>
          {/* Totaux globaux */}
          <div style={{ ...s.grid, gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '16px' }}>
            <Card title="Revenus Total">
              <Metric value={`$${tenantData.totals.totalRevenue.toFixed(2)}`} label="facturé" color="#4ade80" />
            </Card>
            <Card title="Coûts OpenAI">
              <Metric value={`$${tenantData.totals.totalCostOpenAI.toFixed(2)}`} label="payé" color="#f87171" />
            </Card>
            <Card title="Bénéfice">
              <Metric 
                value={`$${tenantData.totals.totalProfit.toFixed(2)}`} 
                label="profit net" 
                color={tenantData.totals.totalProfit > 0 ? '#4ade80' : '#f87171'} 
              />
            </Card>
            <Card title="Marge">
              <Metric value={`${tenantData.totals.globalMargin}%`} label="marge globale" />
            </Card>
            <Card title="Total Tokens">
              <Metric value={fmt(tenantData.totals.totalTokens)} label="consommés" />
            </Card>
          </div>

          {/* Détail par client */}
          <Card title="Détail par Client">
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Client</th>
                  <th style={s.th}>Facturation</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Users</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Requêtes</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Tokens</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Coût OpenAI</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Revenu</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Profit</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Marge</th>
                </tr>
              </thead>
              <tbody>
                {tenantData.tenants.map((t) => (
                  <tr key={t.tenant.id}>
                    <td style={{ ...s.td, fontWeight: 'bold' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={s.dot(t.tenant.active)} />
                        {t.tenant.name}
                      </div>
                      <div style={{ fontSize: '10px', color: '#71717a', marginTop: '2px' }}>{t.tenant.slug}</div>
                    </td>
                    <td style={s.td}>
                      {t.pricing?.billingModel === 'per_user' ? (
                        <span style={{ background: '#18181b', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                          ${t.pricing.pricePerUser}/user
                        </span>
                      ) : t.pricing?.billingModel === 'flat' ? (
                        <span style={{ background: '#18181b', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                          ${t.pricing.flatMonthlyFee}/mois
                        </span>
                      ) : (
                        <span style={{ color: '#71717a', fontSize: '10px' }}>-</span>
                      )}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold' }}>{t.usage.uniqueUsers}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{fmt(t.usage.totalRequests)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>{fmt(t.usage.totalTokens)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#f87171' }}>${t.financials.costOpenAI.toFixed(2)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#4ade80', fontWeight: 'bold' }}>${t.financials.revenue.toLocaleString()}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: t.financials.profit > 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
                      ${t.financials.profit.toLocaleString()}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold' }}>{t.financials.margin}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <Card title="Détail par Client">
          <span style={{ color: '#71717a', fontSize: '12px' }}>Aucune donnée client disponible</span>
        </Card>
      )}

      {/* Consommation Utilisateurs (depuis DB) */}
      <div style={s.sectionTitle}><span>👥</span> Consommation Utilisateurs (Persistant)</div>
      <Card title="Détail par Utilisateur">
        {dbUsage.length === 0 ? (
          <span style={{ color: '#71717a', fontSize: '12px' }}>Aucune donnée disponible</span>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>User ID</th>
                <th style={s.th}>Client</th>
                <th style={s.th}>Canal</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Requêtes</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Tokens</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Coût OpenAI</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Facturé</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Dernière Activité</th>
              </tr>
            </thead>
            <tbody>
              {dbUsage.map((u) => (
                <tr key={u.id}>
                  <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '11px' }}>
                    {u.userId.length > 16 ? `${u.userId.slice(0, 8)}...${u.userId.slice(-4)}` : u.userId}
                  </td>
                  <td style={s.td}>
                    {u.tenant ? (
                      <span style={{ 
                        background: '#18181b', 
                        padding: '2px 8px', 
                        borderRadius: '4px', 
                        fontSize: '11px' 
                      }}>
                        {u.tenant.name}
                      </span>
                    ) : (
                      <span style={{ color: '#71717a', fontSize: '11px' }}>Non assigné</span>
                    )}
                  </td>
                  <td style={s.td}>
                    <span style={{ 
                      background: u.channel === 'realtime' ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)',
                      color: u.channel === 'realtime' ? '#4ade80' : '#60a5fa',
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      fontSize: '10px',
                      textTransform: 'uppercase',
                    }}>
                      {u.channel}
                    </span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{fmt(u.requests)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>{fmt(u.totalTokens)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#f87171' }}>${u.totalCost.toFixed(2)}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#4ade80', fontWeight: 'bold' }}>
                    {u.pricing?.billingModel === 'per_user' ? `$${u.revenuePerUser}` : '-'}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#71717a', fontSize: '11px' }}>
                    {new Date(u.lastSeen).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Active Users (mémoire) */}
      <div style={s.sectionTitle}><span>⚡</span> Activité en Temps Réel (Session)</div>
      <Card title="Utilisateurs Actifs (Mémoire)">
        {users.length === 0 ? (
          <span style={{ color: '#71717a', fontSize: '12px' }}>Aucun utilisateur actif</span>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>User ID</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Requêtes</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Tokens</th>
                <th style={s.th}>Endpoint Principal</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Dernière Activité</th>
              </tr>
            </thead>
            <tbody>
              {users.slice(0, 10).map((u) => {
                const topEndpoint = Object.entries(u.requestsByEndpoint || {}).sort(([, a], [, b]) => b - a)[0];
                return (
                  <tr key={u.userId}>
                    <td style={{ ...s.td, fontFamily: 'monospace' }}>
                      {u.userId.length > 20 ? `${u.userId.slice(0, 20)}...` : u.userId}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{fmt(u.totalRequests)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>{fmt(u.totalTokens)}</td>
                    <td style={{ ...s.td, fontFamily: 'monospace', color: '#71717a' }}>
                      {topEndpoint ? topEndpoint[0] : '-'}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#71717a' }}>
                      {u.lastRequest ? new Date(u.lastRequest).toLocaleTimeString() : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </DashboardLayout>
  );
}

