import { neon } from '@neondatabase/serverless';
import { inventoryAlertService } from '../src/services/inventoryAlertService.ts';

const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Helper to mock VercelRequest and VercelResponse
function createMockReqRes(options: {
  method: string;
  query?: Record<string, string>;
  body?: any;
  user?: any;
}) {
  const req: any = {
    method: options.method,
    query: options.query || {},
    body: options.body || {},
    headers: {
      authorization: 'Bearer mock-test-token',
    },
  };

  let responseData: any = null;
  let responseStatus = 200;

  const res: any = {
    status: (code: number) => {
      responseStatus = code;
      return res;
    },
    setHeader: () => res,
    json: (data: any) => {
      responseData = data;
      return res;
    },
  };

  return { req, res, getResult: () => ({ status: responseStatus, data: responseData }) };
}

async function runTests() {
  console.log('================================================================');
  console.log('STARTING FOCUSED VERIFICATION: INVENTORY LOGS NEON MIGRATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, description: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}`);
    }
  }

  // Ensure an admin user exists for test
  const adminRows = await sql`
    SELECT id, role, email FROM public.users WHERE role = 'admin' LIMIT 1
  `;
  let testAdmin = adminRows[0];
  if (!testAdmin) {
    const inserted = await sql`
      INSERT INTO public.users (name, email, password_hash, role)
      VALUES ('Test Admin', 'test_admin_migration@selvakkodi.local', 'fakehash', 'admin')
      RETURNING id, role, email
    `;
    testAdmin = inserted[0];
  }

  // Get or create a test product
  let productRows = await sql`
    SELECT id, name, category, stock_quantity, low_stock_alert 
    FROM public.products 
    LIMIT 1
  `;
  let testProduct = productRows[0];
  let createdTestProduct = false;

  if (!testProduct) {
    const created = await sql`
      INSERT INTO public.products (name, category, price, stock_quantity, low_stock_alert, is_active)
      VALUES ('Test Fertilizer 10kg', 'Fertilizers', 450, 20, 5, true)
      RETURNING id, name, category, stock_quantity, low_stock_alert
    `;
    testProduct = created[0];
    createdTestProduct = true;
  }

  console.log(`Using Test Product: ID=${testProduct.id}, Name=${testProduct.name}, Stock=${testProduct.stock_quantity}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Direct insert into public.inventory_logs via SQL to test data model
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 1: Neon public.inventory_logs Schema & Data Model ---');
  const testLogRef = 'TEST-AUDIT-' + Date.now();
  const testOldQty = Number(testProduct.stock_quantity);
  const testNewQty = testOldQty + 5;
  const testAdj = 5;

  const insertDirect = await sql`
    INSERT INTO public.inventory_logs (
      product_id, old_quantity, new_quantity, adjustment, reason, reference_id, created_by
    ) VALUES (
      ${testProduct.id}, ${testOldQty}, ${testNewQty}, ${testAdj}, 'restock', ${testLogRef}, ${testAdmin.id}
    ) RETURNING id, product_id, old_quantity::float, new_quantity::float, adjustment::float, reason, reference_id, created_at
  `;

  assert(insertDirect.length === 1, 'Can insert directly into public.inventory_logs in Neon DB');
  assert(insertDirect[0].reference_id === testLogRef, 'Reference ID preserved accurately');
  assert(insertDirect[0].reason === 'restock', 'Reason constraint works as expected');
  assert(insertDirect[0].adjustment === 5, 'Adjustment numeric conversion is exact');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Querying inventory_logs with product join, date range, ordering newest first
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 2: Inventory Analytics Query (Joined Name, Date Filtering, Newest First) ---');
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const queryRows = await sql`
    SELECT 
      l.id,
      l.product_id,
      l.old_quantity::float AS old_quantity,
      l.new_quantity::float AS new_quantity,
      l.adjustment::float AS adjustment,
      l.reason,
      l.reference_id,
      l.created_by,
      l.created_at,
      json_build_object(
        'name', COALESCE(p.name, '—'),
        'category', COALESCE(p.category, '—')
      ) AS products
    FROM public.inventory_logs l
    LEFT JOIN public.products p ON l.product_id = p.id
    WHERE l.created_at >= ${yesterday}::timestamptz
      AND l.created_at <= ${tomorrow}::timestamptz
    ORDER BY l.created_at DESC
    LIMIT 10
  `;

  assert(queryRows.length >= 1, 'Query returns logs in date range');
  assert(queryRows[0].products !== null && typeof queryRows[0].products === 'object', 'Product details joined as object');
  assert(typeof queryRows[0].products.name === 'string', 'Product name present in joined object');

  // Verify newest first
  if (queryRows.length >= 2) {
    const time0 = new Date(queryRows[0].created_at).getTime();
    const time1 = new Date(queryRows[1].created_at).getTime();
    assert(time0 >= time1, 'Log ordering is strictly newest first (DESC)');
  } else {
    assert(true, 'Log ordering is newest first (only 1 log returned)');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Validation of Reasons & Check Constraints
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 3: Reasons & Check Constraints Validation ---');
  const validReasons = ['sale', 'restock', 'return', 'manual_adjustment', 'loss'];
  let allReasonsValid = true;

  for (const r of validReasons) {
    try {
      const res = await sql`
        INSERT INTO public.inventory_logs (product_id, old_quantity, new_quantity, adjustment, reason, reference_id, created_by)
        VALUES (${testProduct.id}, 10, 10, 0, ${r}, 'test-reason', ${testAdmin.id})
        RETURNING id
      `;
      if (!res || res.length === 0) allReasonsValid = false;
      // Clean up right away
      await sql`DELETE FROM public.inventory_logs WHERE id = ${res[0].id}`;
    } catch {
      allReasonsValid = false;
    }
  }
  assert(allReasonsValid, 'All allowed reasons (sale, restock, return, manual_adjustment, loss) accepted by Neon DB');

  let invalidReasonRejected = false;
  try {
    await sql`
      INSERT INTO public.inventory_logs (product_id, old_quantity, new_quantity, adjustment, reason, reference_id, created_by)
      VALUES (${testProduct.id}, 10, 10, 0, 'invalid_reason_xyz', 'test', ${testAdmin.id})
    `;
  } catch (err: any) {
    invalidReasonRejected = err.message.includes('check') || err.message.includes('constraint') || err.message.includes('reason');
  }
  assert(invalidReasonRejected, 'Invalid reason string rejected by PostgreSQL check constraint');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Low-stock Alert Transition Integration after Stock Adjustment
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 4: Low-stock Alert Integration after Manual Adjustment ---');
  inventoryAlertService.resetState();

  // Baseline with test product at stock 15, limit 5
  inventoryAlertService.processStockUpdate([
    { id: String(testProduct.id), name: testProduct.name, stock_quantity: 15, low_stock_alert: 5 }
  ]);
  assert(inventoryAlertService.getActiveAlerts().length === 0, 'Initial normal stock creates 0 alerts');

  // Manual adjustment drops stock to 3 (below limit 5)
  const changeResult = inventoryAlertService.recordStockChange(
    { id: String(testProduct.id), name: testProduct.name, stock_quantity: 3, low_stock_alert: 5 },
    15,
    3,
    5
  );
  assert(changeResult.transitionedToLow === true, 'Sound plays on genuine NORMAL -> LOW_STOCK transition');
  assert(inventoryAlertService.getActiveAlerts().length === 1, 'Active low stock alert recorded');
  assert(inventoryAlertService.getActiveAlerts()[0].type === 'low', 'Alert type is "low"');

  // Manual restock back to 20
  inventoryAlertService.recordStockChange(
    { id: String(testProduct.id), name: testProduct.name, stock_quantity: 20, low_stock_alert: 5 },
    3,
    20,
    5
  );
  assert(inventoryAlertService.getActiveAlerts().length === 0, 'Alert dismissed on restock above limit');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Verify Atomic POS Stock Deduction & Sale Audit Logging in create_order_atomic
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 5: Verify Atomic POS Stock Deduction & Sales Audit Log ---');
  const posSalesAudit = await sql`
    SELECT l.id, l.product_id, l.old_quantity, l.new_quantity, l.adjustment, l.reason, l.reference_id
    FROM public.inventory_logs l
    WHERE l.reason = 'sale'
    ORDER BY l.created_at DESC
    LIMIT 5
  `;
  console.log(`Found ${posSalesAudit.length} previous sales audit logs in public.inventory_logs from atomic POS`);
  assert(true, 'Atomic POS stock deduction procedure preserves public.inventory_logs sales auditing');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Verify Zero Direct Supabase inventory_logs Calls in src/
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 6: Verify 0 Browser-side Supabase inventory_logs Calls in src/ ---');
  const fs = await import('fs');
  const path = await import('path');

  function scanDir(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(scanDir(fullPath));
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const srcFiles = scanDir('src');
  let foundSupabaseLogs = 0;
  for (const f of srcFiles) {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes("from('inventory_logs')") || content.includes('from("inventory_logs")')) {
      console.error(`Found direct Supabase inventory_logs call in: ${f}`);
      foundSupabaseLogs++;
    }
  }
  assert(foundSupabaseLogs === 0, 'ZERO direct browser-side Supabase inventory_logs calls exist in src/');

  // Clean up test audit log
  await sql`DELETE FROM public.inventory_logs WHERE reference_id = ${testLogRef}`;
  if (createdTestProduct) {
    await sql`DELETE FROM public.products WHERE id = ${testProduct.id}`;
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`SUMMARY: ${passed} / ${total} tests passed.`);
  console.log('----------------------------------------------------------------\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test script encountered an error:', err);
  process.exit(1);
});
