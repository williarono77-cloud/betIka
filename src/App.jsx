import { useState, useEffect, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from './supabaseClient.js'
import TopBar from './components/TopBar.jsx'
import HeaderRow from './components/HeaderRow.jsx'
import Drawer from './components/Drawer.jsx'
import GameHeader from './components/GameHeader.jsx'
import GameCard from './components/GameCard.jsx'
import BetPanel from './components/BetPanel.jsx'
import FeedTabs from './components/FeedTabs.jsx'
import AllBetsTable from './components/AllBetsTable.jsx'
import PreviousRound from './components/PreviousRound.jsx'
import TopBetsList from './components/TopBetsList.jsx'
import AuthModal from './components/AuthModal.jsx'
import DepositModal from './components/DepositModal.jsx'
import WithdrawModal from './components/WithdrawModal.jsx'
import Toast from './components/Toast.jsx'
import LoadingOverlay from './components/LoadingOverlay.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [feedTab, setFeedTab] = useState('all') // 'all' | 'previous' | 'top'
  const [isAdmin, setIsAdmin] = useState(false)

  // Data state
  const [wallet, setWallet] = useState(null)
  const [currentRound, setCurrentRound] = useState(null)
  const [deposits, setDeposits] = useState([])

  // Initialize session
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null)
      setUser(null)
      setLoading(false)
      return
    }

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        setSession(s)
        setUser(s?.user ?? null)
        setLoading(false)
      })
      .catch(() => {
        setSession(null)
        setUser(null)
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s) {
        refreshPrivateData()
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Fetch private data (wallet, deposits)
  const refreshPrivateData = useCallback(async () => {
    if (!session?.user?.id) {
      setWallet(null)
      setDeposits([])
      return
    }
    try {
      const [walletRes, depositsRes] = await Promise.all([
        supabase.from('wallets').select('available_cents, locked_cents').eq('user_id', session.user.id).maybeSingle(),
        supabase.from('deposits').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(20),
      ])
      if (walletRes.data != null) setWallet(walletRes.data)
      else setWallet(null)
      setDeposits(depositsRes.data ?? [])
    } catch (e) {
      console.error('Failed to load private data:', e)
    }
  }, [session?.user?.id])

  // Realtime: wallets (update balance when available_cents changes)
  useEffect(() => {
    if (!session?.user?.id || !isSupabaseConfigured) return
    const channel = supabase
      .channel('wallet-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const row = payload.new
          if (row) setWallet(row)
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id])

  // Fetch public game data (round only - multipliers and feeds handle their own updates)
  const refreshPublicData = useCallback(async () => {
    try {
      const roundRes = await supabase.from('current_round').select('*').maybeSingle()
      if (roundRes.data) setCurrentRound(roundRes.data)
    } catch (e) {
      console.error('Failed to load round data:', e)
    }
  }, [])

  // Realtime: game_rounds (refresh current round immediately when any round changes)
useEffect(() => {
  if (!isSupabaseConfigured) return

  const channel = supabase
    .channel('round-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_rounds' },
      () => {
        refreshPublicData()
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [refreshPublicData])


  useEffect(() => {
    refreshPublicData()
    // Refresh round every 3s (multipliers and feeds handle their own realtime updates)
    const interval = setInterval(refreshPublicData, 3000)
    return () => clearInterval(interval)
  }, [refreshPublicData])

  // Check admin status from URL parameter on mount and when URL changes
  useEffect(() => {
    const checkAdmin = () => {
      const urlParams = new URLSearchParams(window.location.search)
      const adminParam = urlParams.get('admin')
      // TODO: Replace with actual admin check from user metadata or database
      setIsAdmin(adminParam === 'true' || user?.email?.includes('admin'))
    }
    
    checkAdmin()
    
    // Listen for URL changes (back/forward buttons)
    const handlePopState = () => checkAdmin()
    window.addEventListener('popstate', handlePopState)
    
    return () => window.removeEventListener('popstate', handlePopState)
  }, [user])

  useEffect(() => {
    if (session) {
      refreshPrivateData()
    }
  }, [session, refreshPrivateData])

  function handleBetClick(action, stake) {
    if (action === 'auth') {
      setAuthModalOpen(true)
    } else if (action === 'bet' && session) {
  const stakeNumber = Number(stake);

  // 1) Validate
  if (!Number.isFinite(stakeNumber)) {
    setMessage({ type: 'error', text: 'Invalid stake amount.' });
    return;
  }
  if (stakeNumber < 100) {
    setMessage({ type: 'error', text: 'Minimum bet amount is KSh 100.' });
    return;
  }

  // 2) Check balance (wallet is already loaded in App.jsx)
  const available = (wallet?.available_cents ?? 0) / 100;
  if (stakeNumber > available) {
    setMessage({ type: 'error', text: 'Insufficient balance.' });
    return;
  }

  // 3) Perform the bet atomically in the DB (RPC)
  (async () => {
    try {
      const stake_cents = Math.round(stakeNumber * 100);

      const { data, error } = await supabase.rpc('place_bet', {
        p_stake_cents: stake_cents,
        p_round_id: currentRound?.id ?? null,
      });

      if (error) throw error;

      setMessage({ type: 'success', text: `Bet placed: KSh ${stakeNumber.toFixed(2)}` });

      // Refresh wallet after bet
      refreshPrivateData();
    } catch (e) {
      console.error('place_bet failed:', e);
      setMessage({ type: 'error', text: e?.message ?? 'Failed to place bet.' });
    }
  })();
}
  }
  function handleAuthSuccess() {
    refreshPrivateData()
    setMessage({ type: 'success', text: 'Welcome! You are now logged in.' })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setDrawerOpen(false)
    setMessage({ type: 'info', text: 'Logged out' })
  }

  function clearMessage() {
    setMessage(null)
  }

  const balance = (wallet?.available_cents ?? 0) / 100
  const lastDepositPhone = deposits.length > 0 ? deposits[0]?.phone : null
const currentMultiplier =
  currentRound?.burst_point ??
  currentRound?.multiplier ??
  currentRound?.current_multiplier ??
  null

const currentState =
  currentRound?.status ??
  currentRound?.state ??
  null

const currentRoundNumber =
  currentRound?.round_number ??
  currentRound?.round ??
  null


  if (loading) {
    return <LoadingOverlay />
  }

  // Show admin dashboard if admin mode
  if (isAdmin) {
    return (
      <div className="app">
        <Toast message={message} onDismiss={clearMessage} />
        <TopBar 
          onBack={() => {
            window.location.search = ''
            setIsAdmin(false)
          }} 
          fullscreen={false} 
          onToggleFullscreen={() => {}} 
        />
        <AdminDashboard
          user={user}
          setMessage={setMessage}
          onNotAdmin={() => {
            window.history.replaceState({}, '', window.location.pathname)
            setIsAdmin(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className={`app ${fullscreen ? 'app--fullscreen' : ''}`}>
      <Toast message={message} onDismiss={clearMessage} />
      <TopBar onBack={() => {}} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(!fullscreen)} />
      <HeaderRow balance={session ? balance : null} onMenuClick={() => setDrawerOpen(true)} onChatClick={() => setMessage({ type: 'info', text: 'Chat coming soon' })} onAuthClick={() => setAuthModalOpen(true)} />
      <GameHeader />
      
    <GameCard
  crashPoint={currentRound?.burst_point ?? null}
  startsAt={currentRound?.starts_at ?? null}
  state={currentState}
/>

      
      <BetPanel panelId="1" session={session} onBetClick={handleBetClick} />
      <BetPanel panelId="2" session={session} onBetClick={handleBetClick} />
      <FeedTabs activeTab={feedTab} onTabChange={setFeedTab} />
      {feedTab === 'all' && <AllBetsTable />}
      {feedTab === 'previous' && <PreviousRound />}
      {feedTab === 'top' && <TopBetsList />}

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        session={session}
        user={user}
        onDepositClick={() => setDepositModalOpen(true)}
        onWithdrawClick={() => setWithdrawModalOpen(true)}
        onAuthClick={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} onSuccess={handleAuthSuccess} />
      <DepositModal
        isOpen={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        onDepositSuccess={refreshPrivateData}
        setMessage={setMessage}
      />
      <WithdrawModal
        isOpen={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        userId={user?.id}
        balance={balance}
        lastDepositPhone={lastDepositPhone}
        onWithdrawSuccess={refreshPrivateData}
        setMessage={setMessage}
      />
    </div>
  )
}





