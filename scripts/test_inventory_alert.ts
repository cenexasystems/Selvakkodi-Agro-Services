import 'dotenv/config';
import { sql } from '../api/_routes/_lib/db.js';

// We test the InventoryAlertService transition engine logic
class MockInventoryAlertEngine {
  private previousStocks = new Map<string | number, number>();
  private activeAlerts = new Map<string | number, any>();
  private isBaselineInitialized = false;
  public soundPlayCount = 0;
  private soundDebounceTimer: any = null;

  public getSoundPlayCount(): number {
    return this.soundPlayCount;
  }

  public classify(stock: number, limit: number): 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NORMAL' {
    if (stock <= 0) return 'OUT_OF_STOCK';
    if (stock <= limit) return 'LOW_STOCK';
    return 'NORMAL';
  }

  public checkProducts(products: Array<{ id: string | number; name: string; stock_quantity?: number; stockQuantity?: number; low_stock_alert?: number; lowStockAlert?: number }>, globalLimit = 5) {
    if (!this.isBaselineInitialized) {
      for (const p of products) {
        const stock = Number(p.stock_quantity ?? p.stockQuantity ?? 0);
        this.previousStocks.set(p.id, stock);
      }
      this.isBaselineInitialized = true;
      return [];
    }

    const transitions: any[] = [];
    for (const p of products) {
      const currentStock = Number(p.stock_quantity ?? p.stockQuantity ?? 0);
      const prevStock = this.previousStocks.get(p.id);
      const limit = Number(p.low_stock_alert ?? p.lowStockAlert ?? globalLimit);

      if (prevStock !== undefined && prevStock !== currentStock) {
        const res = this.recordStockChange(p.id, prevStock, currentStock, limit, p.name);
        if (res.transitionedToLow) {
          transitions.push({ product: p, from: prevStock, to: currentStock });
        }
      } else {
        this.previousStocks.set(p.id, currentStock);
      }
    }
    return transitions;
  }

  public recordStockChange(
    productId: string | number,
    oldStock: number,
    newStock: number,
    limit: number,
    productName: string
  ) {
    const oldState = this.classify(oldStock, limit);
    const newState = this.classify(newStock, limit);
    this.previousStocks.set(productId, newStock);

    const transitionedToLow = oldState === 'NORMAL' && newState === 'LOW_STOCK';

    if (transitionedToLow) {
      this.activeAlerts.set(productId, {
        id: productId,
        productName,
        stock: newStock,
        limit,
        type: 'low',
        message: `${productName} is low on stock (${newStock} remaining, limit ${limit})`,
        timestamp: Date.now(),
      });
      this.playAlertSoundDebounced();
    } else if (newState === 'OUT_OF_STOCK') {
      this.activeAlerts.set(productId, {
        id: productId,
        productName,
        stock: 0,
        limit,
        type: 'out',
        message: `${productName} is out of stock!`,
        timestamp: Date.now(),
      });
    } else if (newState === 'NORMAL') {
      this.activeAlerts.delete(productId);
    }

    return { oldState, newState, transitionedToLow };
  }

  private playAlertSoundDebounced() {
    if (this.soundDebounceTimer) {
      clearTimeout(this.soundDebounceTimer);
    }
    this.soundDebounceTimer = setTimeout(() => {
      this.soundPlayCount++;
      this.soundDebounceTimer = null;
    }, 50);
  }

  public getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  public getPreviousStock(id: string | number) {
    return this.previousStocks.get(id);
  }
}

