import { useState, useEffect, useCallback, useRef } from 'react'
import './AdminPages.css'

// ─── Event type labels (PT-BR) ────────────────────────────────────────────────
const EVENT_LABELS = {
  USER_LOGIN_SUCCESS:          'Login realizado',
  USER_LOGIN_FAILED:           'Falha no login',
  USER_LOGIN_BLOCKED:          'Login bloqueado',
  USER_REGISTER:               'Novo cadastro',
  USER_BLOCKED:                'Usuário bloqueado',
  USER_UNBLOCKED:              'Usuário desbloqueado',
  USER_UPDATED:                'Usuário atualizado',
  USER_PLAN_CHANGED:           'Plano alterado',
  USER_ROLE_CHANGED:           'Papel alterado',
  CONCURRENT_LOGIN_PREVENTED:  'Sessão duplicada detectada',
  PASSWORD_RESET_REQUESTED:    'Reset de senha solicitado',
  PASSWORD_RESET_COMPLETED:    'Senha redefinida',
  RULES_UPDATED:               'Regras de cálculo alteradas',
  LIMITS_UPDATED:              'Limites MEI alterados',
  SETTINGS_UPDATED:            'Configuração do sistema alterada',
  PLAN_CREATED:                'Plano criado',
  PLAN_UPDATED:                'Plano atualizado',
}

const LEVEL_CONFIG = {
  INFO:     { label: 'Info',     bg: 'rgba(37,99,235,0.18)',   color: '#93c5fd', dot: '#3b82f6' },
  WARN:     { label: 'Alerta',   bg: 'rgba(245,158,11,0.18)',  color: '#fcd34d', dot: '#f59e0b' },
  ERROR:    { label: 'Erro',     bg: 'rgba(239,68,68,0.18)',   color: '#fca5a5', dot: '#ef4444' },
  CRITICAL: { label: 'Crítico', bg: 'rgba(239,68,68,0.28)',   color: '#f87171', dot: '#dc2626' },
}

const SUSPICIOUS_TYPES = new Set([
  'USER_LOGIN_FAILED',
  'USER_LOGIN_BLOCKED',
  'CONCURRENT_LOGIN_PREVENTED',
  'USER_BLOCKED',
])

function LevelBadge({ level }) {
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.INFO
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
      {cfg.label}
    </span>
  )
}

