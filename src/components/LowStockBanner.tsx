import { useState, useEffect } from 'react'
import { AlertTriangle, X, ArrowRight, Package } from 'lucide-react'
import { inventoryAlertService, type ActiveAlert } from '../services/inventoryAlertService'

interface LowStockBannerProps {
  onNavigateToInventory?: (filter?: 'low' | 'out') => void
  embedded?: boolean
}

export function LowStockBanner({ onNavigateToInventory, embedded = false }: LowStockBannerProps) {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([])

  useEffect(() => {
    const unsubscribe = inventoryAlertService.subscribe(setAlerts)
    return () => unsubscribe()
  }, [])

  if (alerts.length === 0) return null

  const lowAlerts = alerts.filter(a => a.type === 'low')
  const outAlerts = alerts.filter(a => a.type === 'out')

  const title = alerts.length === 1
    ? alerts[0].message
    : `${alerts.length} products require immediate attention (${lowAlerts.length} low stock, ${outAlerts.length} out of stock)`

  return (
    <div
      className={
        embedded
          ? 'w-full mb-4 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-[#111111] shadow-sm'
          : 'fixed bottom-5 right-5 z-50 max-w-md w-[calc(100vw-2.5rem)] rounded-2xl border border-amber-300 bg-white p-4 text-[#111111] shadow-2xl animate-in slide-in-from-bottom-3'
      }
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-amber-900">
              Inventory Alert
            </p>
            <p className="mt-0.5 text-sm font-bold text-[#111111] leading-snug">
              {title}
            </p>

            {alerts.length > 1 && (
              <div className="mt-2 max-h-28 overflow-y-auto space-y-1 text-xs">
                {alerts.slice(0, 4).map(a => (
                  <div key={a.id} className="flex items-center justify-between text-[#374151] font-medium">
                    <span className="truncate max-w-[200px]">{a.productName}</span>
                    <span className={`px-1.5 py-0.5 rounded font-black text-[10px] ${a.type === 'out' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                      {a.type === 'out' ? 'Out of Stock' : `${a.stock} left (limit ${a.limit})`}
                    </span>
                  </div>
                ))}
                {alerts.length > 4 && (
                  <p className="text-[11px] text-[#6B7280] font-semibold">
                    +{alerts.length - 4} more items
                  </p>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              {onNavigateToInventory && (
                <button
                  type="button"
                  onClick={() => onNavigateToInventory(outAlerts.length > 0 ? 'out' : 'low')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#2E7D32] hover:bg-[#1B5E20] px-3 py-1.5 text-xs font-black text-white transition-colors"
                >
                  <Package size={13} /> View Inventory <ArrowRight size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => inventoryAlertService.clearAllAlerts()}
                className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-[#6B7280] hover:bg-gray-50 transition-colors"
              >
                Dismiss All
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => inventoryAlertService.clearAllAlerts()}
          className="rounded-lg p-1 text-[#9CA3AF] hover:bg-gray-100 hover:text-[#111111] transition-colors"
          aria-label="Close alert"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
