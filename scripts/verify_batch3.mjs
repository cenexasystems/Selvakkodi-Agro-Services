import jwt from 'jsonwebtoken';
import handlerListCreate from '../api/advance-orders/index.ts';
import handlerDetail from '../api/advance-orders/[id]/index.ts';
import handlerStatus from '../api/advance-orders/[id]/status.ts';
import handlerEvents from '../api/advance-orders/[id]/events.ts';
import handlerComplete from '../api/advance-orders/[id]/complete.ts';
import handlerHistory from '../api/advance-orders/[id]/history.ts';
import handlerOrderDetail from '../api/orders/[id]/index.ts';
import { sql } from '../api/_lib/db.ts';
import { signJwtToken } from '../api/_lib/auth.ts';

function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    query: options.query || {},
    headers: options.headers || {},
    body: options.body || {},
    cookies: options.cookies || {},
  };

  let statusCode = 200;
  let responseData = null;
  let headers = {};

  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    setHeader: (k, v) => {
      headers[k] = v;
      return res;
    },
    getHeader: (k) => headers[k],
    json: (data) => {
      responseData = data;
      return res;
    },
    end: (val) => {
      if (val && !responseData) responseData = val;
      return res;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData,
  };

  return { req, res };
}

let totalPassed = 0;
let totalFailed = 0;
const results = {
  auth: { pass: 0, fail: 0 },
  payment: { pass: 0, fail: 0 },
  status: { pass: 0, fail: 0 },
  transaction: { pass: 0, fail: 0 },
  duplicate: { pass: 0, fail: 0 },
  consistency: { pass: 0, fail: 0 },
  rollback: { pass: 0, fail: 0 },
};

