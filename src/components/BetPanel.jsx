import { useState } from 'react'
import { formatMoney } from '../utils/formatMoney.js'
import { getStake, setStake } from '../utils/storage.js'

const QUICK_CHIPS = [100, 250, 1000, 25000]

export default function BetPanel({ panelId = '1', session, onBetClick }) {
  const [stake, setStakeState] = useState(() => getStake(panelId) || 10)
  const [activeTab, setActiveTab] = useState('bet')

  function updateStake(delta) {
    const newStake = Math.max(1, stake + delta)
    setStakeState(newStake)
    setStake(panelId, newStake)
  }

  function setQuickChip(value) {
    setStakeState(value)
    setStake(panelId, value)
  }

  function handleBet() {
    if (!session) {
      onBetClick?.('auth')
    } else {
      onBetClick?.('bet', stake)
    }
  }

  return (
    <div className="bet-panel">
      <div className="bet-panel__tabs">
        <button
          type="button"
          className={`bet-panel__tab ${activeTab === 'bet' ? 'bet-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('bet')}
        >
          Bet
        </button>
        <button
          type="button"
          className={`bet-panel__tab ${activeTab === 'auto' ? 'bet-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('auto')}
        >
          Auto
        </button>
      </div>

      <div className="bet-panel__stake-row">
        <button type="button" className="bet-panel__stake-btn" onClick={() => updateStake(-10)}>
          −
        </button>
        <div className="bet-panel__stake-display">{stake.toFixed(2)}</div>
        <button type="button" className="bet-panel__stake-btn" onClick={() => updateStake(10)}>
          +
        </button>
      </div>

      <div className="bet-panel__chips">
        {QUICK_CHIPS.map((chip) => (
          <button key={chip} type="button" className="bet-panel__chip" onClick={() => setQuickChip(chip)}>
            {chip.toLocaleString()}
          </button>
        ))}
      </div>

      <button type="button" className="bet-panel__bet-btn" onClick={handleBet}>
        <span>Bet</span>
        <span>{formatMoney(stake)}</span>
      </button>
    </div>
  )
}