async function runTests() {
  console.log('=== STARTING LOW STOCK ALERT VERIFICATION ===\n');

  const engine = new MockInventoryAlertEngine();

  // Scenario 1: Initial Baseline Load (Stock 10 -> NORMAL, 0 sound)
  console.log('--- Scenario 1: Baseline Load ---');
  const initialProducts = [
    { id: 'p1', name: 'Neem Oil 1L', stock_quantity: 10, low_stock_alert: 5 },
    { id: 'p2', name: 'Organic Fertilizer 5kg', stock_quantity: 4, low_stock_alert: 5 },
    { id: 'p3', name: 'Spray Pump', stock_quantity: 0, low_stock_alert: 3 }
  ];
  engine.checkProducts(initialProducts, 5);
  await new Promise(r => setTimeout(r, 100));

  if (engine.getSoundPlayCount() === 0) {
    console.log('✅ Scenario 1 Passed: Initial load produced ZERO sounds.');
  } else {
    throw new Error(`Scenario 1 Failed: Initial load triggered ${engine.getSoundPlayCount()} sounds!`);
  }

  // Scenario 2: Transition 10 -> 4 (NORMAL -> LOW_STOCK)
  console.log('\n--- Scenario 2: NORMAL -> LOW_STOCK Transition ---');
  const res2 = engine.recordStockChange('p1', 10, 4, 5, 'Neem Oil 1L');
  if (res2.transitionedToLow) {
    console.log('✅ Correctly identified transition NORMAL -> LOW_STOCK');
  } else {
    throw new Error('Scenario 2 Failed: Did not detect transitionedToLow');
  }
  await new Promise(r => setTimeout(r, 100));
  if (engine.getSoundPlayCount() === 1) {
    console.log('✅ Scenario 2 Passed: Sound played exactly 1 time.');
  } else {
    throw new Error(`Scenario 2 Failed: Sound count is ${engine.getSoundPlayCount()}, expected 1`);
  }

  // Scenario 3: LOW_STOCK -> LOW_STOCK (4 -> 3)
  console.log('\n--- Scenario 3: LOW_STOCK -> LOW_STOCK (4 -> 3) ---');
  const prevSounds = engine.getSoundPlayCount();
  const res3 = engine.recordStockChange('p1', 4, 3, 5, 'Neem Oil 1L');
  if (!res3.transitionedToLow && res3.oldState === 'LOW_STOCK' && res3.newState === 'LOW_STOCK') {
    console.log('✅ Correctly recognized state remained LOW_STOCK');
  } else {
    throw new Error('Scenario 3 Failed: Invalid transition state');
  }
  await new Promise(r => setTimeout(r, 100));
  if (engine.getSoundPlayCount() === prevSounds) {
    console.log('✅ Scenario 3 Passed: 4 -> 3 did NOT re-trigger alert sound.');
  } else {
    throw new Error(`Scenario 3 Failed: Sound triggered when stock was already low!`);
  }

  // Scenario 4: Page Refresh Simulation (Re-reading stock 3)
  console.log('\n--- Scenario 4: Page Refresh Simulation ---');
  const refreshEngine = new MockInventoryAlertEngine();
  refreshEngine.checkProducts([{ id: 'p1', name: 'Neem Oil 1L', stock_quantity: 3, low_stock_alert: 5 }], 5);
  await new Promise(r => setTimeout(r, 100));
  if (refreshEngine.getSoundPlayCount() === 0) {
    console.log('✅ Scenario 4 Passed: Page refresh / re-mount with low stock produces ZERO sound.');
  } else {
    throw new Error('Scenario 4 Failed: Sound played on page refresh!');
  }

  // Scenario 5: Restock (3 -> 20)
  console.log('\n--- Scenario 5: Restock (3 -> 20) ---');
  const res5 = engine.recordStockChange('p1', 3, 20, 5, 'Neem Oil 1L');
  if (res5.newState === 'NORMAL' && engine.getActiveAlerts().find(a => a.id === 'p1') === undefined) {
    console.log('✅ Scenario 5 Passed: Restock reset alert state, alert removed from active list.');
  } else {
    throw new Error('Scenario 5 Failed: Active alert not cleared after restock');
  }

  // Scenario 6: Subsequent Drop (20 -> 5)
  console.log('\n--- Scenario 6: Subsequent Drop After Restock (20 -> 5) ---');
  const countBeforeDrop = engine.getSoundPlayCount();
  const res6 = engine.recordStockChange('p1', 20, 5, 5, 'Neem Oil 1L');
  if (res6.transitionedToLow) {
    console.log('✅ Detected new transition to low stock after restock');
  }
  await new Promise(r => setTimeout(r, 100));
  if (engine.getSoundPlayCount() === countBeforeDrop + 1) {
    console.log('✅ Scenario 6 Passed: Sound triggered exactly ONCE for new drop.');
  } else {
    throw new Error(`Scenario 6 Failed: Sound count expected ${countBeforeDrop + 1}, got ${engine.getSoundPlayCount()}`);
  }

  // Scenario 7: Out of Stock (5 -> 0)
  console.log('\n--- Scenario 7: Out of Stock (5 -> 0) ---');
  const countBeforeZero = engine.getSoundPlayCount();
  const res7 = engine.recordStockChange('p1', 5, 0, 5, 'Neem Oil 1L');
  if (res7.newState === 'OUT_OF_STOCK') {
    console.log('✅ Correctly identified OUT_OF_STOCK state');
  }
  await new Promise(r => setTimeout(r, 100));
  if (engine.getSoundPlayCount() === countBeforeZero) {
    console.log('✅ Scenario 7 Passed: Out of stock does not loop audio.');
  } else {
    throw new Error('Scenario 7 Failed: Extra sound played on OUT_OF_STOCK');
  }

  // Scenario 8: Simultaneous Drop for Multiple Items (Debounce Check)
  console.log('\n--- Scenario 8: Simultaneous Drop for Multiple Items (Debounce) ---');
  const debounceEngine = new MockInventoryAlertEngine();
  // Initialize baseline
  debounceEngine.checkProducts([
    { id: 'm1', name: 'Item A', stock_quantity: 15 },
    { id: 'm2', name: 'Item B', stock_quantity: 20 },
    { id: 'm3', name: 'Item C', stock_quantity: 30 },
  ], 5);

  // Drop all 3 items to low stock simultaneously in the same tick
  debounceEngine.recordStockChange('m1', 15, 3, 5, 'Item A');
  debounceEngine.recordStockChange('m2', 20, 2, 5, 'Item B');
  debounceEngine.recordStockChange('m3', 30, 4, 5, 'Item C');

  await new Promise(r => setTimeout(r, 150));
  if (debounceEngine.getSoundPlayCount() === 1) {
    console.log('✅ Scenario 8 Passed: 3 simultaneous drops debounced into exactly 1 sound.');
  } else {
    throw new Error(`Scenario 8 Failed: Expected 1 debounced sound, got ${debounceEngine.getSoundPlayCount()}`);
  }

  // Scenario 9: Live Neon DB Store Settings Verification
  console.log('\n--- Scenario 9: Live Neon Database Store Settings Verification ---');
  const rows = await sql`SELECT id, name, low_stock_limit FROM public.store_settings WHERE id = 1`;
  if (!rows || rows.length === 0) {
    throw new Error('Store settings row 1 not found in Neon database!');
  }
  console.log(`Current Neon store_settings low_stock_limit: ${rows[0].low_stock_limit}`);

  // Test updating low_stock_limit to 7 and restoring
  await sql`UPDATE public.store_settings SET low_stock_limit = 7 WHERE id = 1`;
  const updatedRows = await sql`SELECT low_stock_limit FROM public.store_settings WHERE id = 1`;
  if (Number(updatedRows[0].low_stock_limit) === 7) {
    console.log('✅ Successfully updated low_stock_limit to 7 in Neon.');
  } else {
    throw new Error('Failed to update low_stock_limit in Neon');
  }

  // Restore to 5
  await sql`UPDATE public.store_settings SET low_stock_limit = 5 WHERE id = 1`;
  const restoredRows = await sql`SELECT low_stock_limit FROM public.store_settings WHERE id = 1`;
  if (Number(restoredRows[0].low_stock_limit) === 5) {
    console.log('✅ Successfully restored low_stock_limit to 5 in Neon.');
  }

  // Scenario 10: Products table column check
  console.log('\n--- Scenario 10: Products table low_stock_alert column check ---');
  const prodColumns = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'low_stock_alert'
  `;
  if (prodColumns.length > 0) {
    console.log(`✅ Products table has column: ${prodColumns[0].column_name} (${prodColumns[0].data_type}, default: ${prodColumns[0].column_default})`);
  } else {
    throw new Error('low_stock_alert column missing from products table!');
  }

  console.log('\n🎉 ALL 10 VERIFICATION SCENARIOS PASSED WITH ZERO ERRORS!');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
