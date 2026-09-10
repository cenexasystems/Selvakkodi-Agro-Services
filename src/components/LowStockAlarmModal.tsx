import React, { useEffect, useRef, useState, useCallback } from 'react'
import { AlertTriangle, Volume2, VolumeX, Package } from 'lucide-react'
import { useSound } from '../context/SoundContext'

interface LowStockItem {
  id: string | number
  name: string
  category: string
  stock_quantity: number
  low_stock_alert: number
}

/**
 * LowStockAlarmModal
 *
 * TRIGGERS:
 *   1. On mount — fires immediately after every login / page load.
 *   2. Whenever `triggerKey` changes to the literal string "inventory" — fires
 *      every single time the user navigates to the Inventory tab, even if the
 *      same items were already acknowledged in the same session.
 *
 * SOUND:
 *   Bespoke two-tone siren (NOT routed through SoundContext) running every
 *   2.5 seconds. Uses a DynamicsCompressorNode to push perceived loudness
 *   to maximum without digital clipping. Three oscillator layers per pulse
 *   (primary sawtooth + harmonic reinforcement) give a sharp, penetrating
 *   alarm character that is clearly audible even at low system volume.
 *
 * ACKNOWLEDGE:
 *   Stops the interval and clears state — no server-side persist. The same
 *   items will trigger the modal again on the next login or Inventory visit.
 */
