import { memo } from 'react'
import { formatMoney } from '../utils/formatMoney.js'
import { useRealtimeFeed } from '../hooks/useRealtimeFeed.js'
import { supabase } from '../supabaseClient.js'

const MOCK_PREVIOUS = {
  result: 1.78,
  bets: [
    { id: 1, player: '2***9', bet: 100, x: 1.78, win: 178, avatar: 'A' },
    { id: 2, player: '5***3', bet: 500, x: 1.78, win: 890, avatar: 'B' },
  ],
}

const PreviousBetRow = memo(({ bet }) => (
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

PreviousBetRow.displayName = 'PreviousBetRow'

export default function PreviousRound({ data: externalData = null }) {
  const { data: realtimeData, loading } = useRealtimeFeed('previous_round', {
    queryFn: async () => {
      try {
        const { data } = await supabase.from('previous_round').select('*').maybeSingle()
        return data
      } catch {
        return null
      }
    },
    pollInterval: 3000,
    maxItems: 1,
    useRealtime: true, // Enable realtime to catch round updates immediately
  })

  const displayData = externalData || realtimeData || MOCK_PREVIOUS
  const result = displayData.result || displayData.round_result || 1.78
  const bets = displayData.bets || displayData.previous_bets || MOCK_PREVIOUS.bets

  return (
    <div className="feed-content">
      <div className="previous-round">
        <div className="previous-round__label">Round Result</div>
        <div className="previous-round__value">{loading && !externalData ? '...' : result.toFixed(2)}x</div>
      </div>
      {bets.length > 0 && (
        <div className="previous-round__table">
          <div className="all-bets-table">
            <div className="all-bets-table__header">
              <div>Player</div>
              <div>Bet KES</div>
              <div>X</div>
              <div>Win KES</div>
            </div>
            {loading && bets.length === 0 ? (
              <>
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="all-bets-table__row skeleton skeleton-row" />
                ))}
              </>
            ) : (
              bets.map((bet) => <PreviousBetRow key={bet.id || bet.player || Math.random()} bet={bet} />)
            )}
          </div>
        </div>
      )}
    </div>
  )
}
