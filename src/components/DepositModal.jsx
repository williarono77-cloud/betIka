import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient.js'
import { validateAmount, validatePhone } from '../utils/validators.js'
import { formatPhone } from '../utils/formatPhone.js'
import { fetchWithAuth } from '../utils/fetchWithAuth.js'

export default function DepositModal({ isOpen, onClose, onDepositSuccess, setMessage }) {
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('idle') // idle | initiating | waiting | success | failed
  const [statusText, setStatusText] = useState('')
  const [inlineError, setInlineError] = useState(null)
  const [depositId, setDepositId] = useState(null)
  const submittedRef = useRef(false)

  const isBusy = status === 'initiating' || status === 'waiting'
  const disableSubmit = isBusy

  useEffect(() => {
    if (!isOpen) {
      setPhone('')
      setAmount('')
      setStatus('idle')
      setStatusText('')
      setInlineError(null)
      setDepositId(null)
      submittedRef.current = false
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !depositId || status !== 'waiting') return

    const channel = supabase
      .channel(`deposit-${depositId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deposits',
          filter: `id=eq.${depositId}`,
        },
        (payload) => {
          const row = payload.new
          if (row?.status === 'success') {
            setStatus('success')
            setStatusText('Deposit successful!')
            setMessage?.({ type: 'success', text: 'Deposit successful!' })
            onDepositSuccess?.()
            setTimeout(() => onClose(), 1500)
          } else if (row?.status === 'failed') {
            submittedRef.current = false
            setStatus('failed')
            setStatusText(row?.external_ref || 'Payment failed. Please try again.')
            setMessage?.({ type: 'error', text: 'Deposit failed.' })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOpen, depositId, status, onClose, onDepositSuccess, setMessage])

  async function handleSubmit(e) {
    e.preventDefault()
    if (submittedRef.current || disableSubmit) return

    setInlineError(null)
    const amountResult = validateAmount(amount)
    const phoneResult = validatePhone(phone)
    if (!amountResult.valid) {
      setInlineError(amountResult.error)
      return
    }
    if (!phoneResult.valid) {
      setInlineError(phoneResult.error)
      return
    }

    const amountNum = Number(amount)
    const amountCents = Math.floor(amountNum * 100)
    if (amountCents <= 0) {
      setInlineError('Amount must be greater than 0')
      return
    }

    const normalized = formatPhone(phone)
    submittedRef.current = true
    setStatus('initiating')
    setStatusText('Initiating…')

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('deposit_initiate', {
        p_amount_cents: amountCents,
        p_phone: normalized,
      })

      if (rpcErr) {
        submittedRef.current = false
        setStatus('failed')
        setStatusText(rpcErr.message || 'Failed to initiate deposit')
        setMessage?.({ type: 'error', text: rpcErr.message })
        return
      }

      const id = rpcData
      if (!id) {
        submittedRef.current = false
        setStatus('failed')
        setStatusText('No deposit ID returned')
        setMessage?.({ type: 'error', text: 'Failed to initiate deposit' })
        return
      }

      setDepositId(id)

      const res = await fetchWithAuth('/payments/initiate', {
        method: 'POST',
        body: JSON.stringify({
          deposit_id: id,
          amount_cents: amountCents,
          phone: normalized,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        submittedRef.current = false
        setStatus('failed')
        setStatusText(data?.message || data?.error || `Request failed (${res.status})`)
        setMessage?.({ type: 'error', text: data?.message || data?.error || `Request failed (${res.status})` })
        return
      }

      const paymentLink = data?.payment_link
      if (paymentLink) {
        window.location.href = paymentLink
      }
      setStatus('waiting')
      setStatusText('Waiting for payment…')
    } catch (err) {
      submittedRef.current = false
      setStatus('failed')
      setStatusText(err?.message || 'Network error. Please try again.')
      setMessage?.({ type: 'error', text: err?.message || 'Deposit failed' })
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className="modal__title">Deposit</h2>
        <form className="modal__form" onSubmit={handleSubmit}>
          {inlineError && <p className="text-error">{inlineError}</p>}
          <div className="modal__label">
            <span className="modal__label-text">Phone (Kenya)</span>
            <input
              type="tel"
              className="modal__input"
              placeholder="07XXXXXXXX or 2547XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isBusy}
            />
          </div>
          <div className="modal__label">
            <span className="modal__label-text">Amount (KES)</span>
            <input
              type="number"
              className="modal__input"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isBusy}
            />
          </div>
          {status && statusText && (
            <div className={`modal__status modal__status--${status}`}>{statusText}</div>
          )}
          <button type="submit" className="modal__button" disabled={disableSubmit}>
            {status === 'initiating' && 'Initiating…'}
            {status === 'waiting' && 'Waiting…'}
            {status === 'success' && 'Success!'}
            {status === 'failed' && 'Try again'}
            {(status === 'idle' || !status) && 'Deposit'}
          </button>
        </form>
        <p className="modal__hint">You will be redirected to complete payment. After paying, return here to see your updated balance.</p>
      </div>
    </div>
  )
}
