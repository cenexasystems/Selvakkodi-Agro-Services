import dotenv from 'dotenv';
dotenv.config();

import { sql } from '../api/_lib/db.js';
import { signJwtToken } from '../api/_lib/auth.js';

import ordersHandler from '../api/orders/index.js';
import orderMineHandler from '../api/orders/mine.js';
import orderDetailHandler from '../api/orders/[id]/index.js';
import orderStatusHandler from '../api/orders/[id]/status.js';
import orderInvoicePdfHandler from '../api/orders/[id]/invoice-pdf.js';
import orderAnalyticsHandler from '../api/orders/analytics.js';

// Helper to simulate VercelRequest and VercelResponse
function mockReqRes({ method = 'GET', query = {}, body = null, token = null, headers = {} } = {}) {
  const reqHeaders = {
    'content-type': 'application/json',
    ...headers,
  };
  if (token) {
    reqHeaders['authorization'] = `Bearer ${token}`;
  }

  const req = {
    method,
    url: '/api/orders',
    query,
    body: body ? (typeof body === 'string' ? JSON.parse(body) : body) : {},
    headers: reqHeaders,
  };

  let statusCode = 200;
  let responseData = null;
  const resHeaders = {};

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    setHeader(key, val) {
      resHeaders[key.toLowerCase()] = val;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    },
    end(data) {
      if (data && !responseData) {
        try {
          responseData = JSON.parse(data);
        } catch {
          responseData = data;
        }
      }
      return res;
    },
  };

  return {
    req,
    res,
    getResult: () => ({ status: statusCode, data: responseData, headers: resHeaders }),
  };
}

