import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'

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
  const [ledger, setLedger] = useState([])
  const [ledgerError, setLedgerError] = useState(null)
  const [ledgerUserId, setLedgerUserId] = useState('')
  const [processingId, setProcessingId] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState(null)

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

  useEffect(() => {
    if (profileRole !== 'admin') return
    fetchWithdrawals()
    fetchLedger()
  }, [profileRole, fetchWithdrawals, fetchLedger])

  // Realtime: withdrawal_requests
  useEffect(() => {
    if (profileRole !== 'admin') return
    const channel = supabase
      .channel('admin-withdrawals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'withdrawal_requests' },
        () => fetchWithdrawals()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profileRole, fetchWithdrawals])

  const openConfirm = (action, requestId, label, inputLabel, placeholder, submitLabel) => {
    setConfirmConfig({
      action,
      requestId,
      label,
      inputLabel,
      placeholder: placeholder ?? '',
      submitLabel,
      value: '',
    })
    setConfirmOpen(true)
  }

  const closeConfirm = () => {
    setConfirmOpen(false)
    setConfirmConfig(null)
  }

  const handleConfirmSubmit = async () => {
    if (!confirmConfig || !confirmConfig.value?.trim()) return
    const { action, requestId, value } = confirmConfig
    setProcessingId(requestId)
    try {
      let error
      if (action === 'reject') {
        const res = await supabase.rpc('admin_withdraw_reject', {
          p_request_id: requestId,
          p_admin_note: value.trim(),
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
        setMessage?.({ type: 'success', text: action === 'reject' ? 'Withdrawal rejected.' : 'Marked as paid.' })
        closeConfirm()
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
      <div className="admin-dashboard__header">
        <h1 className="admin-dashboard__title">Admin Dashboard</h1>
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
            <input
              type="text"
              className="modal__input"
              placeholder={confirmConfig.placeholder}
              value={confirmConfig.value}
              onChange={(e) => setConfirmConfig((c) => (c ? { ...c, value: e.target.value } : c))}
            />
            <div className="admin-dashboard__confirm-actions">
              <button type="button" className="admin-dashboard__btn admin-dashboard__btn--secondary" onClick={closeConfirm}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-dashboard__btn admin-dashboard__btn--pay"
                disabled={!confirmConfig.value?.trim() || !!processingId}
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
