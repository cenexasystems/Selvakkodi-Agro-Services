-- ============================================================================
-- SELVAKKODI AGRO SERVICES
-- Complete Neon PostgreSQL Database Schema & Functions
-- Generated for migration from Supabase to Neon PostgreSQL
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. COMPATIBILITY SCHEMA FOR AUTH
-- Stubs to ensure legacy or helper calls to auth.uid() or auth.jwt() execute cleanly in Neon.
-- IMPORTANT: Do NOT treat auth.uid() as real authentication. The Vercel /api backend
-- authenticates users via JWT/session and passes the verified user ID explicitly to functions.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::UUID;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT '{}'::JSONB;
$$;

-- 3. SEQUENCES
CREATE SEQUENCE IF NOT EXISTS public.customer_code_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 10000001;
CREATE SEQUENCE IF NOT EXISTS public.deposit_number_seq START WITH 1;

-- 4. USERS TABLE (Application users authenticated via Vercel /api backend)
-- Password hashing is performed server-side in the Vercel API backend using bcrypt/argon2.
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'staff', 'customer')),
  avatar_url TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibility view for any queries checking auth.users
CREATE OR REPLACE VIEW auth.users AS
SELECT
  id,
  email,
  password_hash AS encrypted_password,
  role,
  raw_user_meta_data,
  created_at,
  updated_at
FROM public.users;

-- 5. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  customer_code TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  email TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'customer', 'staff')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
  id BIGSERIAL PRIMARY KEY,
  name_en TEXT NOT NULL UNIQUE,
  name_ta TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_ta TEXT NOT NULL DEFAULT '',
  tamil_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  category_id BIGINT REFERENCES public.categories(id) ON DELETE SET NULL,
  remedy TEXT[] NOT NULL DEFAULT '{}',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  offer_price NUMERIC(12,2),
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  mrp NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  unit_type TEXT NOT NULL DEFAULT 'unit' CHECK (unit_type IN ('unit', 'weight', 'volume', 'bundle')),
  unit_label TEXT NOT NULL DEFAULT 'piece',
  unit TEXT NOT NULL DEFAULT 'piece',
  base_quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  opening_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  stock_unit TEXT NOT NULL DEFAULT 'piece',
  low_stock_alert NUMERIC(12,3) NOT NULL DEFAULT 5,
  allow_decimal_quantity BOOLEAN NOT NULL DEFAULT FALSE,
  predefined_options JSONB NOT NULL DEFAULT '[]'::JSONB,
  description TEXT NOT NULL DEFAULT '',
  description_ta TEXT NOT NULL DEFAULT '',
  benefits TEXT NOT NULL DEFAULT '',
  benefits_ta TEXT NOT NULL DEFAULT '',
  image TEXT,
  image_url TEXT,
  sku TEXT,
  barcode TEXT,
  brand TEXT,
  supplier TEXT,
  size TEXT,
  color TEXT,
  rating NUMERIC(3,1) NOT NULL DEFAULT 5,
  has_variants BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_category_name_unique
  ON public.products (category_id, LOWER(BTRIM(name)));

-- 8. PRODUCT VARIANTS TABLE
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  size_label TEXT,
  weight_value NUMERIC(12,3),
  weight_unit TEXT,
  sku TEXT,
  barcode TEXT,
  purchase_price NUMERIC(12,2),
  mrp NUMERIC(12,2),
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  group_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_product_name_unique
  ON public.product_variants (product_id, LOWER(BTRIM(variant_name)));

