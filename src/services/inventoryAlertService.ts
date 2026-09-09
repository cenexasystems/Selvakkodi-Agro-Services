/**
 * inventoryAlertService.ts
 *
 * Reliable, event/state-transition-driven Low Stock Alert, Notification, and Sound engine.
 * 
 * Rules:
 * 1. Initial page load / refresh captures baseline WITHOUT playing sound.
 * 2. Sound triggers ONLY on genuine NORMAL -> LOW_STOCK transitions:
 *    (prevStock > limit && currStock <= limit && currStock > 0).
 * 3. LOW_STOCK -> LOW_STOCK (e.g. 5 -> 4 -> 3) NEVER replays sound.
 * 4. OUT_OF_STOCK (currStock === 0) updates status without looping sound.
 * 5. RESTOCK (currStock > limit) resets alert state so future drops can re-alert.
 * 6. Multi-product drops in the same operation are debounced to a single sound.
 * 7. Browser autoplay restrictions are handled gracefully without console crashes.
 */

export interface ProductStockInfo {
  id: string | number
  name: string
  stock_quantity?: number
  stockQuantity?: number
  stock?: number
  low_stock_alert?: number
  lowStockAlert?: number
  unit?: string
  unit_label?: string
  category?: string
}

export interface ActiveAlert {
  id: string
  productId: string | number
  productName: string
  stock: number
  limit: number
  type: 'low' | 'out'
  timestamp: number
  message: string
}

type AlertListener = (alerts: ActiveAlert[]) => void