function EventBadge({ type }) {
  const isSuspicious = SUSPICIOUS_TYPES.has(type)
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11,
      fontWeight: 500, maxWidth: 220,
      background: isSuspicious ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.06)',
      color: isSuspicious ? '#fcd34d' : '#cbd5e1',
      border: `1px solid ${isSuspicious ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
    }}>
      {EVENT_LABELS[type] || type}
    </span>
  )
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
}

function truncate(str, n = 30) {
  if (!str) return '—'
  return str.length > n ? str.substring(0, n) + '…' : str
}

// ─── Log Detail Modal ─────────────────────────────────────────────────────────
function LogDetail({ log, onClose }) {
  if (!log) return null
  let meta = {}
  try { meta = JSON.parse(log.metadata || '{}') } catch { }
  let oldVal = null, newVal = null
  try { if (log.old_value) oldVal = JSON.parse(log.old_value) } catch { }
  try { if (log.new_value) newVal = JSON.parse(log.new_value) } catch { }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, width: '95%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: '#e2e8f0' }}>Detalhes do Evento</h2>
            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>{formatDate(log.timestamp)}</p>
          </div>
          <LevelBadge level={log.level} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {[
            ['Tipo de Evento', <EventBadge type={log.event_type} />],
            ['Usuário', log.user_name ? `${log.user_name} (${log.user_email})` : `ID ${log.user_id || '—'}`],
            ['Papel', log.user_role || '—'],
            ['IP', log.ip_address || '—'],
            ['Device FP', truncate(log.device_fingerprint, 24)],
            ['Recurso', log.resource_type ? `${log.resource_type} #${log.resource_id || ''}` : '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
              <div style={{ color: '#e2e8f0', fontSize: 13 }}>{value}</div>
            </div>
          ))}
        </div>

        {Object.keys(meta).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>Metadados</div>
            <pre style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: 12, fontSize: 12, color: '#94a3b8', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        )}

        {(oldVal || newVal) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {oldVal && (
              <div>
                <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>Valor Anterior</div>
                <pre style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 12, fontSize: 12, color: '#fca5a5', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(oldVal, null, 2)}
                </pre>
              </div>
            )}
            {newVal && (
              <div>
                <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>Novo Valor</div>
                <pre style={{ background: 'rgba(37,99,235,0.06)', borderRadius: 8, padding: 12, fontSize: 12, color: '#93c5fd', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(newVal, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {log.user_agent && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>User-Agent</div>
            <div style={{ color: '#64748b', fontSize: 11, wordBreak: 'break-all' }}>{log.user_agent}</div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Sessions Panel ───────────────────────────────────────────────────────────
function SessionsPanel() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch('/api/admin/logs/sessions', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Carregando sessões...</div>

  return (
    <div>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
        {sessions.length} sessão(ões) ativa(s) no momento
      </p>
      {sessions.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#475569' }}>Nenhuma sessão ativa</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>IP</th>
                <th>Device</th>
                <th>Início</th>
                <th>Última Atividade</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{s.user_name || '—'}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{s.user_email}</div>
                  </td>
                  <td><code style={{ color: '#93c5fd', fontSize: 12 }}>{s.ip_address || '—'}</code></td>
                  <td><code style={{ color: '#94a3b8', fontSize: 11 }}>{truncate(s.device_fingerprint, 16)}</code></td>
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>{formatDate(s.created_at)}</td>
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>{formatDate(s.last_activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminLogs() {
  const [activeTab, setActiveTab] = useState('all') // all | suspicious | sessions
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [suspiciousCount, setSuspiciousCount] = useState(0)

  const [filters, setFilters] = useState({
    level: '',
    event_type: '',
    search: '',
    from: '',
    to: '',
  })

  const timerRef = useRef(null)

  const fetchLogs = useCallback(async (p = 1, currentFilters = filters, tab = activeTab) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const params = new URLSearchParams({
        page: p,
        limit: 50,
        ...(currentFilters.level      && { level:      currentFilters.level }),
        ...(currentFilters.event_type && { event_type: currentFilters.event_type }),
        ...(currentFilters.search     && { search:     currentFilters.search }),
        ...(currentFilters.from       && { from:       currentFilters.from }),
        ...(currentFilters.to         && { to:         currentFilters.to }),
        ...(tab === 'suspicious'      && { suspicious: 'true' }),
      })

      const res = await fetch(`/api/admin/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
    } catch (err) {
      console.error('Erro ao carregar logs:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, activeTab])

  // Fetch suspicious count for badge
  const fetchSuspiciousCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/logs?suspicious=true&limit=1', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setSuspiciousCount(data.total || 0)
    } catch { }
  }, [])

  useEffect(() => {
    fetchLogs(1, filters, activeTab)
    fetchSuspiciousCount()
  }, [activeTab])

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        fetchLogs(page, filters, activeTab)
        fetchSuspiciousCount()
      }, 15000)
    }
    return () => clearInterval(timerRef.current)
  }, [autoRefresh, page, filters, activeTab])

  const applyFilters = () => {
    setPage(1)
    fetchLogs(1, filters, activeTab)
  }

  const clearFilters = () => {
    const empty = { level: '', event_type: '', search: '', from: '', to: '' }
    setFilters(empty)
    setPage(1)
    fetchLogs(1, empty, activeTab)
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setPage(1)
    setFilters({ level: '', event_type: '', search: '', from: '', to: '' })
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#f1f5f9',
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
  }

  const selectStyle = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2393c5fd' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 30,
    cursor: 'pointer',
  }

  return (
    <div className="admin-page">
      <style>{`
        .admin-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .admin-table th {
          text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase;
          letter-spacing: 0.5px; color: #64748b; font-weight: 600;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .admin-table td {
          padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.04);
          color: #cbd5e1; vertical-align: middle;
        }
        .admin-table tr:hover td { background: rgba(255,255,255,0.025); cursor: pointer; }
        .logs-tab { padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 500;
          border: none; cursor: pointer; transition: all 0.2s; }
        .logs-tab.active { background: rgba(37,99,235,0.2); color: #93c5fd;
          box-shadow: 0 0 0 1px rgba(37,99,235,0.4); }
        .logs-tab:not(.active) { background: rgba(255,255,255,0.04); color: #64748b; }
        .logs-tab:not(.active):hover { background: rgba(255,255,255,0.07); color: #94a3b8; }
        .pagination-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04); color: #94a3b8; cursor: pointer; font-size: 13px; }
        .pagination-btn:hover:not(:disabled) { background: rgba(37,99,235,0.15); color: #93c5fd; }
        .pagination-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .log-row-suspicious td { background: rgba(245,158,11,0.04) !important; }
      `}</style>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Logs de Auditoria</h1>
          <p className="text-secondary">Rastreamento completo de atividades e segurança</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}>
            <div
              className={`admin-toggle ${autoRefresh ? 'active' : ''}`}
              onClick={() => setAutoRefresh(v => !v)}
              style={{ transform: 'scale(0.85)' }}
            />
            Auto-atualizar (15s)
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`logs-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => handleTabChange('all')}>
          Todos os Eventos
          <span style={{ marginLeft: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
            {activeTab === 'all' ? total : ''}
          </span>
        </button>
        <button className={`logs-tab ${activeTab === 'suspicious' ? 'active' : ''}`} onClick={() => handleTabChange('suspicious')}>
          Atividade Suspeita
          {suspiciousCount > 0 && (
            <span style={{ marginLeft: 8, background: 'rgba(245,158,11,0.25)', color: '#fcd34d', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
              {suspiciousCount}
            </span>
          )}
        </button>
        <button className={`logs-tab ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => handleTabChange('sessions')}>
          Sessões Ativas
        </button>
      </div>

      {activeTab === 'sessions' ? (
        <div className="plan-admin-card" style={{ background: 'linear-gradient(145deg, #1e2537 0%, #1a2035 100%)' }}>
          <SessionsPanel />
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="plan-admin-card" style={{ background: 'linear-gradient(145deg, #1e2537 0%, #1a2035 100%)', marginBottom: 16, padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Nível</label>
                <select
                  value={filters.level}
                  onChange={e => setFilters(f => ({ ...f, level: e.target.value }))}
                  style={{ ...selectStyle, minWidth: 120 }}
                >
                  <option value="">Todos</option>
                  <option value="INFO">Info</option>
                  <option value="WARN">Alerta</option>
                  <option value="ERROR">Erro</option>
                  <option value="CRITICAL">Crítico</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Tipo de Evento</label>
                <select
                  value={filters.event_type}
                  onChange={e => setFilters(f => ({ ...f, event_type: e.target.value }))}
                  style={{ ...selectStyle, minWidth: 200 }}
                >
                  <option value="">Todos</option>
                  {Object.entries(EVENT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 }}>
                <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Busca (usuário/IP)</label>
                <input
                  type="text"
                  placeholder="Nome, e-mail ou IP..."
                  value={filters.search}
                  onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && applyFilters()}
                  style={{ ...inputStyle, minWidth: 180 }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>De</label>
                <input
                  type="datetime-local"
                  value={filters.from}
                  onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Até</label>
                <input
                  type="datetime-local"
                  value={filters.to}
                  onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={applyFilters}>Filtrar</button>
                <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Limpar</button>
              </div>
            </div>
          </div>

          {/* Alert banner for suspicious tab */}
          {activeTab === 'suspicious' && suspiciousCount > 0 && (
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <span style={{ color: '#fcd34d', fontWeight: 600 }}>
                  {suspiciousCount} evento(s) suspeito(s) detectado(s)
                </span>
                <span style={{ color: '#94a3b8', fontSize: 13, marginLeft: 8 }}>
                  Verifique as tentativas de login falhas, sessões duplicadas e bloqueios.
                </span>
              </div>
            </div>
          )}

          {/* Logs table */}
          <div className="plan-admin-card" style={{ background: 'linear-gradient(145deg, #1e2537 0%, #1a2035 100%)', padding: 0 }}>
            {loading ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <div className="loader" />
              </div>
            ) : logs.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#475569' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div>Nenhum evento encontrado</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Data/Hora</th>
                      <th>Nível</th>
                      <th>Evento</th>
                      <th>Usuário</th>
                      <th>IP</th>
                      <th>Recurso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr
                        key={log.id}
                        className={SUSPICIOUS_TYPES.has(log.event_type) || log.level === 'WARN' ? 'log-row-suspicious' : ''}
                        onClick={() => setSelectedLog(log)}
                      >
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#94a3b8' }}>
                          {formatDate(log.timestamp)}
                        </td>
                        <td><LevelBadge level={log.level} /></td>
                        <td><EventBadge type={log.event_type} /></td>
                        <td>
                          {log.user_name ? (
                            <div>
                              <div style={{ fontWeight: 500, color: '#e2e8f0', fontSize: 13 }}>{log.user_name}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>{log.user_email}</div>
                            </div>
                          ) : (
                            <span style={{ color: '#475569', fontSize: 12 }}>Visitante</span>
                          )}
                        </td>
                        <td>
                          <code style={{ color: '#93c5fd', fontSize: 12 }}>{log.ip_address || '—'}</code>
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>
                          {log.resource_type ? `${log.resource_type} #${log.resource_id || ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pages > 1 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)'
              }}>
                <span style={{ color: '#64748b', fontSize: 13 }}>
                  {total} evento(s) total — página {page} de {pages}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="pagination-btn"
                    disabled={page <= 1}
                    onClick={() => { setPage(p => p - 1); fetchLogs(page - 1) }}
                  >← Anterior</button>
                  <button
                    className="pagination-btn"
                    disabled={page >= pages}
                    onClick={() => { setPage(p => p + 1); fetchLogs(page + 1) }}
                  >Próxima →</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {selectedLog && <LogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  )
}
