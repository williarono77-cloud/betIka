import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'

export default function PublicGamePanel() {
  const [currentRound, setCurrentRound] = useState(null)
  const [winners, setWinners] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchPublic() {
    setLoading(true)
    setError(null)
    try {
      // Public read: try common table names. Adjust to match your Supabase schema.
      const [roundRes, winnersRes, historyRes] = await Promise.allSettled([
        supabase.from('rounds').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('winners').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('round_history').select('*').order('created_at', { ascending: false }).limit(20),
      ])
      if (roundRes.status === 'fulfilled' && roundRes.value?.data != null) setCurrentRound(roundRes.value.data)
      if (winnersRes.status === 'fulfilled' && winnersRes.value?.data != null) setWinners(winnersRes.value.data)
      if (historyRes.status === 'fulfilled' && historyRes.value?.data != null) setHistory(historyRes.value.data)
      if (roundRes.status === 'rejected' || winnersRes.status === 'rejected' || historyRes.status === 'rejected') {
        setError('Could not load some game data. Tables may not exist yet.')
      }
    } catch (e) {
      setError(e?.message || 'Failed to load game data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPublic()
  }, [])

  if (loading) {
    return (
      <section className="panel public-game-panel">
        <h3>Game &amp; Winners</h3>
        <div className="loading-inline"><span className="spinner" /> Loading…</div>
      </section>
    )
  }

  return (
    <section className="panel public-game-panel">
      <h3>Game &amp; Winners</h3>
      {error && <p className="text-error">{error}</p>}
      {currentRound && (
        <div className="public-game-panel__round">
          <h4>Current round</h4>
          <pre className="round-summary">{JSON.stringify(currentRound, null, 2)}</pre>
        </div>
      )}
      {!currentRound && !error && <p>No current round.</p>}
      {winners.length > 0 && (
        <div className="public-game-panel__winners">
          <h4>Winners</h4>
          <ul>
            {winners.map((w, i) => (
              <li key={w.id || i}>{JSON.stringify(w)}</li>
            ))}
          </ul>
        </div>
      )}
      {history.length > 0 && (
        <div className="public-game-panel__history">
          <h4>Round history</h4>
          <ul>
            {history.map((h, i) => (
              <li key={h.id || i}>{JSON.stringify(h)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
