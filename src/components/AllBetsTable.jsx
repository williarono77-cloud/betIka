import { memo } from 'react'
import { formatMoney } from '../utils/formatMoney.js'
import { useRealtimeFeed } from '../hooks/useRealtimeFeed.js'
import { supabase } from '../supabaseClient.js'

// Mock data fallback
const MOCK_BETS = [
  { id: 1, player: '2***9', bet: 100, x: 2.5, win: 250, avatar: 'A' },
  { id: 2, player: '5***3', bet: 500, x: 1.8, win: 900, avatar: 'B' },
  { id: 3, player: '7***1', bet: 250, x: 3.2, win: 800, avatar: 'C' },
  { id: 4, player: '1***8', bet: 1000, x: 1.5, win: 1500, avatar: 'D' },
]

const BetRow = memo(({ bet }) => (
  <div className="all-bets-table__row">
    <div className="all-bets-table__player">
      <div className="all-bets-table__avatar">{bet.avatar || bet.player?.[0] || '?'}</div>
      <div className="all-bets-table__username">{bet.player || bet.player_mask || '***'}</div>
    </div>
    <div className="all-bets-table__value">{formatMoney(bet.bet || bet.bet_kes || 0)}</div>
    <div className="all-bets-table__multiplier">{bet.x || bet.multiplier || '0.00'}x</div>
    <div className="all-bets-table__value">{formatMoney(bet.win || bet.win_kes || 0)}</div>
  </div>
))

BetRow.displayName = 'BetRow'

export default function AllBetsTable({ bets: externalBets = null }) {
  const { data: realtimeBets, loading } = useRealtimeFeed('public_all_bets_feed', {
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from('public_all_bets_feed')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
        return data
      } catch {
        return null
      }
    },
    pollInterval: 2500,
    maxItems: 50,
    useRealtime: true,
  })

  const displayBets = externalBets && externalBets.length > 0
    ? externalBets
    : realtimeBets && realtimeBets.length > 0
      ? realtimeBets
      : MOCK_BETS

  const count = displayBets.length

  return (
    <div className="feed-content">
      <div className="feed-header">
        <h3 className="feed-header__title">
          ALL BETS <span className="feed-header__count">{count}</span>
        </h3>
      </div>
      <div className="all-bets-table">
        <div className="all-bets-table__header">
          <div>Player</div>
          <div>Bet KES</div>
          <div>X</div>
          <div>Win KES</div>
        </div>
        {loading && displayBets.length === 0 ? (
          <>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="all-bets-table__row skeleton skeleton-row" />
            ))}
          </>
        ) : (
          displayBets.map((bet) => <BetRow key={bet.id || bet.player || Math.random()} bet={bet} />)
        )}
      </div>
    </div>
  )
}
