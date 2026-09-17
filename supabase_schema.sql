-- Copie e cole este script na aba "SQL Editor" do seu novo projeto do Supabase e clique em "Run".

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  voltage TEXT DEFAULT 'Bivolt',
  description TEXT,
  image_url TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  images_product JSONB DEFAULT '[]'::jsonb,
  images_box JSONB DEFAULT '[]'::jsonb,
  images_accessories JSONB DEFAULT '[]'::jsonb,
  accessories TEXT,
  brand TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS triage_units (
  id TEXT PRIMARY KEY,
  tracking_code TEXT,
  serial_number TEXT,
  order_number TEXT,
  base_product_id TEXT,
  base_product_name TEXT,
  base_product_sku TEXT,
  base_product_voltage TEXT,
  platform TEXT,
  customer_reason TEXT,
  device_status TEXT,
  package_status TEXT,
  accessories_inclusion TEXT,
  destination_sector TEXT,
  notes TEXT,
  photos_product JSONB DEFAULT '[]'::jsonb,
  photos_box JSONB DEFAULT '[]'::jsonb,
  photos_accessories JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  receipt_date TIMESTAMPTZ,
  pending_registration_number TEXT,
  pending_item_id TEXT
);

CREATE TABLE IF NOT EXISTS daily_inflows (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  rma INT DEFAULT 0,
  estoque INT DEFAULT 0,
  openbox INT DEFAULT 0,
  es INT DEFAULT 0,
  total_dia INT DEFAULT 0,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_items (
  id TEXT PRIMARY KEY,
  sku TEXT,
  product_name TEXT,
  voltage TEXT,
  serial_number TEXT,
  tracking_code TEXT,
  order_number TEXT,
  platform TEXT,
  pending_reason TEXT,
  detailed_notes TEXT,
  status TEXT,
  priority TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_by JSONB,
  transferred_to_stock BOOLEAN DEFAULT false,
  transferred_unit_id TEXT,
  destination_sector_suggested TEXT,
  registration_number TEXT
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  platform TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  resolution TEXT,
  status TEXT DEFAULT 'Pendente',
  value NUMERIC,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  user_email TEXT,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'operator',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