class InventoryAlertService {
  private isInitialized = false
  private stockBaseline = new Map<string, number>()
  private alertedLowStockIds = new Set<string>()
  private alertedOutOfStockIds = new Set<string>()
  private activeAlerts: ActiveAlert[] = []
  private listeners: Set<AlertListener> = new Set()
  private audioDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private audioContext: AudioContext | null = null
  private userInteracted = false
  /** Handle for the repeating alarm loop interval */
  private alarmLoopInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      // Listen once for user gesture to allow audio playback without browser block
      const unlockAudio = () => {
        this.userInteracted = true
        if (this.audioContext && this.audioContext.state === 'suspended') {
          void this.audioContext.resume().catch(() => {})
        }
        window.removeEventListener('pointerdown', unlockAudio)
        window.removeEventListener('keydown', unlockAudio)
        window.removeEventListener('click', unlockAudio)
      }
      window.addEventListener('pointerdown', unlockAudio, { passive: true })
      window.addEventListener('keydown', unlockAudio, { passive: true })
      window.addEventListener('click', unlockAudio, { passive: true })
    }
  }

  /**
   * Helper to normalize product stock quantity
   */
  public extractStock(p: ProductStockInfo): number {
    const val = p.stock_quantity ?? p.stockQuantity ?? p.stock ?? 0
    const num = Number(val)
    return Number.isFinite(num) ? num : 0
  }

  /**
   * Helper to determine effective low stock threshold for a product
   */
  public extractLimit(p: ProductStockInfo, defaultLimit = 5): number {
    const specific = p.low_stock_alert ?? p.lowStockAlert
    if (specific !== undefined && specific !== null) {
      const num = Number(specific)
      if (Number.isFinite(num) && num >= 0) return num
    }
    const def = Number(defaultLimit)
    return Number.isFinite(def) && def >= 0 ? def : 5
  }

  /**
   * Process a full inventory snapshot (from API fetch, store refresh, etc.)
   * or a list of updated products.
   */
  public processStockUpdate(products: ProductStockInfo[], defaultLimit = 5) {
    if (!Array.isArray(products) || products.length === 0) return

    // ── 1. BASELINE INITIALIZATION ──────────────────────────────────────────
    // On the very first load, we establish the baseline and record currently
    // low-stock items so they do NOT trigger sound.
    if (!this.isInitialized) {
      for (const p of products) {
        const id = String(p.id)
        const currentStock = this.extractStock(p)
        const limit = this.extractLimit(p, defaultLimit)

        this.stockBaseline.set(id, currentStock)
        if (currentStock <= 0) {
          this.alertedOutOfStockIds.add(id)
        }
        if (currentStock <= limit) {
          // Already low or out of stock on initial load - mark alerted to prevent sound
          this.alertedLowStockIds.add(id)
        }
      }
      this.isInitialized = true
      return
    }

    // ── 2. TRANSITION DETECTION ─────────────────────────────────────────────
    const newLowStockTransitions: ProductStockInfo[] = []
    const newOutOfStockTransitions: ProductStockInfo[] = []

    for (const p of products) {
      const id = String(p.id)
      const currentStock = this.extractStock(p)
      const limit = this.extractLimit(p, defaultLimit)

      const hasPrevious = this.stockBaseline.has(id)
      const prevStock = hasPrevious ? (this.stockBaseline.get(id) ?? currentStock) : currentStock

      // A. RESTOCK: stock increased above limit
      if (currentStock > limit) {
        if (this.alertedLowStockIds.has(id) || this.alertedOutOfStockIds.has(id)) {
          this.alertedLowStockIds.delete(id)
          this.alertedOutOfStockIds.delete(id)
          this.dismissAlertByProductId(p.id)
        }
      }
      // A2. Partial restock from 0 to low stock
      else if (prevStock === 0 && currentStock > 0 && currentStock <= limit) {
        this.alertedOutOfStockIds.delete(id)
      }
      // B. GENUINE TRANSITION: NORMAL -> LOW STOCK (stock dropped to <= limit and > 0)
      else if (prevStock > limit && currentStock <= limit && currentStock > 0) {
        if (!this.alertedLowStockIds.has(id)) {
          this.alertedLowStockIds.add(id)
          newLowStockTransitions.push(p)
        }
      }
      // C. GENUINE TRANSITION: Dropped to OUT OF STOCK (currentStock === 0)
      else if (prevStock > 0 && currentStock === 0) {
        if (!this.alertedOutOfStockIds.has(id)) {
          this.alertedOutOfStockIds.add(id)
          newOutOfStockTransitions.push(p)
        }
      }
      // D. LOW_STOCK -> LOW_STOCK (e.g. 5 -> 4 -> 3): Already in alertedLowStockIds -> NO SOUND

      // Update baseline with the authoritative current stock
      this.stockBaseline.set(id, currentStock)
    }

    // ── 3. SOUND TRIGGERING (Debounced, Event-Driven Only) ───────────────────
    if (newLowStockTransitions.length > 0) {
      this.triggerAlertSound()
    }

    // ── 4. NOTIFICATIONS ───────────────────────────────────────────────────
    if (newLowStockTransitions.length > 0 || newOutOfStockTransitions.length > 0) {
      for (const p of newLowStockTransitions) {
        const stock = this.extractStock(p)
        const limit = this.extractLimit(p, defaultLimit)
        this.addAlert({
          id: `low_${p.id}_${Date.now()}`,
          productId: p.id,
          productName: p.name,
          stock,
          limit,
          type: 'low',
          timestamp: Date.now(),
          message: `Low Stock Alert: ${p.name} has only ${stock} units remaining (limit: ${limit}).`,
        })
      }

      for (const p of newOutOfStockTransitions) {
        const limit = this.extractLimit(p, defaultLimit)
        this.addAlert({
          id: `out_${p.id}_${Date.now()}`,
          productId: p.id,
          productName: p.name,
          stock: 0,
          limit,
          type: 'out',
          timestamp: Date.now(),
          message: `Out of Stock Alert: ${p.name} is now out of stock!`,
        })
      }
    }
  }

  /**
   * Helper to classify stock state
   */
  public classifyStock(stock: number, limit: number): 'NORMAL' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
    if (stock <= 0) return 'OUT_OF_STOCK'
    if (stock <= limit) return 'LOW_STOCK'
    return 'NORMAL'
  }

  /**
   * Alias for processStockUpdate
   */
  public checkProducts(products: ProductStockInfo[], defaultLimit = 5) {
    this.processStockUpdate(products, defaultLimit)
  }

  /**
   * Manually record a stock adjustment (e.g. from Inventory modal or POS checkout)
   */
  public recordStockChange(
    product: ProductStockInfo,
    oldQty: number,
    newQty: number,
    defaultLimit = 5
  ): { oldState: 'NORMAL' | 'LOW_STOCK' | 'OUT_OF_STOCK'; newState: 'NORMAL' | 'LOW_STOCK' | 'OUT_OF_STOCK'; transitionedToLow: boolean } {
    const id = String(product.id)
    const limit = this.extractLimit(product, defaultLimit)
    const oldState = this.classifyStock(oldQty, limit)
    const newState = this.classifyStock(newQty, limit)

    this.stockBaseline.set(id, newQty)
    let transitionedToLow = false

    // Restock above limit
    if (newQty > limit) {
      this.alertedLowStockIds.delete(id)
      this.alertedOutOfStockIds.delete(id)
      this.dismissAlertByProductId(product.id)
    }
    // Partial restock from 0 to low stock
    else if (oldQty === 0 && newQty > 0) {
      this.alertedOutOfStockIds.delete(id)
    }
    // Transition NORMAL -> LOW STOCK
    else if (oldQty > limit && newQty <= limit && newQty > 0) {
      if (!this.alertedLowStockIds.has(id)) {
        this.alertedLowStockIds.add(id)
        this.triggerAlertSound()
        transitionedToLow = true
        this.addAlert({
          id: `low_${product.id}_${Date.now()}`,
          productId: product.id,
          productName: product.name,
          stock: newQty,
          limit,
          type: 'low',
          timestamp: Date.now(),
          message: `Low Stock Alert: ${product.name} has only ${newQty} units remaining (limit: ${limit}).`,
        })
      }
    } else if (oldQty > 0 && newQty === 0) {
      if (!this.alertedOutOfStockIds.has(id)) {
        this.alertedOutOfStockIds.add(id)
        this.addAlert({
          id: `out_${product.id}_${Date.now()}`,
          productId: product.id,
          productName: product.name,
          stock: 0,
          limit,
          type: 'out',
          timestamp: Date.now(),
          message: `Out of Stock Alert: ${product.name} is now out of stock!`,
        })
      }
    }

    return { oldState, newState, transitionedToLow }
  }

  /**
   * Obtain (or lazily create) the shared AudioContext.
   * Returns null if Web Audio API is unavailable.
   */
  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return null
    if (!this.audioContext) {
      this.audioContext = new AudioCtx()
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume().catch(() => {})
    }
    return this.audioContext
  }

  /**
   * Schedule a single two-tone alarm pulse on the Web Audio API clock.
   *
   * Pulse structure (all times relative to `startAt`):
   *   Tone 1 – 880 Hz square wave, 0 → 0.01 s linear attack, 0.01 → 0.15 s exponential decay
   *   Gap    – 0.01 s silence between tones
   *   Tone 2 – 660 Hz square wave, starts at startAt + 0.16 s, same envelope shape
   *
   * Peak gain 0.18 gives a clearly audible but not excessive level.
   * Short attack (10 ms) prevents click while keeping sharp electronic character.
   */
  private schedulePulse(startAt: number) {
    const ctx = this.getAudioContext()
    if (!ctx) return

    const PEAK_GAIN = 0.18
    const ATTACK   = 0.010  // 10 ms linear attack
    const DECAY    = 0.140  // decay to near-silence by startAt + 0.15 s
    const T2_OFFSET = 0.160 // second tone starts 160 ms after first

    // ── Tone 1 : 880 Hz ────────────────────────────────────────────────────
    const osc1  = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'square'
    osc1.frequency.setValueAtTime(880, startAt)
    gain1.gain.setValueAtTime(0,          startAt)
    gain1.gain.linearRampToValueAtTime(PEAK_GAIN,   startAt + ATTACK)
    gain1.gain.exponentialRampToValueAtTime(0.0001, startAt + ATTACK + DECAY)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(startAt)
    osc1.stop(startAt + ATTACK + DECAY + 0.005)  // tiny tail so exponential completes

    // ── Tone 2 : 660 Hz (starts 160 ms later) ──────────────────────────────
    const t2    = startAt + T2_OFFSET
    const osc2  = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'square'
    osc2.frequency.setValueAtTime(660, t2)
    gain2.gain.setValueAtTime(0,          t2)
    gain2.gain.linearRampToValueAtTime(PEAK_GAIN,   t2 + ATTACK)
    gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + ATTACK + DECAY)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(t2)
    osc2.stop(t2 + ATTACK + DECAY + 0.005)
  }

  /**
   * Play a single two-tone alarm pulse immediately (event-driven, debounced).
   * Debounce collapses multiple rapid calls (e.g. batch stock updates) into one.
   */
  public triggerAlertSound() {
    if (this.audioDebounceTimer) {
      clearTimeout(this.audioDebounceTimer)
    }
    this.audioDebounceTimer = setTimeout(() => {
      this.audioDebounceTimer = null
      try {
        const ctx = this.getAudioContext()
        if (ctx) this.schedulePulse(ctx.currentTime)
      } catch (err) {
        console.warn('Inventory alert audio playback prevented:', err)
      }
    }, 150)
  }

  /**
   * Start the repeating alarm loop (one pulse every 2.5 s).
   * Guards against double-starts: calling this when the loop is already
   * running has no effect.
   *
   * Called by LowStockAlarmOverlay when unacknowledged alerts become active.
   */
  public startAlarmLoop() {
    if (this.alarmLoopInterval !== null) return   // already running — do nothing
    try {
      const ctx = this.getAudioContext()
      if (ctx) this.schedulePulse(ctx.currentTime)  // play first pulse immediately
    } catch (err) {
      console.warn('Inventory alert audio playback prevented:', err)
    }
    this.alarmLoopInterval = setInterval(() => {
      try {
        const ctx = this.getAudioContext()
        if (ctx) this.schedulePulse(ctx.currentTime)
      } catch (err) {
        console.warn('Inventory alert audio playback prevented:', err)
      }
    }, 2500)
  }

  /**
   * Stop the repeating alarm loop immediately.
   * Safe to call even if the loop is not running.
   *
   * Called by LowStockAlarmOverlay on acknowledge or when alerts clear.
   */
  public stopAlarmLoop() {
    if (this.alarmLoopInterval !== null) {
      clearInterval(this.alarmLoopInterval)
      this.alarmLoopInterval = null
    }
    // Also cancel any pending debounced one-shot
    if (this.audioDebounceTimer !== null) {
      clearTimeout(this.audioDebounceTimer)
      this.audioDebounceTimer = null
    }
  }

  private addAlert(alert: ActiveAlert) {
    // Keep max 10 recent alerts
    this.activeAlerts = [alert, ...this.activeAlerts.filter(a => a.productId !== alert.productId)].slice(0, 10)
    this.notifyListeners()
  }

  public dismissAlert(alertId: string) {
    this.activeAlerts = this.activeAlerts.filter(a => a.id !== alertId)
    this.notifyListeners()
  }

  public dismissAlertByProductId(productId: string | number) {
    this.activeAlerts = this.activeAlerts.filter(a => a.productId !== productId)
    this.notifyListeners()
  }

  public clearAllAlerts() {
    this.activeAlerts = []
    this.notifyListeners()
  }

  public getActiveAlerts(): ActiveAlert[] {
    return [...this.activeAlerts]
  }

  public subscribe(listener: AlertListener): () => void {
    this.listeners.add(listener)
    listener([...this.activeAlerts])
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notifyListeners() {
    const copy = [...this.activeAlerts]
    this.listeners.forEach(fn => {
      try { fn(copy) } catch {}
    })
  }

  /**
   * Reset tracking state (used in testing or explicit reset)
   */
  public resetState() {
    this.isInitialized = false
    this.stockBaseline.clear()
    this.alertedLowStockIds.clear()
    this.alertedOutOfStockIds.clear()
    this.activeAlerts = []
    this.notifyListeners()
  }
}

export const inventoryAlertService = new InventoryAlertService()