-- 9. COUPONS TABLE
CREATE TABLE IF NOT EXISTS public.coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  percentage NUMERIC(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expiry_date TIMESTAMPTZ,
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  min_order_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_upper_unique
  ON public.coupons (UPPER(BTRIM(code)));

-- 10. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT 'Customer',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  order_mode TEXT NOT NULL DEFAULT 'offline',
  order_type TEXT NOT NULL DEFAULT 'pos_sale',
  delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  manual_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  manual_discount_type TEXT NOT NULL DEFAULT 'flat',
  manual_discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  coupon_code TEXT,
  coupon_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_gst NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  split_details JSONB NOT NULL DEFAULT '{}'::JSONB,
  invoice_pdf_url TEXT,
  remarks TEXT,
  reference_number TEXT,
  billing_date TIMESTAMPTZ,
  stock_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_invoice_no ON public.orders(invoice_no);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- 11. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL DEFAULT 'Product',
  name TEXT NOT NULL DEFAULT 'Product',
  product_tamil_name TEXT,
  tamil_name TEXT,
  variant_name TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'piece',
  unit_type TEXT NOT NULL DEFAULT 'unit',
  base_quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'catalogue',
  note TEXT,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 12. INVOICE COUNTER TABLE
CREATE TABLE IF NOT EXISTS public.invoice_counter (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  counter BIGINT NOT NULL DEFAULT 0,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.invoice_counter (id, counter, year)
VALUES (1, 0, EXTRACT(YEAR FROM NOW())::INTEGER)
ON CONFLICT (id) DO NOTHING;

-- 13. STORE SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.store_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'SELVAKKODI AGRO SERVICES',
  owner_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  gst_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  low_stock_limit NUMERIC(12,3) NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.store_settings (id, name, owner_name, phone, email, address)
VALUES (
  1,
  'SELVAKKODI AGRO SERVICES',
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- 14. ADVANCE ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.advance_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL,
  products JSONB NOT NULL DEFAULT '[]'::JSONB,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  deposit_amount NUMERIC(12,2) NOT NULL CHECK (deposit_amount > 0),
  remaining_balance NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - deposit_amount) STORED,
  expected_delivery_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_deposit' CHECK (status IN ('pending_deposit','ready_for_delivery','waiting_final_payment','completed','cancelled')),
  remarks TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completed_order_id UUID UNIQUE REFERENCES public.orders(id) ON DELETE SET NULL,
  invoice_number TEXT UNIQUE,
  final_payment_method TEXT,
  CONSTRAINT advance_deposit_less_than_total CHECK (deposit_amount < total_amount)
);

CREATE INDEX IF NOT EXISTS idx_advance_orders_invoice_number ON public.advance_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_advance_orders_status ON public.advance_orders(status);
CREATE INDEX IF NOT EXISTS idx_advance_orders_created_at ON public.advance_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advance_orders_delivery ON public.advance_orders(expected_delivery_date);

-- 15. ADVANCE ORDER TIMELINE TABLE
CREATE TABLE IF NOT EXISTS public.advance_order_timeline (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advance_order_id UUID NOT NULL REFERENCES public.advance_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  label TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_order_timeline_order ON public.advance_order_timeline(advance_order_id, created_at);

-- 16. ADVANCE ORDER PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.advance_order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_order_id UUID NOT NULL REFERENCES public.advance_orders(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit','remaining')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT '',
  received_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (advance_order_id, payment_type)
);

CREATE INDEX IF NOT EXISTS idx_advance_order_payments_order ON public.advance_order_payments(advance_order_id, received_at);

-- 17. STORE REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.store_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id TEXT,
  reviewer TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. INVENTORY LOGS TABLE
CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE,
  old_quantity NUMERIC(12,3) NOT NULL,
  new_quantity NUMERIC(12,3) NOT NULL,
  adjustment NUMERIC(12,3) NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('sale', 'restock', 'return', 'manual_adjustment', 'loss')),
  reference_id TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_product ON public.inventory_logs(product_id, created_at DESC);

-- 19. EXPENSE CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.expense_categories (name) VALUES 
('Rent'), ('Utilities'), ('Salaries'), ('Supplies'), ('Marketing'), ('Maintenance'), ('Other')
ON CONFLICT (name) DO NOTHING;

-- 20. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id INTEGER REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  receipt_url TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);

-- 21. STAFF TABLE
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Staff',
  phone TEXT,
  base_salary NUMERIC(12,2) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_user_id ON public.staff(user_id) WHERE user_id IS NOT NULL;

-- 22. ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'half-day', 'leave')),
  check_in_time TIMESTAMPTZ,
  notes TEXT,
  marked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON public.attendance(staff_id, date);

-- ============================================================================
-- 23. CORE DATABASE TRIGGERS & PROCEDURES
-- ============================================================================

