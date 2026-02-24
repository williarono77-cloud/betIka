import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'
import ThemeToggle from './ThemeToggle.jsx'

const LEDGER_LIMIT = 50

function formatKes(cents) {
  return ((cents ?? 0) / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' KES'
}

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminDashboard({ user, setMessage, onNotAdmin }) {
  const [profileRole, setProfileRole] = useState(null)
  const [guardLoading, setGuardLoading] = useState(true)
  const [withdrawals, setWithdrawals] = useState([])
  const [withdrawalsError, setWithdrawalsError] = useState(null)
  const [deposits, setDeposits] = useState([])
  const [depositsError, setDepositsError] = useState(null)
  const [ledger, setLedger] = useState([])
  const [ledgerError, setLedgerError] = useState(null)
  const [ledgerUserId, setLedgerUserId] = useState('')
  const [processingId, setProcessingId] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState(null)
  const [stats, setStats] = useState({ totalUsers: null, totalBalanceCents: null })
  const [currentRound, setCurrentRound] = useState(null)
  const [roundError, setRoundError] = useState(null)
  const [nextRound, setNextRound] = useState(null)
  const [nextRoundError, setNextRoundError] = useState(null)

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    window.location.replace('/')
  }, [])

  // Admin guard: only profile.role === 'admin'
  useEffect(() => {
    if (!user?.id) {
      setGuardLoading(false)
      setProfileRole(null)
      return
    }
    let cancelled = false
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setProfileRole(null)
          return
        }
        setProfileRole(data?.role ?? null)
      })
      .finally(() => {
        if (!cancelled) setGuardLoading(false)
      })
    return () => { cancelled = true }
  }, [user?.id])

  // Redirect non-admin
  useEffect(() => {
    if (guardLoading) return
    if (!user) {
      if (onNotAdmin) onNotAdmin()
      else window.location.replace('/')
      return
    }
    if (profileRole !== 'admin') {
      if (onNotAdmin) onNotAdmin()
      else window.location.replace('/')
    }
  }, [guardLoading, user, profileRole, onNotAdmin])

  const fetchWithdrawals = useCallback(async () => {
    setWithdrawalsError(null)
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('id, amount_cents, phone, created_at')
      .eq('status', 'requested')
      .order('created_at', { ascending: true })
    if (error) {
      setWithdrawalsError(error.message)
      setWithdrawals([])
      return
    }
    setWithdrawals(data ?? [])
  }, [])

  const fetchDeposits = useCallback(async () => {
    setDepositsError(null)
    const { data, error } = await supabase
      .from('deposits')
      .select('id, user_id, amount_cents, external_ref, phone, created_at, status')
      .in('status', ['submitted', 'pending_submit'])
      .order('created_at', { ascending: true })
    if (error) {
      setDepositsError(error.message)
      setDeposits([])
      return
    }
    setDeposits(data ?? [])
  }, [])

  const fetchLedger = useCallback(async () => {
    setLedgerError(null)
    let q = supabase
      .from('ledger')
      .select('id, user_id, type, amount_cents, before_available_cents, after_available_cents, before_locked_cents, after_locked_cents, created_at, reference_table, reference_id')
      .order('created_at', { ascending: false })
      .limit(LEDGER_LIMIT)
    if (ledgerUserId?.trim()) {
      q = q.eq('user_id', ledgerUserId.trim())
    }
    const { data, error } = await q
    if (error) {
      setLedgerError(error.message)
      setLedger([])
      return
    }
    setLedger(data ?? [])
  }, [ledgerUserId])

  const fetchStats = useCallback(async () => {
    const [profilesRes, walletsRes] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('wallets').select('available_cents, locked_cents'),
    ])
    const totalUsers = profilesRes?.count ?? 0
    let totalBalanceCents = 0
    if (walletsRes?.data && Array.isArray(walletsRes.data)) {
      totalBalanceCents = walletsRes.data.reduce((s, w) => s + (w.available_cents ?? 0) + (w.locked_cents ?? 0), 0)
    }
    setStats({ totalUsers, totalBalanceCents })
  }, [])

  const fetchCurrentRound = useCallback(async () => {
    setRoundError(null)
    const { data, error } = await supabase.from('current_round').select('*').maybeSingle()
    if (error) {
      setRoundError(error.message)
      setCurrentRound(null)
      return
    }
    setCurrentRound(data)
  }, [])

  const fetchNextRound = useCallback(async () => {
    setNextRoundError(null)
    const { data, error } = await supabase
      .from('game_rounds')
      .select('id, round_id, round_number, status, starts_at, burst_point, created_at')
      .eq('status', 'live')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      setNextRoundError(error.message)
      setNextRound(null)
      return
    }
    setNextRound(data)
  }, [])

  useEffect(() => {
    if (profileRole !== 'admin') return
    fetchWithdrawals()
    fetchDeposits()
    fetchLedger()
    fetchStats()
    fetchCurrentRound()
    fetchNextRound()
  }, [profileRole, fetchWithdrawals, fetchDeposits, fetchLedger, fetchStats, fetchCurrentRound, fetchNextRound])

  // Realtime: withdrawal_requests and deposits
  useEffect(() => {
    if (profileRole !== 'admin') return
    const channel = supabase
      .channel('admin-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'withdrawal_requests' },
        () => fetchWithdrawals()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deposits' },
        () => fetchDeposits()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profileRole, fetchWithdrawals, fetchDeposits])

  // Realtime: current round and next round (when break loads, tables update; admin sees both)
  useEffect(() => {
    if (profileRole !== 'admin') return
    const channel = supabase
      .channel('admin-round-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rounds' }, () => {
        fetchCurrentRound()
        fetchNextRound()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profileRole, fetchCurrentRound, fetchNextRound])

  const openConfirm = (action, requestId, label, inputLabel, placeholder, submitLabel, type = 'withdrawal', amount = null) => {
    setConfirmConfig({
      action,
      requestId,
      label,
      inputLabel,
      placeholder: placeholder ?? '',
      submitLabel,
      value: '',
      type,
      amount,
    })
    setConfirmOpen(true)
  }

  const closeConfirm = () => {
    setConfirmOpen(false)
    setConfirmConfig(null)
  }

  const handleConfirmSubmit = async () => {
    if (!confirmConfig) return
    const { action, requestId, value } = confirmConfig
    setProcessingId(requestId)
    try {
      let error
      if (action === 'reject') {
        if (confirmConfig.type === 'deposit') {
          const res = await supabase.rpc('admin_deposit_reject', {
            p_deposit_id: requestId,
            p_admin_note: value?.trim() || null,
          })
          error = res.error
        } else {
          const res = await supabase.rpc('admin_withdraw_reject', {
            p_request_id: requestId,
            p_admin_note: value.trim(),
          })
          error = res.error
        }
      } else if (action === 'approve') {
        const res = await supabase.rpc('admin_deposit_approve', {
          p_deposit_id: requestId,
        })
        error = res.error
      } else {
        const res = await supabase.rpc('admin_withdraw_mark_paid', {
          p_request_id: requestId,
          p_paid_ref: value.trim(),
        })
        error = res.error
      }
      if (error) {
        setMessage?.({ type: 'error', text: error.message })
      } else {
        if (action === 'approve') {
          setMessage?.({ type: 'success', text: 'Deposit approved.' })
        } else if (action === 'reject') {
          setMessage?.({ type: 'success', text: confirmConfig.type === 'deposit' ? 'Deposit rejected.' : 'Withdrawal rejected.' })
        } else {
          setMessage?.({ type: 'success', text: 'Marked as paid.' })
        }
        closeConfirm()
        if (confirmConfig.type === 'deposit') {
          fetchDeposits()
        } else {
          fetchWithdrawals()
        }
      }
    } catch (e) {
      setMessage?.({ type: 'error', text: e?.message || 'Action failed' })
    } finally {
      setProcessingId(null)
    }
  }

  if (guardLoading || profileRole !== 'admin') {
    return (
      <div className="admin-dashboard">
        <div className="admin-dashboard__header">
          <h1 className="admin-dashboard__title">Admin Dashboard</h1>
        </div>
        <div className="admin-dashboard__loading">Checking access…</div>
      </div>
    )
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard__header">
        <h1 className="admin-dashboard__title">Admin Dashboard</h1>
        <nav className="admin-dashboard__nav" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <a href="/" className="admin-dashboard__nav-link" style={{ color: 'var(--accent-green)', textDecoration: 'none', fontWeight: 600 }}>Back to app</a>
          <ThemeToggle />
          <button type="button" className="admin-dashboard__btn admin-dashboard__btn--secondary" onClick={handleLogout}>
            Logout
          </button>
        </nav>
      </header>

      {/* Analytics */}
      <section className="admin-dashboard__grid" aria-label="Analytics">
        <div className="admin-dashboard__card">
          <div className="admin-dashboard__stat-value">{stats.totalUsers ?? '—'}</div>
          <div className="admin-dashboard__stat-label">Total users</div>
        </div>
        <div className="admin-dashboard__card">
          <div className="admin-dashboard__stat-value">{stats.totalBalanceCents != null ? formatKes(stats.totalBalanceCents) : '—'}</div>
          <div className="admin-dashboard__stat-label">Platform balance</div>
        </div>
        <div className="admin-dashboard__card">
          <div className="admin-dashboard__stat-value">{deposits.length}</div>
          <div className="admin-dashboard__stat-label">Pending deposits</div>
        </div>
        <div className="admin-dashboard__card">
          <div className="admin-dashboard__stat-value">{withdrawals.length}</div>
          <div className="admin-dashboard__stat-label">Pending withdrawals</div>
        </div>
      </section>

      {/* Next round / Current round */}
      <section className="admin-dashboard__card admin-dashboard__card--wide" style={{ marginBottom: '1.5rem' }}>
        <h3 className="admin-dashboard__card-title">Current round / Next round</h3>
        {roundError && <p className="text-error admin-dashboard__error">{roundError}</p>}
        {nextRoundError && <p className="text-error admin-dashboard__error">{nextRoundError}</p>}
        <div className="admin-dashboard__next-round">
          <div className="admin-dashboard__preview-card">
            <div className="admin-dashboard__card-title" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>Current round (from DB)</div>
            <div className="admin-dashboard__round-info">
              <div className="admin-dashboard__info-item">
                <span className="admin-dashboard__info-label">Round ID</span>
                <span className="admin-dashboard__info-value">{currentRound?.id ?? currentRound?.round_id ?? '—'}</span>
              </div>
              <div className="admin-dashboard__info-item">
                <span className="admin-dashboard__info-label">Status</span>
                <span className="admin-dashboard__info-value">{currentRound?.status ?? currentRound?.state ?? '—'}</span>
              </div>
              <div className="admin-dashboard__info-item">
                <span className="admin-dashboard__info-label">Starts at</span>
                <span className="admin-dashboard__info-value">{currentRound?.starts_at ? formatDate(currentRound.starts_at) : '—'}</span>
              </div>
              <div className="admin-dashboard__info-item">
                <span className="admin-dashboard__info-label">Burst / Result</span>
                <span className="admin-dashboard__info-value">{currentRound?.burst_point != null ? `${Number(currentRound.burst_point).toFixed(2)}x` : '—'}</span>
              </div>
            </div>
          </div>
          <div className="admin-dashboard__preview-card">
            <div className="admin-dashboard__card-title" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>Next round (from DB, live when break is loading)</div>
            <div className="admin-dashboard__round-info">
              <div className="admin-dashboard__info-item">
                <span className="admin-dashboard__info-label">Round ID</span>
                <span className="admin-dashboard__info-value">{nextRound?.id ?? nextRound?.round_id ?? '—'}</span>
              </div>
              <div className="admin-dashboard__info-item">
                <span className="admin-dashboard__info-label">Status</span>
                <span className="admin-dashboard__info-value">{nextRound?.status ?? '—'}</span>
              </div>
              <div className="admin-dashboard__info-item">
                <span className="admin-dashboard__info-label">Starts at</span>
                <span className="admin-dashboard__info-value">{nextRound?.starts_at ? formatDate(nextRound.starts_at) : '—'}</span>
              </div>
              <div className="admin-dashboard__info-item">
                <span className="admin-dashboard__info-label">Round #</span>
                <span className="admin-dashboard__info-value">{nextRound?.round_number ?? '—'}</span>
              </div>
            </div>
          </div>
          <button type="button" className="admin-dashboard__btn admin-dashboard__btn--secondary" onClick={() => { fetchCurrentRound(); fetchNextRound(); }}>
            Refresh rounds
          </button>
        </div>
      </section>

      {/* Deposit queue */}
      <div className="admin-dashboard__card admin-dashboard__card--wide" style={{ marginBottom: '1.5rem' }}>
        <h3 className="admin-dashboard__card-title">Deposit Queue</h3>
        {depositsError && <p className="text-error admin-dashboard__error">{depositsError}</p>}
        {deposits.length === 0 && !depositsError && (
          <div className="admin-dashboard__empty">No pending deposits</div>
        )}
        {deposits.length > 0 && (
          <div className="admin-dashboard__table-wrap">
            <table className="admin-dashboard__table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>M-Pesa Ref</th>
                  <th>Phone</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id}>
                    <td>{formatKes(d.amount_cents)}</td>
                    <td>{d.external_ref || '-'}</td>
                    <td>{d.phone ?? '-'}</td>
                    <td>{formatDate(d.created_at)}</td>
                    <td>
                      <div className="admin-dashboard__actions">
                        <button
                          type="button"
                          className="admin-dashboard__btn admin-dashboard__btn--reject"
                          disabled={!!processingId}
                          onClick={() => openConfirm('reject', d.id, 'Reject deposit', 'Admin note (optional)', 'Reason for rejection', 'Reject', 'deposit')}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="admin-dashboard__btn admin-dashboard__btn--pay"
                          disabled={!!processingId}
                          onClick={() => openConfirm('approve', d.id, 'Approve deposit', 'Confirm approval', '', 'Approve', 'deposit', d.amount_cents)}
                        >
                          Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Withdrawal queue */}
      <div className="admin-dashboard__card admin-dashboard__card--wide" style={{ marginBottom: '1.5rem' }}>
        <h3 className="admin-dashboard__card-title">Withdrawal Queue</h3>
        {withdrawalsError && <p className="text-error admin-dashboard__error">{withdrawalsError}</p>}
        {withdrawals.length === 0 && !withdrawalsError && (
          <div className="admin-dashboard__empty">No pending withdrawals</div>
        )}
        {withdrawals.length > 0 && (
          <div className="admin-dashboard__table-wrap">
            <table className="admin-dashboard__table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Phone</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((r) => (
                  <tr key={r.id}>
                    <td>{formatKes(r.amount_cents)}</td>
                    <td>{r.phone ?? '-'}</td>
                    <td>{formatDate(r.created_at)}</td>
                    <td>
                      <div className="admin-dashboard__actions">
                        <button
                          type="button"
                          className="admin-dashboard__btn admin-dashboard__btn--reject"
                          disabled={!!processingId}
                          onClick={() => openConfirm('reject', r.id, 'Reject withdrawal', 'Admin note', 'Reason for rejection', 'Reject')}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="admin-dashboard__btn admin-dashboard__btn--pay"
                          disabled={!!processingId}
                          onClick={() => openConfirm('pay', r.id, 'Mark as paid', 'Payment reference (e.g. M-Pesa code)', 'e.g. ABC123XYZ', 'Mark Paid')}
                        >
                          Mark Paid
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ledger view */}
      <div className="admin-dashboard__card admin-dashboard__card--wide">
        <h3 className="admin-dashboard__card-title">Ledger (last {LEDGER_LIMIT})</h3>
        <div className="admin-dashboard__ledger-filter">
          <label>
            <span className="admin-dashboard__filter-label">Filter by user_id:</span>
            <input
              type="text"
              className="admin-dashboard__input"
              placeholder="UUID or empty for all"
              value={ledgerUserId}
              onChange={(e) => setLedgerUserId(e.target.value)}
              onBlur={fetchLedger}
            />
          </label>
          <button type="button" className="admin-dashboard__btn admin-dashboard__btn--secondary" onClick={fetchLedger}>
            Refresh
          </button>
        </div>
        {ledgerError && <p className="text-error admin-dashboard__error">{ledgerError}</p>}
        <div className="admin-dashboard__table-wrap">
          <table className="admin-dashboard__table admin-dashboard__table--ledger">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Before (avail / locked)</th>
                <th>After (avail / locked)</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{row.type ?? '-'}</td>
                  <td>{formatKes(row.amount_cents)}</td>
                  <td>{row.before_available_cents != null ? `${formatKes(row.before_available_cents)} / ${formatKes(row.before_locked_cents)}` : '-'}</td>
                  <td>{row.after_available_cents != null ? `${formatKes(row.after_available_cents)} / ${formatKes(row.after_locked_cents)}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmOpen && confirmConfig && (
        <div className="modal-overlay" onClick={closeConfirm}>
          <div className="modal admin-dashboard__confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">{confirmConfig.label}</h3>
            <p className="admin-dashboard__confirm-label">{confirmConfig.inputLabel}</p>
            {confirmConfig.action !== 'approve' && (
              <input
                type="text"
                className="modal__input"
                placeholder={confirmConfig.placeholder}
                value={confirmConfig.value}
                onChange={(e) => setConfirmConfig((c) => (c ? { ...c, value: e.target.value } : c))}
              />
            )}
            {confirmConfig.action === 'approve' && (
              <p className="admin-dashboard__confirm-label" style={{ marginTop: '0.5rem' }}>
                This will add {confirmConfig.amount ? formatKes(confirmConfig.amount) : 'funds'} to the user's wallet.
              </p>
            )}
            <div className="admin-dashboard__confirm-actions">
              <button type="button" className="admin-dashboard__btn admin-dashboard__btn--secondary" onClick={closeConfirm}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-dashboard__btn admin-dashboard__btn--pay"
                disabled={(confirmConfig.action !== 'approve' && !confirmConfig.value?.trim()) || !!processingId}
                onClick={handleConfirmSubmit}
              >
                {processingId ? 'Processing…' : confirmConfig.submitLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