export default function LowStockAlarmModal({
  triggerKey,
}: {
  triggerKey?: string | number
}) {
  const { soundEnabled } = useSound()
  const [items, setItems] = useState<LowStockItem[] | null>(null)

  // Separate counter used to force a re-fetch every time 'inventory' is clicked
  // even if the tab was already 'inventory' (tab value didn't change).
  const [fetchCounter, setFetchCounter] = useState(0)

  const intervalRef   = useRef<number | null>(null)
  const audioCtxRef   = useRef<AudioContext | null>(null)
  const prevKeyRef    = useRef<string | number | undefined>(undefined)
  const didMountRef   = useRef(false)

  // ── Increment fetchCounter on every inventory tab click ────────────────────
  useEffect(() => {
    if (!didMountRef.current) {
      // Initial mount → always fire (covers every login)
      didMountRef.current = true
      setFetchCounter(c => c + 1)
      prevKeyRef.current = triggerKey
      return
    }

    // Subsequent renders: fire whenever triggerKey starts with 'inventory'
    // (handles both 'inventory' and 'inventory:N' from the click counter)
    const keyStr = String(triggerKey ?? '')
    if (keyStr === 'inventory' || keyStr.startsWith('inventory:')) {
      setFetchCounter(c => c + 1)
    }
    prevKeyRef.current = triggerKey
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey])


  // ── Fetch low-stock items whenever fetchCounter increments ─────────────────
  useEffect(() => {
    if (fetchCounter === 0) return   // guard against initial render before mount effect

    let cancelled = false

    const check = async () => {
      try {
        const res = await fetch('/api/inventory/low-stock')
        if (!res.ok) return
        const json = await res.json()
        const rows: LowStockItem[] =
          json?.data?.items ?? json?.items ?? []
        if (cancelled) return
        if (rows.length > 0) {
          setItems(rows)
        }
      } catch (e) {
        console.warn('low-stock check failed', e)
      }
    }

    void check()
    return () => { cancelled = true }
  }, [fetchCounter])

  // ── LOUD two-tone siren pulse ──────────────────────────────────────────────
  // Uses:
  //   • DynamicsCompressorNode to maximise perceived loudness
  //   • 'sawtooth' oscillators (rich harmonics → louder perceived volume)
  //   • Three tones per pulse: 960 Hz → 720 Hz → 960 Hz (urgent siren shape)
  //   • Peak gain 0.9 (near full-scale before compressor)
  //   • 10 ms linear attack prevents click artefacts
  const beep = useCallback(() => {
    if (!soundEnabled) return
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof window.AudioContext })
          .webkitAudioContext

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContextCtor()
      }

      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') void ctx.resume()

      // ── Compressor: keeps loudness max without clipping ─────────────────
      const compressor = ctx.createDynamicsCompressor()
      compressor.threshold.setValueAtTime(-6, ctx.currentTime)   // dB
      compressor.knee.setValueAtTime(3, ctx.currentTime)
      compressor.ratio.setValueAtTime(20, ctx.currentTime)
      compressor.attack.setValueAtTime(0.001, ctx.currentTime)
      compressor.release.setValueAtTime(0.1, ctx.currentTime)
      compressor.connect(ctx.destination)

      const PEAK = 0.9   // gain before compressor
      const now  = ctx.currentTime

      // Three-tone siren: hi → lo → hi, spaced 180 ms apart
      const tones: [number, number][] = [
        [0,     960],   // tone 1: 960 Hz
        [0.18,  700],   // tone 2: 700 Hz (drops)
        [0.36,  960],   // tone 3: 960 Hz (rises again)
      ]

      tones.forEach(([offset, freq]) => {
        const t = now + offset

        // Primary oscillator (sawtooth)
        const osc1  = ctx.createOscillator()
        const gain1 = ctx.createGain()
        osc1.type = 'sawtooth'
        osc1.frequency.setValueAtTime(freq, t)
        gain1.gain.setValueAtTime(0, t)
        gain1.gain.linearRampToValueAtTime(PEAK, t + 0.010)
        gain1.gain.setValueAtTime(PEAK, t + 0.130)
        gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.175)
        osc1.connect(gain1)
        gain1.connect(compressor)
        osc1.start(t)
        osc1.stop(t + 0.18)

        // Sub-harmonic reinforcement (square wave at half frequency)
        const osc2  = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = 'square'
        osc2.frequency.setValueAtTime(freq / 2, t)
        gain2.gain.setValueAtTime(0, t)
        gain2.gain.linearRampToValueAtTime(PEAK * 0.4, t + 0.010)
        gain2.gain.setValueAtTime(PEAK * 0.4, t + 0.130)
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.175)
        osc2.connect(gain2)
        gain2.connect(compressor)
        osc2.start(t)
        osc2.stop(t + 0.18)
      })
    } catch (e) {
      console.warn('Low-stock alarm beep failed', e)
    }
  }, [soundEnabled])

  // ── Start/stop the repeating beep every 2.5 s when items appear ────────────
  useEffect(() => {
    if (items && items.length > 0) {
      // Stop any previous interval before starting a new one
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
      beep()   // immediate first pulse
      intervalRef.current = window.setInterval(beep, 2500)
    }
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  // ── Close the AudioContext on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {})
      }
    }
  }, [])

  // ── Acknowledge: stop alarm, clear items (no server-side persist) ──────────
  const acknowledge = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setItems(null)
  }

  if (!items || items.length === 0) return null

  const outCount = items.filter((p) => p.stock_quantity <= 0).length
  const lowCount = items.length - outCount

  const subtitle =
    outCount > 0 && lowCount > 0
      ? `${outCount} out of stock, ${lowCount} low stock — restock immediately`
      : outCount > 0
      ? `${outCount} item${outCount > 1 ? 's' : ''} out of stock`
      : `${lowCount} item${lowCount > 1 ? 's' : ''} require${lowCount === 1 ? 's' : ''} immediate restocking`

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="low-stock-alarm-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    >
      {/* Pulsing red border ring behind the card */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[calc(min(100vw,448px)+24px)] max-w-[calc(100%+24px)] aspect-[448/560] rounded-3xl border-4 border-red-500 opacity-50 animate-ping" />
      </div>

      <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border-2 border-red-500 max-h-[92vh] flex flex-col">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="px-5 py-4 flex items-center justify-between gap-3 bg-gradient-to-r from-red-600 to-orange-500 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 animate-bounce">
              <AlertTriangle size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2
                id="low-stock-alarm-title"
                className="text-base font-black text-white leading-tight"
              >
                ⚠️ Low Stock Alarm Active
              </h2>
              <p className="text-xs font-bold text-white/90">{subtitle}</p>
            </div>
          </div>

          {soundEnabled && (
            <span className="hidden sm:flex items-center gap-1 bg-white/25 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 animate-pulse">
              <Volume2 size={12} /> Alarm Sounding
            </span>
          )}
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="p-5 space-y-3 overflow-y-auto min-h-0 flex-1">
          <p className="text-sm font-bold text-[#374151]">
            The audible alarm sounds every 2.5 seconds until acknowledged.
          </p>

          <div className="max-h-56 overflow-y-auto space-y-2">
            {items.map((p) => {
              const isOut = p.stock_quantity <= 0
              return (
                <div
                  key={String(p.id)}
                  className={`flex items-center justify-between border rounded-xl px-3 py-2.5 gap-2 ${
                    isOut
                      ? 'bg-red-100 border-red-200'
                      : 'bg-amber-50 border-amber-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 ${
                        isOut ? 'text-red-600' : 'text-amber-600'
                      }`}
                    >
                      <Package size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-sm text-[#111111] truncate">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-[#6B7280] truncate">
                        {p.category || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${
                        isOut
                          ? 'bg-red-600 text-white'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {isOut ? 'OUT OF STOCK' : `${p.stock_quantity} IN STOCK`}
                    </span>
                    <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                      Alert limit: {p.low_stock_alert}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pt-1">
            <p className="text-[11px] text-[#9CA3AF] font-bold sm:max-w-[140px] shrink-0 order-2 sm:order-1">
              Will sound again on next login or Inventory visit.
            </p>
            <button
              id="low-stock-alarm-acknowledge"
              onClick={acknowledge}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black text-sm py-3 rounded-xl order-1 sm:order-2 transition-colors shadow-lg shadow-red-600/40"
            >
              <VolumeX size={16} /> Silence Alarm &amp; Acknowledge
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
