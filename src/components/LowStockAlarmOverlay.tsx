import React, { useState, useEffect } from 'react'
import { AlertTriangle, Volume2, VolumeX, Package } from 'lucide-react'
import { inventoryAlertService, type ActiveAlert } from '../services/inventoryAlertService'

const ACK_STORAGE_KEY = 'selvakkodi-ack-product-ids'

function getAckedIdsFromSession(): Set<string> {
  try {
    if (typeof window === 'undefined') return new Set()
    const raw = sessionStorage.getItem(ACK_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

export const LowStockAlarmOverlay: React.FC = () => {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([])
  const [ackedIds, setAckedIds] = useState<Set<string>>(() => getAckedIdsFromSession())

  useEffect(() => {
    // Initial sync
    setAlerts(inventoryAlertService.getActiveAlerts())
    const unsubscribe = inventoryAlertService.subscribe((updated) => {
      setAlerts(updated)
    })
    return () => unsubscribe()
  }, [])

  const unacknowledgedAlerts = alerts.filter(
    (a) => !ackedIds.has(String(a.productId))
  )

  // Start/stop the repeating alarm loop based on unacknowledged alert presence.
  // The service owns the single interval – calling startAlarmLoop() when it is
  // already running is a no-op, so React strict-mode double-effect is safe.
  useEffect(() => {
    if (unacknowledgedAlerts.length > 0) {
      inventoryAlertService.startAlarmLoop()
    } else {
      inventoryAlertService.stopAlarmLoop()
    }

    return () => {
      // On unmount or when the condition flips, stop the loop
      inventoryAlertService.stopAlarmLoop()
    }
  }, [unacknowledgedAlerts.length > 0])

  if (unacknowledgedAlerts.length === 0) {
    return null
  }

  const outCount = unacknowledgedAlerts.filter(
    (a) => a.type === 'out' || a.stock <= 0
  ).length
  const lowCount = unacknowledgedAlerts.filter(
    (a) => a.type === 'low' && a.stock > 0
  ).length

  const subtitleText =
    outCount > 0 && lowCount > 0
      ? `${unacknowledgedAlerts.length} items require attention (${outCount} out of stock, ${lowCount} low stock)`
      : outCount > 0
      ? `${outCount} item${outCount > 1 ? 's' : ''} completely out of stock`
      : `${lowCount} item${lowCount > 1 ? 's' : ''} have fallen below reorder threshold`

  const handleAcknowledge = () => {
    // Stop the alarm sound immediately – before any state changes propagate
    inventoryAlertService.stopAlarmLoop()
    try {
      const raw = sessionStorage.getItem(ACK_STORAGE_KEY)
      const list: string[] = raw ? JSON.parse(raw) : []
      const nextSet = new Set(Array.isArray(list) ? list.map(String) : [])
      unacknowledgedAlerts.forEach((a) => nextSet.add(String(a.productId)))
      const updatedList = Array.from(nextSet)
      sessionStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(updatedList))
      setAckedIds(nextSet)
    } catch (err) {
      console.error('Failed to store acknowledged alert IDs:', err)
    }
    inventoryAlertService.clearAllAlerts()
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alarm-overlay-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-red-200 flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-red-100 bg-red-50/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="alarm-overlay-title"
                className="text-base sm:text-lg font-black text-gray-900 leading-tight truncate"
              >
                Low Stock Alarm Active
              </h2>
              <p className="text-xs text-red-700 font-medium truncate mt-0.5">
                {subtitleText}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 animate-pulse shrink-0">
            <Volume2 className="w-3.5 h-3.5" />
            <span>Alarm Sounding</span>
          </div>
        </div>

        {/* Product list */}
        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 px-5 py-2">
          {unacknowledgedAlerts.map((alert) => {
            const isOut = alert.type === 'out' || alert.stock <= 0
            return (
              <div
                key={alert.id}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {alert.productName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Alert At:{' '}
                      <span className="font-semibold text-gray-700">
                        {alert.limit} units
                      </span>
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      isOut
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {isOut
                      ? 'Out of Stock (0)'
                      : `Low Stock (${alert.stock} left)`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500 text-center sm:text-left">
            Silences sound until next new low-stock item.
          </p>
          <button
            type="button"
            onClick={handleAcknowledge}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl shadow-sm hover:shadow transition-all text-sm"
          >
            <VolumeX className="w-4 h-4" />
            <span>Silence Alarm &amp; Acknowledge</span>
          </button>
        </div>
      </div>
    </div>
  )
}
