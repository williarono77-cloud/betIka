import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'
import DepositPanel from './DepositPanel.jsx'
import WithdrawPanel from './WithdrawPanel.jsx'
import TransactionsPanel from './TransactionsPanel.jsx'
import PublicGamePanel from './PublicGamePanel.jsx'

export default function Dashboard({ user, setMessage }) {
  const [wallet, setWallet] = useState(null)
  const [deposits, setDeposits] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    if (!user?.id) return
    setRefreshing(true)
    try {
      const [walletRes, depositsRes, withdrawalsRes] = await Promise.all([
        supabase.from('wallets').select('available_cents, locked_cents').eq('user_id', user.id).maybeSingle(),
        supabase.from('deposits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('withdrawal_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      ])
      if (walletRes.data != null) setWallet(walletRes.data)
      else setWallet(null)
      setDeposits(depositsRes.data ?? [])
      setWithdrawals(withdrawalsRes.data ?? [])
    } catch (e) {
      setMessage?.({ type: 'error', text: e?.message || 'Failed to load data' })
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [user?.id, setMessage])

  useEffect(() => {
    refresh()
  }, [refresh])

  const balance = wallet ? (wallet.available_cents ?? 0) / 100 : 0
  const lastDepositPhone = deposits.length > 0 ? deposits[0]?.phone : null

  return (
    <main className="dashboard container">
      <div className="dashboard__top">
        <div className="wallet-display">
          <span className="wallet-display__label">Wallet balance</span>
          <span className="wallet-display__value">{loading ? '…' : balance}</span>
          <span className="wallet-display__hint">(read-only; updates after deposit callback)</span>
        </div>
        <button type="button" className="btn btn--secondary" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <DepositPanel onDepositSuccess={refresh} setMessage={setMessage} />
      <WithdrawPanel
        userId={user?.id}
        balance={balance}
        lastDepositPhone={lastDepositPhone}
        onWithdrawSuccess={refresh}
        setMessage={setMessage}
      />
      <TransactionsPanel deposits={deposits} withdrawals={withdrawals} />
      <PublicGamePanel />
    </main>
  )
}