async function runTest(testName, fn) {
  try {
    process.stdout.write(`TEST: ${testName} ... `);
    await fn();
    console.log(`\x1b[32mPASSED\x1b[0m`);
    return true;
  } catch (err) {
    console.log(`\x1b[31mFAILED\x1b[0m`);
    console.error(`   Error:`, err.message);
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function main() {
  console.log('================================================================');
  console.log('DAY 2 BATCH 2: ORDERS & ATOMIC STOCK DEDUCTION INTEGRATION TESTS');
  console.log('================================================================\n');

  const createdOrderIds = [];
  const createdProductIds = [];
  const createdVariantIds = [];
  const createdUserIds = [];

  // Setup test users
  const adminUserId = '11111111-aaaa-bbbb-cccc-111111111111';
  const staffUserId = '22222222-aaaa-bbbb-cccc-222222222222';
  const custAUserId = '33333333-aaaa-bbbb-cccc-333333333333';
  const custBUserId = '44444444-aaaa-bbbb-cccc-444444444444';

  createdUserIds.push(adminUserId, staffUserId, custAUserId, custBUserId);

  await sql`
    INSERT INTO public.users (id, name, email, role, mobile)
    VALUES 
      (${adminUserId}::uuid, 'Test Admin', 'admin.test@batch2.local', 'admin', '60120000001'),
      (${staffUserId}::uuid, 'Test Staff', 'staff.test@batch2.local', 'staff', '60120000002'),
      (${custAUserId}::uuid, 'Customer A', 'custA.test@batch2.local', 'customer', '60120000003'),
      (${custBUserId}::uuid, 'Customer B', 'custB.test@batch2.local', 'customer', '60120000004')
    ON CONFLICT (id) DO NOTHING
  `;

  const adminToken = signJwtToken({ userId: adminUserId, email: 'admin.test@batch2.local', role: 'admin', name: 'Test Admin' });
  const staffToken = signJwtToken({ userId: staffUserId, email: 'staff.test@batch2.local', role: 'staff', name: 'Test Staff' });
  const custAToken = signJwtToken({ userId: custAUserId, email: 'custA.test@batch2.local', role: 'customer', name: 'Customer A' });
  const custBToken = signJwtToken({ userId: custBUserId, email: 'custB.test@batch2.local', role: 'customer', name: 'Customer B' });

  // Setup test product
  const testProductRows = await sql`
    INSERT INTO public.products (
      name, category, price, offer_price, stock_quantity, stock, unit, is_active
    ) VALUES (
      'TEST BATCH2 Organic Fertilizer', 'Fertilizers', 50.00, 45.00, 10, 10, 'kg', true
    ) RETURNING id
  `;
  const testProdId = testProductRows[0].id;
  createdProductIds.push(testProdId);

  // Setup test variant
  const testVariantRows = await sql`
    INSERT INTO public.product_variants (
      product_id, variant_name, price, stock, is_active
    ) VALUES (
      ${testProdId}, 'TEST BATCH2 5kg Bag', 40.00, 10, true
    ) RETURNING id
  `;
  const testVariantId = testVariantRows[0].id;
  createdVariantIds.push(testVariantId);

  // Setup exact stock product (stock = 5)
  const exactStockProduct = await sql`
    INSERT INTO public.products (
      name, category, price, stock_quantity, stock, unit, is_active
    ) VALUES (
      'TEST BATCH2 Exact Stock Seeds', 'Seeds', 25.00, 5, 5, 'packet', true
    ) RETURNING id
  `;
  const exactProdId = exactStockProduct[0].id;
  createdProductIds.push(exactProdId);

  // Setup concurrency test product (stock = 2)
  const concurrentProduct = await sql`
    INSERT INTO public.products (
      name, category, price, stock_quantity, stock, unit, is_active
    ) VALUES (
      'TEST BATCH2 Concurrency Item', 'Pesticides', 100.00, 2, 2, 'litre', true
    ) RETURNING id
  `;
  const concurrentProdId = concurrentProduct[0].id;
  createdProductIds.push(concurrentProdId);

  let passed = 0;
  let total = 0;

  // 1. Create valid order
  total++;
  let order1Id = null;
  let order1Invoice = null;
  if (await runTest('1. Create valid order (POST /api/orders)', async () => {
    const { req, res, getResult } = mockReqRes({
      method: 'POST',
      token: staffToken,
      body: {
        customerName: 'Ahmad bin Ali',
        phone: '60123456789',
        address: '123 Jalan Ampang, KL',
        status: 'completed',
        orderMode: 'offline',
        orderType: 'pos_sale',
        paymentMethod: 'cash',
        items: [
          {
            product_id: testProdId,
            name: 'TEST BATCH2 Organic Fertilizer',
            quantity: 2,
            unit: 'kg',
            base_price: 45.00,
            line_total: 90.00,
          }
        ]
      }
    });

    await ordersHandler(req, res);
    const result = getResult();
    assert(result.status === 201, `Expected status 201, got ${result.status}: ${JSON.stringify(result.data)}`);
    assert(result.data?.success === true, 'Expected success === true');
    assert(result.data?.data?.orderId, 'Missing orderId');
    assert(result.data?.data?.invoiceNo, 'Missing invoiceNo');

    order1Id = result.data.data.orderId;
    order1Invoice = result.data.data.invoiceNo;
    createdOrderIds.push(order1Id);

    // Verify stock deducted: 10 - 2 = 8
    const [p] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${testProdId}`;
    assert(Number(p.stock_quantity) === 8, `Expected stock 8, got ${p.stock_quantity}`);
  })) passed++;

  // 2. Create order with multiple items
  total++;
  if (await runTest('2. Create order with multiple items', async () => {
    const { req, res, getResult } = mockReqRes({
      method: 'POST',
      token: staffToken,
      body: {
        customerName: 'Multi Item Customer',
        phone: '60129998877',
        status: 'completed',
        items: [
          {
            product_id: testProdId,
            quantity: 1,
            unit: 'kg',
            base_price: 45.00,
          },
          {
            product_id: exactProdId,
            quantity: 2,
            unit: 'packet',
            base_price: 25.00,
          }
        ]
      }
    });

    await ordersHandler(req, res);
    const result = getResult();
    assert(result.status === 201, `Expected status 201, got ${result.status}`);
    createdOrderIds.push(result.data.data.orderId);

    // Verify stocks: testProd was 8 - 1 = 7, exactProd was 5 - 2 = 3
    const [p1] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${testProdId}`;
    const [p2] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${exactProdId}`;
    assert(Number(p1.stock_quantity) === 7, `Expected testProd stock 7, got ${p1.stock_quantity}`);
    assert(Number(p2.stock_quantity) === 3, `Expected exactProd stock 3, got ${p2.stock_quantity}`);
  })) passed++;

  // 3. Create order with variant
  total++;
  if (await runTest('3. Create order with variant', async () => {
    const { req, res, getResult } = mockReqRes({
      method: 'POST',
      token: staffToken,
      body: {
        customerName: 'Variant Customer',
        phone: '60121112233',
        status: 'completed',
        items: [
          {
            product_id: testProdId,
            variant_id: testVariantId,
            variant_name: 'TEST BATCH2 5kg Bag',
            quantity: 3,
            unit: 'bag',
            base_price: 40.00,
          }
        ]
      }
    });

    await ordersHandler(req, res);
    const result = getResult();
    assert(result.status === 201, `Expected status 201, got ${result.status}`);
    createdOrderIds.push(result.data.data.orderId);

    // Verify variant stock was 10 - 3 = 7
    const [v] = await sql`SELECT stock FROM public.product_variants WHERE id = ${testVariantId}`;
    assert(Number(v.stock) === 7, `Expected variant stock 7, got ${v.stock}`);
  })) passed++;

  // 4. Insufficient stock rejected (Case C: stock = 3 on exactProdId, attempt 4)
  total++;
  if (await runTest('4. Insufficient stock rejected (Case C)', async () => {
    const [beforeStock] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${exactProdId}`;
    const curStock = Number(beforeStock.stock_quantity); // 3

    const { req, res, getResult } = mockReqRes({
      method: 'POST',
      token: staffToken,
      body: {
        customerName: 'Greedy Customer',
        phone: '60120001122',
        status: 'completed',
        items: [
          {
            product_id: exactProdId,
            quantity: curStock + 1, // 4 > 3
            base_price: 25.00,
          }
        ]
      }
    });

    await ordersHandler(req, res);
    const result = getResult();
    assert(result.status === 409, `Expected 409 Conflict, got ${result.status}`);
    assert(/insufficient stock/i.test(result.data?.error || ''), `Expected insufficient stock error, got: ${result.data?.error}`);

    // Verify stock remains untouched
    const [afterStock] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${exactProdId}`;
    assert(Number(afterStock.stock_quantity) === curStock, `Stock should remain ${curStock}, got ${afterStock.stock_quantity}`);
  })) passed++;

  // 5. Exact-stock order succeeds (Case B: stock = 3 on exactProdId, order 3)
  total++;
  if (await runTest('5. Exact-stock order succeeds (Case B)', async () => {
    const [beforeStock] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${exactProdId}`;
    const curStock = Number(beforeStock.stock_quantity); // 3

    const { req, res, getResult } = mockReqRes({
      method: 'POST',
      token: staffToken,
      body: {
        customerName: 'Exact Buyer',
        phone: '60124445566',
        status: 'completed',
        items: [
          {
            product_id: exactProdId,
            quantity: curStock,
            base_price: 25.00,
          }
        ]
      }
    });

    await ordersHandler(req, res);
    const result = getResult();
    assert(result.status === 201, `Expected 201, got ${result.status}`);
    createdOrderIds.push(result.data.data.orderId);

    // Verify stock is now 0
    const [afterStock] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${exactProdId}`;
    assert(Number(afterStock.stock_quantity) === 0, `Expected stock 0, got ${afterStock.stock_quantity}`);
  })) passed++;

  // 6. Stock cannot become negative
  total++;
  if (await runTest('6. Stock cannot become negative', async () => {
    const { req, res, getResult } = mockReqRes({
      method: 'POST',
      token: staffToken,
      body: {
        customerName: 'Late Customer',
        phone: '60124445566',
        status: 'completed',
        items: [
          {
            product_id: exactProdId,
            quantity: 1, // available is 0
            base_price: 25.00,
          }
        ]
      }
    });

    await ordersHandler(req, res);
    const result = getResult();
    assert(result.status === 409, `Expected 409, got ${result.status}`);

    const [afterStock] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${exactProdId}`;
    assert(Number(afterStock.stock_quantity) === 0, `Stock must stay 0, got ${afterStock.stock_quantity}`);
  })) passed++;

  // 7. Duplicate stock deduction prevented (Case D)
  total++;
  if (await runTest('7. Duplicate stock deduction prevented (Case D)', async () => {
    // order1Id had 2 units of testProdId deducted at creation (stock was 10 -> 8, then test 2 took 1 -> 7).
    const [stockBefore] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${testProdId}`;
    const initialStock = Number(stockBefore.stock_quantity);

    // Call PUT /api/orders/:id/status to 'completed' again
    const { req, res, getResult } = mockReqRes({
      method: 'PUT',
      token: staffToken,
      query: { id: order1Id },
      body: { status: 'completed' },
    });

    await orderStatusHandler(req, res);
    const result = getResult();
    assert(result.status === 200, `Expected status 200, got ${result.status}`);

    // Verify stock was NOT deducted again
    const [stockAfter] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${testProdId}`;
    assert(Number(stockAfter.stock_quantity) === initialStock, `Stock must remain ${initialStock}, got ${stockAfter.stock_quantity}`);
  })) passed++;

  // 8. Order rollback on stock failure
  total++;
  if (await runTest('8. Order rollback on stock failure', async () => {
    const ordersCountBefore = await sql`SELECT COUNT(*)::int AS count FROM public.orders`;
    const itemsCountBefore = await sql`SELECT COUNT(*)::int AS count FROM public.order_items`;

    const { req, res, getResult } = mockReqRes({
      method: 'POST',
      token: staffToken,
      body: {
        customerName: 'Will Fail',
        phone: '60120000000',
        status: 'completed',
        items: [
          {
            product_id: exactProdId,
            quantity: 100, // impossible
            base_price: 25.00,
          }
        ]
      }
    });

    await ordersHandler(req, res);
    const result = getResult();
    assert(result.status === 409, `Expected 409, got ${result.status}`);

    const ordersCountAfter = await sql`SELECT COUNT(*)::int AS count FROM public.orders`;
    const itemsCountAfter = await sql`SELECT COUNT(*)::int AS count FROM public.order_items`;

    assert(ordersCountAfter[0].count === ordersCountBefore[0].count, 'Orders count should not change');
    assert(itemsCountAfter[0].count === itemsCountBefore[0].count, 'Order items count should not change');
  })) passed++;

  // 9. Customer can access own order
  total++;
  let custAOrderId = null;
  if (await runTest('9. Customer can access own order', async () => {
    // Customer A creates an online request order
    const createReq = mockReqRes({
      method: 'POST',
      token: custAToken,
      body: {
        customerName: 'Customer A',
        phone: '60120000003',
        status: 'pending',
        orderMode: 'online',
        orderType: 'online_request',
        items: [
          {
            product_id: testProdId,
            quantity: 1,
            base_price: 45.00,
          }
        ]
      }
    });
    await ordersHandler(createReq.req, createReq.res);
    const created = createReq.getResult();
    assert(created.status === 201, `Customer A order creation failed: ${created.status}`);
    custAOrderId = created.data.data.orderId;
    createdOrderIds.push(custAOrderId);

    // Customer A calls GET /api/orders/mine
    const mineReq = mockReqRes({
      method: 'GET',
      token: custAToken,
    });
    await orderMineHandler(mineReq.req, mineReq.res);
    const mineRes = mineReq.getResult();
    assert(mineRes.status === 200, `Expected 200, got ${mineRes.status}`);
    assert(Array.isArray(mineRes.data?.data), 'Expected array of orders');
    const hasOrder = mineRes.data.data.some(o => o.id === custAOrderId);
    assert(hasOrder, 'Customer A should see their created order in /api/orders/mine');

    // Customer A calls GET /api/orders/:id on own order
    const detailReq = mockReqRes({
      method: 'GET',
      token: custAToken,
      query: { id: custAOrderId },
    });
    await orderDetailHandler(detailReq.req, detailReq.res);
    const detailRes = detailReq.getResult();
    assert(detailRes.status === 200, `Expected 200, got ${detailRes.status}`);
    assert(detailRes.data?.data?.id === custAOrderId, 'Expected order detail to match');
  })) passed++;

  // 10. Customer cannot access another customer's order
  total++;
  if (await runTest("10. Customer cannot access another customer's order", async () => {
    // Customer B attempts to view Customer A's order by UUID
    const reqRes = mockReqRes({
      method: 'GET',
      token: custBToken,
      query: { id: custAOrderId },
    });
    await orderDetailHandler(reqRes.req, reqRes.res);
    const result = reqRes.getResult();
    assert(result.status === 403, `Expected 403 Forbidden, got ${result.status}`);
  })) passed++;

  // 11. Staff order access works
  total++;
  if (await runTest('11. Staff order access works', async () => {
    // Staff can list orders
    const listReq = mockReqRes({
      method: 'GET',
      token: staffToken,
    });
    await ordersHandler(listReq.req, listReq.res);
    const listRes = listReq.getResult();
    assert(listRes.status === 200, `Expected 200, got ${listRes.status}`);

    // Staff can view any customer's order
    const detailReq = mockReqRes({
      method: 'GET',
      token: staffToken,
      query: { id: custAOrderId },
    });
    await orderDetailHandler(detailReq.req, detailReq.res);
    const detailRes = detailReq.getResult();
    assert(detailRes.status === 200, `Staff should access order, got ${detailRes.status}`);
  })) passed++;

  // 12. Admin order access works
  total++;
  if (await runTest('12. Admin order access works', async () => {
    // Admin updates order remarks
    const updateReq = mockReqRes({
      method: 'PUT',
      token: adminToken,
      query: { id: custAOrderId },
      body: { remarks: 'Admin verified and packaged.' }
    });
    await orderDetailHandler(updateReq.req, updateReq.res);
    const updateRes = updateReq.getResult();
    assert(updateRes.status === 200, `Admin update failed: ${updateRes.status}`);
    assert(updateRes.data?.data?.remarks === 'Admin verified and packaged.', 'Remarks not updated');
  })) passed++;

  // 13. Order status update works
  total++;
  if (await runTest('13. Order status update works', async () => {
    const reqRes = mockReqRes({
      method: 'PUT',
      token: staffToken,
      query: { id: custAOrderId },
      body: { status: 'processing' },
    });
    await orderStatusHandler(reqRes.req, reqRes.res);
    const res = reqRes.getResult();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data?.data?.status === 'processing', `Expected processing, got ${res.data?.data?.status}`);
  })) passed++;

  // 14. Invalid status rejected
  total++;
  if (await runTest('14. Invalid status rejected', async () => {
    const reqRes = mockReqRes({
      method: 'PUT',
      token: staffToken,
      query: { id: custAOrderId },
      body: { status: 'invalid_status_xyz' },
    });
    await orderStatusHandler(reqRes.req, reqRes.res);
    const res = reqRes.getResult();
    assert(res.status === 400, `Expected 400 Bad Request, got ${res.status}`);
  })) passed++;

  // 15. Order history works (filtering & search)
  total++;
  if (await runTest('15. Order history works', async () => {
    const reqRes = mockReqRes({
      method: 'GET',
      token: staffToken,
      query: { customerName: 'Ahmad' },
    });
    await ordersHandler(reqRes.req, reqRes.res);
    const res = reqRes.getResult();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data?.data?.length >= 1, 'Should find at least 1 order matching Ahmad');
    assert(res.data.data[0].customer_name.includes('Ahmad'), 'Customer name should contain Ahmad');
  })) passed++;

  // 16. Order detail works
  total++;
  if (await runTest('16. Order detail works', async () => {
    const reqRes = mockReqRes({
      method: 'GET',
      token: staffToken,
      query: { id: order1Id },
    });
    await orderDetailHandler(reqRes.req, reqRes.res);
    const res = reqRes.getResult();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data?.data?.id === order1Id, 'Mismatched order ID');
    assert(Array.isArray(res.data?.data?.order_items), 'order_items must be an array');
    assert(res.data?.data?.order_items.length > 0, 'order_items must contain items');
  })) passed++;

  // 17. Invoice/order retrieval works (public lookup by invoice number)
  total++;
  if (await runTest('17. Invoice/order retrieval works (Public by invoice_no)', async () => {
    // Unauthenticated public request with invoice_no
    const reqRes = mockReqRes({
      method: 'GET',
      token: null, // No auth token!
      query: { id: order1Invoice },
    });
    await orderDetailHandler(reqRes.req, reqRes.res);
    const res = reqRes.getResult();
    assert(res.status === 200, `Expected 200 for public invoice lookup, got ${res.status}`);
    assert(res.data?.data?.invoice_no === order1Invoice, `Invoice number mismatch`);
    assert(res.data?.data?.order_items?.length > 0, `Public invoice must include items`);
  })) passed++;

  // 18. Order analytics works
  total++;
  if (await runTest('18. Order analytics works (GET /api/orders/analytics)', async () => {
    const reqRes = mockReqRes({
      method: 'GET',
      token: adminToken,
    });
    await orderAnalyticsHandler(reqRes.req, reqRes.res);
    const res = reqRes.getResult();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.data?.data?.totalOrders === 'number', 'Missing totalOrders');
    assert(typeof res.data?.data?.totalRevenue === 'number', 'Missing totalRevenue');
    assert(Array.isArray(res.data?.data?.channelBreakdown), 'Missing channelBreakdown');
  })) passed++;

  // 19. POS checkout works through API (with full split details and remarks)
  total++;
  if (await runTest('19. POS checkout works through API', async () => {
    const reqRes = mockReqRes({
      method: 'POST',
      token: staffToken,
      body: {
        customerName: 'Walk-in Counter Customer',
        phone: '60170001122',
        address: 'POS Counter',
        status: 'completed',
        orderMode: 'offline',
        orderType: 'pos_sale',
        paymentMethod: 'split',
        splitDetails: { cash: 50.00, card: 40.00 },
        remarks: 'Customer requested printed receipt',
        referenceNumber: 'SAS-REF-9988',
        items: [
          {
            product_id: testProdId,
            quantity: 2,
            unit: 'kg',
            base_price: 45.00,
          }
        ]
      }
    });
    await ordersHandler(reqRes.req, reqRes.res);
    const res = reqRes.getResult();
    assert(res.status === 201, `POS order creation failed: ${res.status}`);
    assert(res.data?.data?.order?.remarks === 'Customer requested printed receipt', 'Remarks not saved');
    assert(res.data?.data?.order?.reference_number === 'SAS-REF-9988', 'Reference number not saved');
    createdOrderIds.push(res.data.data.orderId);
  })) passed++;

  // 20. Concurrent orders (Case E: Two simultaneous requests attempt to purchase last units)
  total++;
  if (await runTest('20. Concurrent orders (Case E: Locking & no negative stock)', async () => {
    // concurrentProdId currently has stock = 2.
    // We launch TWO simultaneous order requests, each requesting 2 units!
    // Exactly ONE must succeed and exactly ONE must fail with 409 Insufficient Stock.
    // Stock must become 0, never negative!

    const makeOrder = () => mockReqRes({
      method: 'POST',
      token: staffToken,
      body: {
        customerName: 'Concurrent Buyer',
        phone: '60180009900',
        status: 'completed',
        items: [
          {
            product_id: concurrentProdId,
            quantity: 2,
            base_price: 100.00,
          }
        ]
      }
    });

    const runner1 = makeOrder();
    const runner2 = makeOrder();

    const [res1, res2] = await Promise.all([
      (async () => { await ordersHandler(runner1.req, runner1.res); return runner1.getResult(); })(),
      (async () => { await ordersHandler(runner2.req, runner2.res); return runner2.getResult(); })()
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert(statuses[0] === 201 && statuses[1] === 409, `Expected one 201 and one 409, got ${statuses.join(', ')}`);

    if (res1.status === 201 && res1.data?.data?.orderId) createdOrderIds.push(res1.data.data.orderId);
    if (res2.status === 201 && res2.data?.data?.orderId) createdOrderIds.push(res2.data.data.orderId);

    // Verify stock is exactly 0
    const [finalStock] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${concurrentProdId}`;
    assert(Number(finalStock.stock_quantity) === 0, `Expected stock 0, got ${finalStock.stock_quantity}`);
  })) passed++;

  // 21. Invoice PDF reference update
  total++;
  if (await runTest('21. PUT /api/orders/:id/invoice-pdf works', async () => {
    const reqRes = mockReqRes({
      method: 'PUT',
      token: staffToken,
      query: { id: order1Id },
      body: { url: 'https://storage.test/invoices/test-inv-001.pdf' },
    });
    await orderInvoicePdfHandler(reqRes.req, reqRes.res);
    const res = reqRes.getResult();
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    const [check] = await sql`SELECT invoice_pdf_url FROM public.orders WHERE id = ${order1Id}::uuid`;
    assert(check.invoice_pdf_url === 'https://storage.test/invoices/test-inv-001.pdf', 'PDF URL not updated');
  })) passed++;

  // 22. DELETE /api/orders/:id works
  total++;
  if (await runTest('22. DELETE /api/orders/:id works', async () => {
    const reqRes = mockReqRes({
      method: 'DELETE',
      token: adminToken,
      query: { id: order1Id },
    });
    await orderDetailHandler(reqRes.req, reqRes.res);
    const res = reqRes.getResult();
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    const check = await sql`SELECT id FROM public.orders WHERE id = ${order1Id}::uuid`;
    assert(check.length === 0, 'Order should be deleted');
  })) passed++;

  console.log('\n----------------------------------------------------------------');
  console.log(`RESULTS: ${passed} / ${total} tests passed.`);
  console.log('----------------------------------------------------------------\n');

  // CLEANUP TEST DATA SAFELY
  console.log('Cleaning up test data from Neon DB...');
  try {
    if (createdOrderIds.length > 0) {
      await sql`DELETE FROM public.order_items WHERE order_id = ANY(${createdOrderIds})`;
      await sql`DELETE FROM public.inventory_logs WHERE reference_id = ANY(${createdOrderIds.map(String)})`;
      await sql`DELETE FROM public.orders WHERE id = ANY(${createdOrderIds})`;
      console.log(`- Removed ${createdOrderIds.length} test order records.`);
    }

    if (createdVariantIds.length > 0) {
      await sql`DELETE FROM public.product_variants WHERE id = ANY(${createdVariantIds})`;
      console.log(`- Removed ${createdVariantIds.length} test variant records.`);
    }

    if (createdProductIds.length > 0) {
      await sql`DELETE FROM public.inventory_logs WHERE product_id = ANY(${createdProductIds})`;
      await sql`DELETE FROM public.products WHERE id = ANY(${createdProductIds})`;
      console.log(`- Removed ${createdProductIds.length} test product records.`);
    }

    if (createdUserIds.length > 0) {
      await sql`DELETE FROM public.sessions WHERE user_id = ANY(${createdUserIds})`;
      await sql`DELETE FROM public.users WHERE id = ANY(${createdUserIds})`;
      console.log(`- Removed ${createdUserIds.length} test user records.`);
    }

    console.log('Clean up complete. Neon DB left in pristine state.\n');
  } catch (cleanErr) {
    console.error('Error during test cleanup:', cleanErr);
  }

  if (passed !== total) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