-- Generic updated_at timestamp refresher
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_users_updated_at ON public.users;
CREATE TRIGGER touch_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_profiles_updated_at ON public.profiles;
CREATE TRIGGER touch_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_categories_updated_at ON public.categories;
CREATE TRIGGER touch_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_products_updated_at ON public.products;
CREATE TRIGGER touch_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER touch_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_coupons_updated_at ON public.coupons;
CREATE TRIGGER touch_coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_orders_updated_at ON public.orders;
CREATE TRIGGER touch_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_store_settings_updated_at ON public.store_settings;
CREATE TRIGGER touch_store_settings_updated_at BEFORE UPDATE ON public.store_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_advance_orders_updated_at ON public.advance_orders;
CREATE TRIGGER touch_advance_orders_updated_at BEFORE UPDATE ON public.advance_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_expenses_updated_at ON public.expenses;
CREATE TRIGGER touch_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_staff_updated_at ON public.staff;
CREATE TRIGGER touch_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_attendance_updated_at ON public.attendance;
CREATE TRIGGER touch_attendance_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile when a user record is inserted
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, customer_code, name, mobile, email, role, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.customer_code, 'CUST-' || LPAD(nextval('public.customer_code_seq')::TEXT, 5, '0')),
    COALESCE(NULLIF(BTRIM(NEW.name), ''), split_part(COALESCE(NEW.email, ''), '@', 1), 'Customer'),
    COALESCE(NEW.mobile, ''),
    NEW.email,
    COALESCE(NEW.role, 'customer'),
    NEW.avatar_url
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    mobile = EXCLUDED.mobile,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_created ON public.users;
CREATE TRIGGER on_user_created
AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Synchronize product category name from categories table
CREATE OR REPLACE FUNCTION public.sync_product_category_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT name_en INTO NEW.category FROM public.categories WHERE id = NEW.category_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_product_category_name_trigger ON public.products;
CREATE TRIGGER sync_product_category_name_trigger
BEFORE INSERT OR UPDATE OF category_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_category_name();

-- Synchronize category name changes to products table
CREATE OR REPLACE FUNCTION public.sync_category_name_to_products()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name_en IS DISTINCT FROM OLD.name_en THEN
    UPDATE public.products SET category = NEW.name_en, updated_at = NOW() WHERE category_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_category_name_to_products_trigger ON public.categories;
CREATE TRIGGER sync_category_name_to_products_trigger
AFTER UPDATE OF name_en ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.sync_category_name_to_products();

-- Ensure only one default variant per product
CREATE OR REPLACE FUNCTION public.ensure_one_default_variant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.product_variants
    SET is_default = FALSE, updated_at = NOW()
    WHERE product_id = NEW.product_id AND id <> NEW.id AND is_default;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_one_default_variant_trigger ON public.product_variants;
CREATE TRIGGER ensure_one_default_variant_trigger
AFTER INSERT OR UPDATE OF is_default ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.ensure_one_default_variant();

-- ============================================================================
-- 24. INVOICE GENERATION & RPC FUNCTIONS
-- ============================================================================

-- Generates sequential 8-digit invoice numbers (e.g. 10000001)
CREATE OR REPLACE FUNCTION public.get_next_invoice_no()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
VOLATILE
AS $$
  SELECT LPAD(nextval('public.invoice_number_seq')::TEXT, 8, '0');
$$;