function assert(condition, message, category = 'auth') {
  if (condition) {
    results[category].pass++;
    totalPassed++;
    console.log(`  [PASS] ${message}`);
  } else {
    results[category].fail++;
    totalFailed++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function run() {
  console.log('====================================================');
  console.log('FINAL VERIFICATION SUITE — DAY 2 BATCH 3');
  console.log('====================================================\n');

  // Setup temporary test users
  const adminId = '11111111-1111-4111-8111-111111111111';
  const staffId = '22222222-2222-4222-8222-222222222222';
  const cust1Id = '33333333-3333-4333-8333-333333333333';
  const cust2Id = '44444444-4444-4444-8444-444444444444';

  await sql`DELETE FROM public.users WHERE id IN (${adminId}::uuid, ${staffId}::uuid, ${cust1Id}::uuid, ${cust2Id}::uuid)`;
  await sql`
    INSERT INTO public.users (id, email, name, role, mobile, password_hash)
    VALUES
      (${adminId}::uuid, 'v_admin@test.local', 'Verify Admin', 'admin', '9999000001', 'hash'),
      (${staffId}::uuid, 'v_staff@test.local', 'Verify Staff', 'staff', '9999000002', 'hash'),
      (${cust1Id}::uuid, 'v_cust1@test.local', 'Customer One', 'customer', '9999000003', 'hash'),
      (${cust2Id}::uuid, 'v_cust2@test.local', 'Customer Two', 'customer', '9999000004', 'hash')
  `;

  const adminToken = signJwtToken({ userId: adminId, email: 'v_admin@test.local', role: 'admin', name: 'Verify Admin' });
  const staffToken = signJwtToken({ userId: staffId, email: 'v_staff@test.local', role: 'staff', name: 'Verify Staff' });
  const cust1Token = signJwtToken({ userId: cust1Id, email: 'v_cust1@test.local', role: 'customer', name: 'Customer One' });
  const cust2Token = signJwtToken({ userId: cust2Id, email: 'v_cust2@test.local', role: 'customer', name: 'Customer Two' });

  const adminH = { authorization: `Bearer ${adminToken}` };
  const staffH = { authorization: `Bearer ${staffToken}` };
  const cust1H = { authorization: `Bearer ${cust1Token}` };
  const cust2H = { authorization: `Bearer ${cust2Token}` };

  // Create temporary advance orders: Order 1 (for Cust 1), Order 2 (for Cust 2)
  let order1 = null;
  let order2 = null;

  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      body: {
        customerName: 'Customer One',
        phone: '9999000003',
        address: '100 Silk Way',
        productName: 'Silk Saree Design 1',
        category: 'Silk',
        totalAmount: 500,
        depositAmount: 100,
        expectedDeliveryDate: '2026-11-01',
        paymentMethod: 'cash',
        createdByName: 'Verify Staff',
        referenceNumber: 'REF-VERIFY-001'
      }
    });
    await handlerListCreate(req, res);
    order1 = res.getData()?.data;
    // Set created_by to cust1Id for customer ownership verification
    await sql`UPDATE public.advance_orders SET created_by = ${cust1Id}::uuid WHERE id = ${order1.id}::uuid`;
  }

  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      body: {
        customerName: 'Customer Two',
        phone: '9999000004',
        address: '200 Cotton Lane',
        productName: 'Cotton Kurti Design 2',
        category: 'Cotton',
        totalAmount: 300,
        depositAmount: 50,
        expectedDeliveryDate: '2026-11-02',
        paymentMethod: 'cash',
        createdByName: 'Verify Staff',
        referenceNumber: 'REF-VERIFY-002'
      }
    });
    await handlerListCreate(req, res);
    order2 = res.getData()?.data;
    await sql`UPDATE public.advance_orders SET created_by = ${cust2Id}::uuid WHERE id = ${order2.id}::uuid`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. AUTHORIZATION TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 1: AUTHORIZATION TESTS ---');

  // 1.1 Unauthenticated access
  {
    const { req, res } = createMockReqRes({ method: 'GET' });
    await handlerListCreate(req, res);
    assert(res.getStatusCode() === 401, 'Unauthenticated cannot access GET /api/advance-orders', 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'POST', body: {} });
    await handlerListCreate(req, res);
    assert(res.getStatusCode() === 401, 'Unauthenticated cannot access POST /api/advance-orders', 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'GET', query: { id: order1.id } });
    await handlerDetail(req, res);
    assert(res.getStatusCode() === 401, 'Unauthenticated cannot access GET /api/advance-orders/:id', 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'PUT', query: { id: order1.id }, body: { remarks: 'test' } });
    await handlerDetail(req, res);
    assert(res.getStatusCode() === 401, 'Unauthenticated cannot access PUT /api/advance-orders/:id', 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'PUT', query: { id: order1.id }, body: { status: 'cancelled' } });
    await handlerStatus(req, res);
    assert(res.getStatusCode() === 401, 'Unauthenticated cannot access PUT /api/advance-orders/:id/status', 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'POST', query: { id: order1.id }, body: { eventType: 'test', label: 'test' } });
    await handlerEvents(req, res);
    assert(res.getStatusCode() === 401, 'Unauthenticated cannot access POST /api/advance-orders/:id/events', 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'POST', query: { id: order1.id }, body: { paymentMethod: 'cash', finalAmount: 100 } });
    await handlerComplete(req, res);
    assert(res.getStatusCode() === 401, 'Unauthenticated cannot access POST /api/advance-orders/:id/complete', 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'GET', query: { id: order1.id } });
    await handlerHistory(req, res);
    assert(res.getStatusCode() === 401, 'Unauthenticated cannot access GET /api/advance-orders/:id/history', 'auth');
  }

  // 1.2 Customer access to own vs another's order
  {
    const { req, res } = createMockReqRes({ method: 'GET', headers: cust1H, query: { id: order1.id } });
    await handlerDetail(req, res);
    assert(res.getStatusCode() === 200 && res.getData()?.data?.id === order1.id, 'Customer 1 CAN access own advance order', 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'GET', headers: cust1H, query: { id: order2.id } });
    await handlerDetail(req, res);
    assert(res.getStatusCode() === 403, "Customer 1 CANNOT access Customer 2's advance order (403)", 'auth');
  }

  // 1.3 Customer cannot modify another customer's order (or any order)
  {
    const { req, res } = createMockReqRes({ method: 'PUT', headers: cust1H, query: { id: order2.id }, body: { remarks: 'hacked' } });
    await handlerDetail(req, res);
    assert(res.getStatusCode() === 403, "Customer 1 CANNOT modify Customer 2's advance order (403)", 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'PUT', headers: cust1H, query: { id: order1.id }, body: { remarks: 'hacked' } });
    await handlerDetail(req, res);
    assert(res.getStatusCode() === 403, 'Customer 1 CANNOT modify own order details directly via staff endpoint (403)', 'auth');
  }

  // 1.4 Customer cannot add timeline events to another's (or own) order
  {
    const { req, res } = createMockReqRes({ method: 'POST', headers: cust1H, query: { id: order2.id }, body: { eventType: 'test', label: 'test' } });
    await handlerEvents(req, res);
    assert(res.getStatusCode() === 403, "Customer 1 CANNOT add timeline events to Customer 2's order (403)", 'auth');
  }

  // 1.5 Customer cannot add/modify payments / complete orders
  {
    const { req, res } = createMockReqRes({ method: 'POST', headers: cust1H, query: { id: order2.id }, body: { paymentMethod: 'cash', finalAmount: 250 } });
    await handlerComplete(req, res);
    assert(res.getStatusCode() === 403, "Customer 1 CANNOT complete/pay Customer 2's advance order (403)", 'auth');
  }

  // 1.6 Customer history access
  {
    const { req, res } = createMockReqRes({ method: 'GET', headers: cust1H, query: { id: order1.id } });
    await handlerHistory(req, res);
    assert(res.getStatusCode() === 200, 'Customer 1 CAN view own history', 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'GET', headers: cust1H, query: { id: order2.id } });
    await handlerHistory(req, res);
    assert(res.getStatusCode() === 403, "Customer 1 CANNOT view Customer 2's history (403)", 'auth');
  }

  // 1.7 Staff permissions
  {
    const { req, res } = createMockReqRes({ method: 'GET', headers: staffH, query: { id: order1.id } });
    await handlerDetail(req, res);
    assert(res.getStatusCode() === 200, 'Staff CAN view any advance order', 'auth');
  }
  {
    const { req, res } = createMockReqRes({ method: 'POST', headers: staffH, query: { id: order1.id }, body: { eventType: 'tailoring_started', label: 'Tailoring Started' } });
    await handlerEvents(req, res);
    assert(res.getStatusCode() === 201, 'Staff CAN add timeline events', 'auth');
  }

  // 1.8 Admin full access
  {
    const { req, res } = createMockReqRes({ method: 'GET', headers: adminH });
    await handlerListCreate(req, res);
    assert(res.getStatusCode() === 200 && Array.isArray(res.getData()?.data), 'Admin has full listing access', 'auth');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. PAYMENT VALIDATION TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: PAYMENT VALIDATION TESTS ---');

  // Create temporary order for payment tests
  let payOrder = null;
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      body: {
        customerName: 'Payment Tester',
        phone: '9999000099',
        productName: 'Test Silk Item',
        totalAmount: 1000.00,
        depositAmount: 300.00,
        expectedDeliveryDate: '2026-11-10',
        paymentMethod: 'cash',
        createdByName: 'Staff Tester'
      }
    });
    await handlerListCreate(req, res);
    payOrder = res.getData()?.data;
  }

  // 2.1 Verify remaining balance calculated server-side
  assert(Number(payOrder.remaining_balance) === 700.00, 'Remaining balance calculated server-side (1000 - 300 = 700)', 'payment');

  // 2.2 Payment for nonexistent advance order
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      query: { id: '00000000-0000-0000-0000-000000000000' },
      body: { paymentMethod: 'cash', finalAmount: 100 }
    });
    await handlerComplete(req, res);
    assert(res.getStatusCode() >= 400, 'Payment for nonexistent advance order is rejected (404/500)', 'payment');
  }

  // 2.3 Negative payment
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      query: { id: payOrder.id },
      body: { paymentMethod: 'cash', finalAmount: -50.00 }
    });
    await handlerComplete(req, res);
    assert(res.getStatusCode() === 400, 'Negative payment is rejected with 400', 'payment');
  }

  // 2.4 Invalid/non-numeric payment
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      query: { id: payOrder.id },
      body: { paymentMethod: 'cash', finalAmount: 'not-a-number' }
    });
    await handlerComplete(req, res);
    assert(res.getStatusCode() === 400, 'Non-numeric payment is rejected with 400', 'payment');
  }

  // 2.5 Payment exceeding remaining balance (remaining is 700, test 800 without discount)
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      query: { id: payOrder.id },
      body: { paymentMethod: 'cash', finalAmount: 900.00 }
    });
    await handlerComplete(req, res);
    assert(res.getStatusCode() >= 400 && String(res.getData()?.error).toLowerCase().includes('exceeds'), 'Payment exceeding remaining balance is rejected', 'payment');
  }

  // 2.6 Payment for another customer's advance order by customer
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: cust2H,
      query: { id: payOrder.id },
      body: { paymentMethod: 'cash', finalAmount: 700.00 }
    });
    await handlerComplete(req, res);
    assert(res.getStatusCode() === 403, "Payment for another customer's advance order by customer is rejected (403)", 'payment');
  }

  // 2.7 Zero payment (valid when full discount applied or 0 balance remaining)
  {
    // Create an order where deposit == total - 1 (remaining = 1) and manual discount = 1 -> finalAmount = 0
    let zeroPayOrder = null;
    const { req: r1, res: s1 } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      body: {
        customerName: 'Zero Pay Customer',
        phone: '9999000088',
        productName: 'Sample Piece',
        totalAmount: 100.00,
        depositAmount: 99.00,
        expectedDeliveryDate: '2026-11-10',
        paymentMethod: 'cash',
        createdByName: 'Staff'
      }
    });
    await handlerListCreate(r1, s1);
    zeroPayOrder = s1.getData()?.data;

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      query: { id: zeroPayOrder.id },
      body: {
        paymentMethod: 'cash',
        finalAmount: 0.00,
        manualDiscount: 1.00,
        remarks: 'Waiver applied'
      }
    });
    await handlerComplete(req, res);
    assert(res.getStatusCode() === 200 && res.getData()?.success === true, 'Zero payment with full discount is accepted', 'payment');

    // Cleanup zeroPayOrder
    await sql`UPDATE public.advance_orders SET completed_order_id = NULL WHERE id = ${zeroPayOrder.id}::uuid`;
    if (res.getData()?.data?.order_id) {
      await sql`DELETE FROM public.orders WHERE id = ${res.getData().data.order_id}::uuid`;
    }
    await sql`DELETE FROM public.advance_order_payments WHERE advance_order_id = ${zeroPayOrder.id}::uuid`;
    await sql`DELETE FROM public.advance_order_timeline WHERE advance_order_id = ${zeroPayOrder.id}::uuid`;
    await sql`DELETE FROM public.advance_orders WHERE id = ${zeroPayOrder.id}::uuid`;
  }

  // 2.8 Valid payment (standard final payment)
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      query: { id: payOrder.id },
      body: {
        paymentMethod: 'card',
        finalAmount: 700.00,
        remarks: 'Card swipe at counter'
      }
    });
    await handlerComplete(req, res);
    assert(res.getStatusCode() === 200 && res.getData()?.success === true, 'Valid final payment succeeds', 'payment');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. STATUS VALIDATION TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: STATUS VALIDATION TESTS ---');

  // Create temporary order for status testing
  let statusOrder = null;
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      body: {
        customerName: 'Status Tester',
        phone: '9999000077',
        productName: 'Status Dress',
        totalAmount: 800.00,
        depositAmount: 200.00,
        expectedDeliveryDate: '2026-11-20',
        paymentMethod: 'cash',
        createdByName: 'Staff'
      }
    });
    await handlerListCreate(req, res);
    statusOrder = res.getData()?.data;
  }

  // 3.1 Valid status transition: pending_deposit -> ready_for_delivery
  {
    const { req, res } = createMockReqRes({
      method: 'PUT',
      headers: staffH,
      query: { id: statusOrder.id },
      body: { status: 'ready_for_delivery', remarks: 'Sewing finished' }
    });
    await handlerStatus(req, res);
    assert(res.getStatusCode() === 200 && res.getData()?.data?.status === 'ready_for_delivery', 'Valid status transition succeeds (ready_for_delivery)', 'status');
  }

  // 3.2 Invalid status value rejected
  {
    const { req, res } = createMockReqRes({
      method: 'PUT',
      headers: staffH,
      query: { id: statusOrder.id },
      body: { status: 'bogus_status_xyz', remarks: 'test' }
    });
    await handlerStatus(req, res);
    assert(res.getStatusCode() === 400, 'Invalid status value rejected with 400', 'status');
  }

  // 3.3 Status change creates appropriate timeline event
  {
    const timelineRows = await sql`
      SELECT event_type, label FROM public.advance_order_timeline
      WHERE advance_order_id = ${statusOrder.id}::uuid AND event_type = 'ready_for_delivery'
    `;
    assert(timelineRows.length > 0, 'Status change created timeline event in advance_order_timeline', 'status');
  }

  // 3.4 Unauthorized user cannot change status
  {
    const { req, res } = createMockReqRes({
      method: 'PUT',
      headers: cust1H,
      query: { id: statusOrder.id },
      body: { status: 'cancelled' }
    });
    await handlerStatus(req, res);
    assert(res.getStatusCode() === 403, 'Customer cannot change status (403)', 'status');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. COMPLETION TRANSACTION SAFETY & ROLLBACK TEST
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: COMPLETION TRANSACTION SAFETY & ROLLBACK ---');

  // Verify all 7 steps run inside single atomic transaction:
  // We simulate a failure inside complete_advance_order_v2 by passing an order that is cancelled
  // or a payment amount that causes a check failure
  let cancelOrder = null;
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      body: {
        customerName: 'Rollback Tester',
        phone: '9999000066',
        productName: 'Rollback Saree',
        totalAmount: 600.00,
        depositAmount: 200.00,
        expectedDeliveryDate: '2026-11-25',
        paymentMethod: 'cash',
        createdByName: 'Staff'
      }
    });
    await handlerListCreate(req, res);
    cancelOrder = res.getData()?.data;
    // Set status to cancelled
    await sql`UPDATE public.advance_orders SET status = 'cancelled' WHERE id = ${cancelOrder.id}::uuid`;
  }

  // Snapshot before failed completion
  const ordersBeforeCount = (await sql`SELECT count(*) FROM public.orders`)[0].count;
  const paymentsBeforeCount = (await sql`SELECT count(*) FROM public.advance_order_payments WHERE advance_order_id = ${cancelOrder.id}::uuid`)[0].count;
  const timelineBeforeCount = (await sql`SELECT count(*) FROM public.advance_order_timeline WHERE advance_order_id = ${cancelOrder.id}::uuid`)[0].count;

  // Attempt to complete cancelled order (which triggers RAISE EXCEPTION 'A cancelled order cannot be completed')
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      query: { id: cancelOrder.id },
      body: { paymentMethod: 'cash', finalAmount: 400.00 }
    });
    await handlerComplete(req, res);
    assert(res.getStatusCode() >= 400, 'Attempt to complete cancelled order triggers transaction exception', 'transaction');
  }

  // Verify NO records were inserted or altered
  const ordersAfterCount = (await sql`SELECT count(*) FROM public.orders`)[0].count;
  const paymentsAfterCount = (await sql`SELECT count(*) FROM public.advance_order_payments WHERE advance_order_id = ${cancelOrder.id}::uuid`)[0].count;
  const timelineAfterCount = (await sql`SELECT count(*) FROM public.advance_order_timeline WHERE advance_order_id = ${cancelOrder.id}::uuid`)[0].count;
  const [advCheck] = await sql`SELECT status, completed_order_id, invoice_number FROM public.advance_orders WHERE id = ${cancelOrder.id}::uuid`;

  assert(ordersBeforeCount === ordersAfterCount, 'No official order created on failed completion (rolled back)', 'rollback');
  assert(paymentsBeforeCount === paymentsAfterCount, 'No payment recorded on failed completion (rolled back)', 'rollback');
  assert(timelineBeforeCount === timelineAfterCount, 'No timeline event added on failed completion (rolled back)', 'rollback');
  assert(advCheck.status === 'cancelled' && advCheck.completed_order_id === null && advCheck.invoice_number === null, 'Advance order remains in original cancelled state (rolled back)', 'rollback');

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. DUPLICATE COMPLETION TEST
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: DUPLICATE COMPLETION TEST ---');

  // Attempt to complete payOrder again (payOrder was already completed in 2.8)
  {
    const ordersCount1 = (await sql`SELECT count(*) FROM public.orders WHERE id = (SELECT completed_order_id FROM public.advance_orders WHERE id = ${payOrder.id}::uuid)`)[0].count;
    const paymentsCount1 = (await sql`SELECT count(*) FROM public.advance_order_payments WHERE advance_order_id = ${payOrder.id}::uuid AND payment_type = 'remaining'`)[0].count;

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: staffH,
      query: { id: payOrder.id },
      body: { paymentMethod: 'cash', finalAmount: 700.00 }
    });
    await handlerComplete(req, res);

    assert(res.getStatusCode() >= 400, 'Second completion attempt is rejected with error', 'duplicate');

    const ordersCount2 = (await sql`SELECT count(*) FROM public.orders WHERE id = (SELECT completed_order_id FROM public.advance_orders WHERE id = ${payOrder.id}::uuid)`)[0].count;
    const paymentsCount2 = (await sql`SELECT count(*) FROM public.advance_order_payments WHERE advance_order_id = ${payOrder.id}::uuid AND payment_type = 'remaining'`)[0].count;

    assert(ordersCount1 === ordersCount2 && ordersCount2 === '1', 'Exactly 1 official order exists (no duplicate)', 'duplicate');
    assert(paymentsCount1 === paymentsCount2 && paymentsCount2 === '1', 'Exactly 1 final payment exists (no duplicate)', 'duplicate');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. DATA CONSISTENCY TEST
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: DATA CONSISTENCY TEST ---');

  {
    const [finalAdv] = await sql`SELECT * FROM public.advance_orders WHERE id = ${payOrder.id}::uuid`;
    assert(finalAdv.status === 'completed', 'Advance order status is completed', 'consistency');
    assert(finalAdv.completed_order_id !== null, 'completed_order_id is set to valid UUID', 'consistency');
    assert(finalAdv.invoice_number !== null && finalAdv.invoice_number.length > 0, 'invoice_number is populated', 'consistency');

    const [officialOrder] = await sql`SELECT * FROM public.orders WHERE id = ${finalAdv.completed_order_id}::uuid`;
    assert(officialOrder !== undefined, 'Official order exists in public.orders', 'consistency');
    assert(officialOrder.invoice_no === finalAdv.invoice_number, 'Official order invoice_no matches advance order invoice_number', 'consistency');
    assert(Number(officialOrder.total) === 1000.00, 'Revenue recognized equals full total (RM 1000.00)', 'consistency');

    const orderItems = await sql`SELECT * FROM public.order_items WHERE order_id = ${finalAdv.completed_order_id}::uuid`;
    assert(orderItems.length >= 1, 'Official order items created accurately', 'consistency');

    const finalPayments = await sql`SELECT * FROM public.advance_order_payments WHERE advance_order_id = ${payOrder.id}::uuid`;
    assert(finalPayments.length === 2, 'Exactly 2 payments recorded (deposit + remaining)', 'consistency');

    const timelineMilestones = await sql`SELECT event_type FROM public.advance_order_timeline WHERE advance_order_id = ${payOrder.id}::uuid`;
    const milestoneTypes = timelineMilestones.map(t => t.event_type);
    assert(milestoneTypes.includes('created') && milestoneTypes.includes('deposit_received') && milestoneTypes.includes('remaining_payment_received') && milestoneTypes.includes('invoice_generated'), 'All expected milestone events present in timeline', 'consistency');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. CLEANUP ALL TEMPORARY TEST DATA
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CLEANING UP ALL TEST DATA ---');

  const testOrderIds = [order1?.id, order2?.id, payOrder?.id, statusOrder?.id, cancelOrder?.id].filter(Boolean);

  for (const tid of testOrderIds) {
    const rows = await sql`SELECT completed_order_id FROM public.advance_orders WHERE id = ${tid}::uuid`;
    await sql`UPDATE public.advance_orders SET completed_order_id = NULL WHERE id = ${tid}::uuid`;
    if (rows[0]?.completed_order_id) {
      await sql`DELETE FROM public.orders WHERE id = ${rows[0].completed_order_id}::uuid`;
    }
    await sql`DELETE FROM public.advance_order_payments WHERE advance_order_id = ${tid}::uuid`;
    await sql`DELETE FROM public.advance_order_timeline WHERE advance_order_id = ${tid}::uuid`;
    await sql`DELETE FROM public.advance_orders WHERE id = ${tid}::uuid`;
  }

  await sql`DELETE FROM public.users WHERE id IN (${adminId}::uuid, ${staffId}::uuid, ${cust1Id}::uuid, ${cust2Id}::uuid)`;
  console.log('Cleanup completed cleanly. 0 test junk remaining in database.');

  console.log('\n====================================================');
  console.log('FINAL VERIFICATION SUMMARY:');
  console.log(`Authorization Tests: ${results.auth.pass} passed / ${results.auth.fail} failed`);
  console.log(`Payment Validation Tests: ${results.payment.pass} passed / ${results.payment.fail} failed`);
  console.log(`Status Validation Tests: ${results.status.pass} passed / ${results.status.fail} failed`);
  console.log(`Transaction Safety Tests: ${results.transaction.pass} passed / ${results.transaction.fail} failed`);
  console.log(`Duplicate Completion Tests: ${results.duplicate.pass} passed / ${results.duplicate.fail} failed`);
  console.log(`Rollback Tests: ${results.rollback.pass} passed / ${results.rollback.fail} failed`);
  console.log(`Data Consistency Tests: ${results.consistency.pass} passed / ${results.consistency.fail} failed`);
  console.log(`TOTAL: ${totalPassed} passed / ${totalFailed} failed`);
  console.log('====================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test execution exception:', err);
  process.exit(1);
});
