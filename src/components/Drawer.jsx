import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'
import { getToggle, setToggle } from '../utils/storage.js'
import { formatPhone } from '../utils/formatPhone.js'

export default function Drawer({ isOpen, onClose, session, user, onDepositClick, onWithdrawClick, onAuthClick, onLogout }) {
  const [sound, setSound] = useState(false)
  const [music, setMusic] = useState(false)
  const [animation, setAnimation] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setSound(getToggle('sound'))
      setMusic(getToggle('music'))
      setAnimation(getToggle('animation'))
    }
  }, [isOpen])

  function handleToggle(key, value, setter) {
    setter(value)
    setToggle(key, value)
  }

  function handleMenuClick(action) {
    if (action === 'deposit' || action === 'withdraw') {
      if (!session) {
        onAuthClick()
      } else if (action === 'deposit') {
        onDepositClick()
      } else {
        onWithdrawClick()
      }
    }
    onClose()
  }

  if (!isOpen) return null

  const maskedPhone = user?.phone
    ? formatPhone(user.phone).replace(/(\d{3})\d+(\d{3})/, '$1XXX$2')
    : user?.email
      ? user.email.replace(/(.{3}).*(@.*)/, '$1***$2')
      : 'Guest'

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer__header">
          <div className="drawer__user">{maskedPhone}</div>
          <button type="button" className="drawer__avatar-btn">
            Change Avatar
          </button>
        </div>

        <div className="drawer__section">
          <div className="drawer__toggle-row">
            <span className="drawer__toggle-label">Sound</span>
            <button
              type="button"
              className={`drawer__toggle-switch ${sound ? 'drawer__toggle-switch--on' : ''}`}
              onClick={() => handleToggle('sound', !sound, setSound)}
            />
          </div>
          <div className="drawer__toggle-row">
            <span className="drawer__toggle-label">Music</span>
            <button
              type="button"
              className={`drawer__toggle-switch ${music ? 'drawer__toggle-switch--on' : ''}`}
              onClick={() => handleToggle('music', !music, setMusic)}
            />
          </div>
          <div className="drawer__toggle-row">
            <span className="drawer__toggle-label">Animation</span>
            <button
              type="button"
              className={`drawer__toggle-switch ${animation ? 'drawer__toggle-switch--on' : ''}`}
              onClick={() => handleToggle('animation', !animation, setAnimation)}
            />
          </div>
        </div>

        <div className="drawer__menu">
          <button type="button" className="drawer__menu-item" onClick={() => handleMenuClick('free-bets')}>
            Free Bets
          </button>
          <button type="button" className="drawer__menu-item" onClick={() => handleMenuClick('history')}>
            My Bet History
          </button>
          <button type="button" className="drawer__menu-item" onClick={() => handleMenuClick('limits')}>
            Game Limits
          </button>
          <button type="button" className="drawer__menu-item" onClick={() => handleMenuClick('how-to-play')}>
            How To Play
          </button>
          <button type="button" className="drawer__menu-item" onClick={() => handleMenuClick('rules')}>
            Game Rules
          </button>
          <button type="button" className="drawer__menu-item" onClick={() => handleMenuClick('provably-fair')}>
            Provably Fair Settings
          </button>
          <button type="button" className="drawer__menu-item" onClick={() => handleMenuClick('room')}>
            Game Room: Room #2
          </button>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0.5rem 0' }} />
          <button type="button" className="drawer__menu-item" onClick={() => handleMenuClick('deposit')}>
            Deposit
          </button>
          <button type="button" className="drawer__menu-item" onClick={() => handleMenuClick('withdraw')}>
            Withdraw
          </button>
          {session ? (
            <>
              {(user?.email?.includes('admin') || window.location.search.includes('admin=true')) && (
                <button 
                  type="button" 
                  className="drawer__menu-item drawer__menu-item--admin" 
                  onClick={() => {
                    window.location.search = '?admin=true'
                    onClose()
                  }}
                >
                  Admin Dashboard
                </button>
              )}
              <button type="button" className="drawer__menu-item" onClick={() => handleMenuClick('account')}>
                My Account
              </button>
              <button type="button" className="drawer__menu-item" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : (
            <button type="button" className="drawer__menu-item" onClick={onAuthClick}>
              Login / Register
            </button>
          )}
        </div>
      </div>
    </>
  )
}