-- Atomic Order Creation with Stock Validation and Coupon Updates
CREATE OR REPLACE FUNCTION public.create_order_with_stock(
  p_customer_name TEXT,
  p_phone TEXT,
  p_address TEXT,
  p_items JSONB,
  p_shipping NUMERIC DEFAULT 0,
  p_status TEXT DEFAULT 'pending',
  p_order_mode TEXT DEFAULT 'offline',
  p_order_type TEXT DEFAULT 'pos_sale',
  p_delivery_charge NUMERIC DEFAULT 0,
  p_discount_amount NUMERIC DEFAULT 0,
  p_manual_discount_amount NUMERIC DEFAULT 0,
  p_manual_discount_type TEXT DEFAULT 'flat',
  p_manual_discount_value NUMERIC DEFAULT 0,
  p_coupon_code TEXT DEFAULT NULL,
  p_coupon_percentage NUMERIC DEFAULT 0,
  p_total_gst NUMERIC DEFAULT 0,
  p_gst_enabled BOOLEAN DEFAULT FALSE,
  p_payment_method TEXT DEFAULT 'cash',
  p_split_details JSONB DEFAULT '{}'::JSONB,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_no TEXT;
  v_order_id UUID;
  v_subtotal NUMERIC(12,2) := 0;
  v_total NUMERIC(12,2);
  v_item JSONB;
  v_quantity NUMERIC(12,3);
  v_price NUMERIC(12,2);
  v_line_total NUMERIC(12,2);
  v_source TEXT;
  v_attempt INTEGER;
  v_current_stock NUMERIC(12,3);
  v_current_variant_stock NUMERIC(12,3);
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one order item is required';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := GREATEST(COALESCE(NULLIF(v_item ->> 'quantity', '')::NUMERIC, 0), 0);
    v_price := GREATEST(COALESCE(NULLIF(v_item ->> 'base_price', '')::NUMERIC, 0), 0);
    v_line_total := GREATEST(
      COALESCE(NULLIF(v_item ->> 'line_total', '')::NUMERIC, v_quantity * v_price),
      0
    );

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Item quantity must be greater than zero';
    END IF;

    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  v_total := GREATEST(
    ROUND(
      v_subtotal + GREATEST(COALESCE(p_shipping, 0), 0)
        + GREATEST(COALESCE(p_delivery_charge, 0), 0)
        + GREATEST(COALESCE(p_total_gst, 0), 0)
        - GREATEST(COALESCE(p_discount_amount, 0), 0)
        - GREATEST(COALESCE(p_manual_discount_amount, 0), 0),
      2
    ),
    0
  );

  FOR v_attempt IN 1..5 LOOP
    v_invoice_no := public.get_next_invoice_no();
    v_order_id := gen_random_uuid();

    BEGIN
      INSERT INTO public.orders (
        id, invoice_no, user_id, customer_name, phone, address, items, subtotal, shipping, total,
        status, order_mode, order_type, delivery_charge, discount_amount, manual_discount_amount,
        manual_discount_type, manual_discount_value, coupon_code, coupon_percentage, total_gst,
        gst_amount, gst_enabled, payment_method, payment_mode, split_details, stock_deducted, created_at, updated_at
      ) VALUES (
        v_order_id, v_invoice_no, p_user_id,
        COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'Walk-in Customer'),
        COALESCE(BTRIM(p_phone), ''), COALESCE(NULLIF(BTRIM(p_address), ''), 'POS Counter'),
        p_items, v_subtotal, GREATEST(COALESCE(p_shipping, 0), 0), v_total,
        COALESCE(NULLIF(BTRIM(p_status), ''), 'pending'),
        COALESCE(NULLIF(BTRIM(p_order_mode), ''), 'offline'),
        COALESCE(NULLIF(BTRIM(p_order_type), ''), 'pos_sale'),
        GREATEST(COALESCE(p_delivery_charge, 0), 0),
        GREATEST(COALESCE(p_discount_amount, 0), 0),
        GREATEST(COALESCE(p_manual_discount_amount, 0), 0),
        COALESCE(NULLIF(BTRIM(p_manual_discount_type), ''), 'flat'),
        GREATEST(COALESCE(p_manual_discount_value, 0), 0),
        NULLIF(BTRIM(COALESCE(p_coupon_code, '')), ''),
        GREATEST(COALESCE(p_coupon_percentage, 0), 0),
        GREATEST(COALESCE(p_total_gst, 0), 0), GREATEST(COALESCE(p_total_gst, 0), 0),
        COALESCE(p_gst_enabled, FALSE),
        COALESCE(NULLIF(BTRIM(p_payment_method), ''), 'cash'),
        COALESCE(NULLIF(BTRIM(p_payment_method), ''), 'cash'),
        COALESCE(p_split_details, '{}'::JSONB),
        TRUE,
        NOW(), NOW()
      );
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt = 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := GREATEST(COALESCE(NULLIF(v_item ->> 'quantity', '')::NUMERIC, 0), 0);
    v_price := GREATEST(COALESCE(NULLIF(v_item ->> 'base_price', '')::NUMERIC, 0), 0);
    v_line_total := GREATEST(
      COALESCE(NULLIF(v_item ->> 'line_total', '')::NUMERIC, v_quantity * v_price),
      0
    );
    v_source := COALESCE(NULLIF(v_item ->> 'source', ''), 'catalogue');

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name, name, tamil_name, variant_name,
      quantity, unit, unit_type, base_price, unit_price, line_total, is_manual, source, note
    ) VALUES (
      v_order_id,
      NULLIF(COALESCE(v_item ->> 'product_id', v_item ->> 'id'), '')::BIGINT,
      NULLIF(v_item ->> 'variant_id', '')::UUID,
      COALESCE(NULLIF(v_item ->> 'name', ''), 'Product'),
      COALESCE(NULLIF(v_item ->> 'name', ''), 'Product'),
      NULLIF(v_item ->> 'tamil_name', ''),
      NULLIF(v_item ->> 'variant_name', ''),
      v_quantity,
      COALESCE(NULLIF(v_item ->> 'unit', ''), 'piece'),
      COALESCE(NULLIF(v_item ->> 'unit_type', ''), 'unit'),
      v_price,
      v_price,
      v_line_total,
      v_source = 'manual',
      v_source,
      NULLIF(v_item ->> 'note', '')
    );

    IF COALESCE(v_item ->> 'product_id', v_item ->> 'id', '') ~ '^[0-9]+$' THEN
      SELECT stock_quantity INTO v_current_stock
      FROM public.products
      WHERE id = (COALESCE(v_item ->> 'product_id', v_item ->> 'id'))::BIGINT
      FOR UPDATE;

      IF v_current_stock IS NOT NULL THEN
        IF v_current_stock < v_quantity THEN
          RAISE EXCEPTION 'Insufficient stock for product "%" (ID: %): requested %, available %',
            COALESCE(v_item ->> 'name', 'Product'), COALESCE(v_item ->> 'product_id', v_item ->> 'id'), v_quantity, v_current_stock;
        END IF;

        UPDATE public.products
        SET stock_quantity = stock_quantity - v_quantity,
            stock = GREATEST(FLOOR(stock_quantity - v_quantity), 0)::INTEGER,
            updated_at = NOW()
        WHERE id = (COALESCE(v_item ->> 'product_id', v_item ->> 'id'))::BIGINT;

        INSERT INTO public.inventory_logs (
          product_id, old_quantity, new_quantity, adjustment, reason, reference_id, created_by
        ) VALUES (
          (COALESCE(v_item ->> 'product_id', v_item ->> 'id'))::BIGINT,
          v_current_stock,
          v_current_stock - v_quantity,
          -v_quantity,
          'sale',
          v_order_id::TEXT,
          p_user_id
        );
      END IF;
    END IF;

    IF NULLIF(v_item ->> 'variant_id', '') IS NOT NULL THEN
      SELECT stock INTO v_current_variant_stock
      FROM public.product_variants
      WHERE id = (v_item ->> 'variant_id')::UUID
      FOR UPDATE;

      IF v_current_variant_stock IS NOT NULL THEN
        IF v_current_variant_stock < v_quantity THEN
          RAISE EXCEPTION 'Insufficient stock for variant "%": requested %, available %',
            COALESCE(v_item ->> 'variant_name', 'Variant'), v_quantity, v_current_variant_stock;
        END IF;

        UPDATE public.product_variants
        SET stock = stock - v_quantity,
            updated_at = NOW()
        WHERE id = (v_item ->> 'variant_id')::UUID;
      END IF;
    END IF;
  END LOOP;

  IF NULLIF(BTRIM(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
    UPDATE public.coupons
    SET usage_count = usage_count + 1
    WHERE UPPER(BTRIM(code)) = UPPER(BTRIM(p_coupon_code))
      AND is_active
      AND (usage_limit IS NULL OR usage_count < usage_limit);
  END IF;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'invoiceNo', v_invoice_no,
    'createdAt', NOW()
  );
END;
$$;

-- Legacy fallback RPC for order creation
CREATE OR REPLACE FUNCTION public.create_order_without_stock(
  p_address TEXT,
  p_coupon_code TEXT,
  p_coupon_percentage NUMERIC,
  p_customer_name TEXT,
  p_delivery_charge NUMERIC,
  p_discount_amount NUMERIC,
  p_items JSONB,
  p_manual_discount_amount NUMERIC,
  p_manual_discount_type TEXT,
  p_manual_discount_value NUMERIC,
  p_order_mode TEXT,
  p_order_type TEXT,
  p_phone TEXT,
  p_shipping NUMERIC,
  p_status TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.create_order_with_stock(
    p_customer_name, p_phone, p_address, p_items, p_shipping, p_status,
    p_order_mode, p_order_type, p_delivery_charge, p_discount_amount,
    p_manual_discount_amount, p_manual_discount_type, p_manual_discount_value,
    p_coupon_code, p_coupon_percentage, 0, FALSE, 'cash', '{}'::JSONB,
    p_user_id
  );
END;
$$;

-- Public Invoice Lookup by Invoice Number
CREATE OR REPLACE FUNCTION public.get_public_invoice_by_number(p_invoice_no TEXT)
RETURNS SETOF public.orders
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.orders WHERE invoice_no = NULLIF(BTRIM(p_invoice_no), '') LIMIT 1;
$$;

-- Create Advance Order RPC
CREATE OR REPLACE FUNCTION public.create_advance_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_product_name text,
  p_category text,
  p_description text,
  p_total_amount numeric,
  p_deposit_amount numeric,
  p_expected_delivery_date date,
  p_remarks text,
  p_payment_method text,
  p_created_by_name text,
  p_products jsonb default '[]'::jsonb,
  p_user_id UUID DEFAULT NULL
)
RETURNS public.advance_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.advance_orders;
  v_now timestamptz := now();
  v_deposit_id text;
BEGIN
  IF trim(coalesce(p_customer_name,'')) = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF trim(coalesce(p_phone,'')) = '' THEN RAISE EXCEPTION 'Phone number is required'; END IF;
  IF trim(coalesce(p_product_name,'')) = '' THEN RAISE EXCEPTION 'Product name is required'; END IF;
  IF coalesce(p_total_amount,0) <= 0 THEN RAISE EXCEPTION 'Total amount must be greater than zero'; END IF;
  IF coalesce(p_deposit_amount,0) <= 0 OR p_deposit_amount >= p_total_amount THEN
    RAISE EXCEPTION 'Deposit must be greater than zero and less than the total amount';
  END IF;

  v_deposit_id := 'DEP-' || to_char(v_now at time zone 'Asia/Kolkata','YYYYMMDD') || '-' || lpad(nextval('public.deposit_number_seq')::text,4,'0');

  INSERT INTO public.advance_orders (
    deposit_id, customer_name, phone, address, product_name, products, category, description,
    total_amount, deposit_amount, expected_delivery_date, remarks, created_by, created_by_name, created_at, updated_at
  ) VALUES (
    v_deposit_id, trim(p_customer_name), trim(p_phone), trim(coalesce(p_address,'')),
    trim(p_product_name),
    CASE WHEN jsonb_typeof(coalesce(p_products,'[]'::jsonb))='array' THEN coalesce(p_products,'[]'::jsonb) ELSE '[]'::jsonb END,
    trim(coalesce(p_category,'')), trim(coalesce(p_description,'')), round(p_total_amount,2), round(p_deposit_amount,2),
    p_expected_delivery_date, trim(coalesce(p_remarks,'')), p_user_id, trim(coalesce(p_created_by_name,'')), v_now, v_now
  ) RETURNING * INTO v_order;

  INSERT INTO public.advance_order_payments (
    advance_order_id, payment_type, amount, payment_method, remarks, received_by, received_at
  ) VALUES (
    v_order.id, 'deposit', v_order.deposit_amount, lower(p_payment_method), coalesce(p_remarks,''), p_user_id, v_now
  );

  INSERT INTO public.advance_order_timeline (advance_order_id, event_type, label, created_by, created_at)
  VALUES
    (v_order.id, 'created', 'Created', p_user_id, v_now),
    (v_order.id, 'deposit_received', 'Deposit Received', p_user_id, v_now);

  RETURN v_order;
END;
$$;

-- Update Advance Order Status RPC
CREATE OR REPLACE FUNCTION public.update_advance_order_status(
  p_order_id uuid,
  p_status text,
  p_remarks text DEFAULT '',
  p_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.advance_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.advance_orders;
BEGIN
  SELECT * INTO v_order FROM public.advance_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advance order % not found', p_order_id;
  END IF;

  UPDATE public.advance_orders SET
    status = p_status,
    remarks = CASE WHEN trim(coalesce(p_remarks,'')) = '' THEN remarks ELSE p_remarks END,
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.advance_order_timeline (advance_order_id, event_type, label, remarks, created_by, created_at)
  VALUES (
    p_order_id,
    p_status,
    CASE p_status
      WHEN 'pending_deposit' THEN 'Status: Pending Deposit'
      WHEN 'waiting_final_payment' THEN 'Status: Waiting for Final Payment'
      WHEN 'ready_for_delivery' THEN 'Status: Ready to Collect'
      WHEN 'completed' THEN 'Order Completed'
      WHEN 'cancelled' THEN 'Order Cancelled'
      ELSE p_status
    END,
    coalesce(p_remarks, ''),
    p_user_id,
    now()
  );

  RETURN QUERY SELECT * FROM public.advance_orders WHERE id = p_order_id;
END;
$$;

-- Add Custom Event to Advance Order Timeline RPC
CREATE OR REPLACE FUNCTION public.add_advance_order_event(
  p_order_id uuid,
  p_event_type text,
  p_label text,
  p_remarks text DEFAULT '',
  p_user_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.advance_order_timeline (advance_order_id, event_type, label, remarks, created_by, created_at)
  VALUES (p_order_id, p_event_type, p_label, coalesce(p_remarks,''), p_user_id, now());
END;
$$;

-- Complete Advance Order (Version 2) RPC
CREATE OR REPLACE FUNCTION public.complete_advance_order_v2(
  p_order_id uuid,
  p_payment_method text,
  p_final_amount numeric,
  p_coupon_code text DEFAULT NULL,
  p_coupon_percentage numeric DEFAULT 0,
  p_manual_discount numeric DEFAULT 0,
  p_remarks text DEFAULT '',
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(order_id uuid, invoice_no text, completed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advance public.advance_orders;
  v_order_id uuid := gen_random_uuid();
  v_invoice text;
  v_now timestamptz := now();
  v_items jsonb;
  v_item jsonb;
  v_total_discount numeric := 0;
BEGIN
  SELECT * INTO v_advance FROM public.advance_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advance order not found';
  END IF;
  IF v_advance.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled order cannot be completed';
  END IF;
  IF v_advance.completed_order_id IS NOT NULL OR v_advance.invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice already generated for this order';
  END IF;

  v_total_discount := p_manual_discount + (v_advance.remaining_balance - p_manual_discount - p_final_amount);
  IF v_total_discount < 0 THEN
    v_total_discount := 0;
  END IF;

  v_invoice := public.get_next_invoice_no();

  v_items := CASE
    WHEN jsonb_typeof(v_advance.products) = 'array' AND jsonb_array_length(v_advance.products) > 0
      THEN v_advance.products
    ELSE jsonb_build_array(
      jsonb_build_object(
        'name', v_advance.product_name,
        'category', v_advance.category,
        'description', v_advance.description,
        'quantity', 1,
        'base_price', v_advance.total_amount,
        'line_total', v_advance.total_amount,
        'unit', 'piece',
        'unit_type', 'unit',
        'source', 'advance_order'
      )
    )
  END;

  INSERT INTO public.orders (
    id, invoice_no, customer_name, phone, address, user_id,
    items, subtotal, total, status, order_mode, order_type,
    shipping, delivery_charge, discount_amount, manual_discount_amount,
    coupon_code, coupon_percentage, manual_discount_type, manual_discount_value,
    payment_mode, payment_method, stock_deducted, created_at, updated_at
  ) VALUES (
    v_order_id, v_invoice,
    v_advance.customer_name, v_advance.phone, v_advance.address, p_user_id,
    v_items, v_advance.total_amount, greatest(0, v_advance.total_amount - v_total_discount),
    'completed', 'offline', 'advance_order',
    0, 0, v_total_discount, p_manual_discount,
    p_coupon_code, p_coupon_percentage, 'flat', p_manual_discount,
    lower(p_payment_method), lower(p_payment_method), FALSE,
    v_now, v_now
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO public.order_items (
      order_id, product_name, name, quantity, unit, unit_type,
      base_price, line_total, is_manual
    ) VALUES (
      v_order_id,
      coalesce(nullif(trim(v_item->>'name'), ''), 'Product'),
      coalesce(nullif(trim(v_item->>'name'), ''), 'Product'),
      greatest(coalesce((v_item->>'quantity')::numeric, 1), 0),
      coalesce(nullif(v_item->>'unit', ''), 'piece'),
      coalesce(nullif(v_item->>'unit_type', ''), 'unit'),
      greatest(coalesce((v_item->>'base_price')::numeric, 0), 0),
      greatest(coalesce((v_item->>'line_total')::numeric, 0), 0),
      false
    );
  END LOOP;

  INSERT INTO public.advance_order_payments (
    advance_order_id, payment_type, amount, payment_method, remarks, received_by, received_at
  ) VALUES (
    p_order_id, 'remaining', p_final_amount,
    lower(p_payment_method), coalesce(p_remarks, ''), p_user_id, v_now
  );

  UPDATE public.advance_orders SET
    status = 'completed',
    completed_at = v_now,
    completed_order_id = v_order_id,
    invoice_number = v_invoice,
    final_payment_method = lower(p_payment_method),
    remarks = CASE WHEN trim(coalesce(p_remarks, '')) = '' THEN remarks ELSE p_remarks END,
    updated_at = v_now
  WHERE id = p_order_id;

  INSERT INTO public.advance_order_timeline (
    advance_order_id, event_type, label, remarks, created_by, created_at
  ) VALUES
    (p_order_id, 'remaining_payment_received', 'Remaining Payment Received', coalesce(p_remarks, ''), p_user_id, v_now),
    (p_order_id, 'invoice_generated', 'Invoice Generated', v_invoice, p_user_id, v_now);

  RETURN QUERY SELECT v_order_id, v_invoice, v_now;
END;
$$;

-- Complete Advance Order (Version 1 Legacy) RPC
CREATE OR REPLACE FUNCTION public.complete_advance_order(
  p_order_id uuid,
  p_payment_method text,
  p_remarks text DEFAULT '',
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(order_id uuid, invoice_no text, completed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric;
BEGIN
  SELECT remaining_balance INTO v_remaining FROM public.advance_orders WHERE id = p_order_id;
  RETURN QUERY SELECT * FROM public.complete_advance_order_v2(
    p_order_id, p_payment_method, COALESCE(v_remaining, 0), NULL, 0, 0, p_remarks, p_user_id
  );
END;
$$;

-- Trigger to deduct inventory stock on order status transitions to 'completed'
-- Skips orders where stock was already deducted inline (e.g., pos_sale created via create_order_with_stock)
CREATE OR REPLACE FUNCTION public.handle_order_inventory_deduction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  current_stock NUMERIC(12,3);
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    IF COALESCE(NEW.stock_deducted, FALSE) = TRUE THEN
      -- Stock was already deducted at order creation; skip to prevent double deduction
      RETURN NEW;
    END IF;

    FOR item IN SELECT * FROM public.order_items WHERE order_id = NEW.id LOOP
      IF item.product_id IS NOT NULL THEN
        SELECT stock_quantity INTO current_stock FROM public.products WHERE id = item.product_id FOR UPDATE;
        IF current_stock IS NOT NULL THEN
          IF current_stock < item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product ID %: requested %, available %',
              item.product_id, item.quantity, current_stock;
          END IF;

          UPDATE public.products 
          SET stock_quantity = stock_quantity - item.quantity,
              stock = GREATEST(FLOOR(stock_quantity - item.quantity), 0)::INTEGER,
              updated_at = NOW()
          WHERE id = item.product_id;
          
          INSERT INTO public.inventory_logs (
            product_id, old_quantity, new_quantity, adjustment, reason, reference_id, created_by
          )
          VALUES (
            item.product_id, 
            current_stock, 
            current_stock - item.quantity, 
            -item.quantity, 
            'sale', 
            NEW.id::text,
            NEW.user_id
          );
        END IF;
      END IF;
    END LOOP;

    NEW.stock_deducted = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_order_inventory_deduction ON public.orders;
CREATE TRIGGER trigger_order_inventory_deduction
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_inventory_deduction();

-- ============================================================================
-- 25. INITIAL CATALOG SEED DATA
-- ============================================================================
-- Product and category catalog starts empty for SELVAKKODI AGRO SERVICES.
-- Categories and products are created dynamically through the Admin UI.

