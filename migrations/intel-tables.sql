-- ============================================
-- INTEL MODULE - Database Migration
-- Zenith OS v2.9.0
-- FIXED: VARCHAR foreign keys to match existing users(id) and tenants(id)
-- ============================================

-- Logo Catalog
CREATE TABLE IF NOT EXISTS intel_logos (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'retail',
    logo_url TEXT,
    logo_data TEXT, -- base64 for embedded logos
    width_px INTEGER DEFAULT 200,
    height_px INTEGER DEFAULT 100,
    has_transparency BOOLEAN DEFAULT true,
    brand_color VARCHAR(7) DEFAULT '#333333',
    added_by VARCHAR(255) REFERENCES users(id),
    tenant_id VARCHAR(255) REFERENCES tenants(id),
    is_global BOOLEAN DEFAULT false, -- shared across all tenants
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- INTEL Projects (top-level container)
CREATE TABLE IF NOT EXISTS intel_projects (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) REFERENCES tenants(id) ON DELETE CASCADE,
    created_by VARCHAR(255) REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    property_address TEXT,
    property_city VARCHAR(100),
    property_state VARCHAR(2) DEFAULT 'FL',
    property_zip VARCHAR(10),
    lat DECIMAL(10, 7),
    lng DECIMAL(10, 7),
    property_type VARCHAR(50), -- Office, Retail, Industrial, Land, Mixed-Use
    transaction_type VARCHAR(20), -- lease, sale
    property_size DECIMAL(12, 2),
    size_unit VARCHAR(10) DEFAULT 'SF',
    price DECIMAL(12, 2),
    price_unit VARCHAR(20) DEFAULT 'sf/yr',
    status VARCHAR(20) DEFAULT 'draft', -- draft, in_progress, completed, archived
    lead_id INTEGER, -- optional CRM lead reference
    broker_ids TEXT, -- comma-separated user IDs
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Project Pages (individual flyer pages)
CREATE TABLE IF NOT EXISTS intel_pages (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES intel_projects(id) ON DELETE CASCADE,
    page_type VARCHAR(30) NOT NULL, -- aerial_hero, market_map, site_plan
    page_number INTEGER DEFAULT 1,
    template_id INTEGER,
    canvas_state TEXT, -- Fabric.js JSON serialization
    thumbnail_url TEXT,
    status VARCHAR(20) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Page Templates
CREATE TABLE IF NOT EXISTS intel_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    page_type VARCHAR(30) NOT NULL,
    layout_json TEXT, -- default canvas layout definition
    brand_id VARCHAR(50) DEFAULT 'cre-consultants',
    is_default BOOLEAN DEFAULT false,
    tenant_id VARCHAR(255) REFERENCES tenants(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Exported Files
CREATE TABLE IF NOT EXISTS intel_exports (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES intel_projects(id) ON DELETE CASCADE,
    page_id INTEGER REFERENCES intel_pages(id) ON DELETE SET NULL,
    format VARCHAR(10) NOT NULL, -- pdf, png, jpg
    file_path TEXT,
    file_size INTEGER,
    resolution INTEGER DEFAULT 150, -- DPI
    generated_by VARCHAR(255) REFERENCES users(id),
    download_count INTEGER DEFAULT 0,
    linkedin_shared BOOLEAN DEFAULT false,
    linkedin_post_id VARCHAR(100),
    shared_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Demographic Cache
CREATE TABLE IF NOT EXISTS intel_demographics (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES intel_projects(id) ON DELETE CASCADE,
    lat DECIMAL(10, 7),
    lng DECIMAL(10, 7),
    ring_1mi_json TEXT,
    ring_3mi_json TEXT,
    ring_5mi_json TEXT,
    drive_time_json TEXT,
    source VARCHAR(50) DEFAULT 'manual',
    fetched_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '90 days')
);

-- Traffic Count Cache
CREATE TABLE IF NOT EXISTS intel_traffic (
    id SERIAL PRIMARY KEY,
    road_name VARCHAR(255),
    lat DECIMAL(10, 7),
    lng DECIMAL(10, 7),
    aadt INTEGER, -- Annual Average Daily Traffic
    peak_hour INTEGER,
    truck_pct DECIMAL(5, 2),
    count_year INTEGER,
    source VARCHAR(50) DEFAULT 'FDOT',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Logo-to-Places matching
CREATE TABLE IF NOT EXISTS intel_logo_matches (
    id SERIAL PRIMARY KEY,
    places_name VARCHAR(255),
    logo_id INTEGER REFERENCES intel_logos(id) ON DELETE CASCADE,
    confidence_score DECIMAL(3, 2) DEFAULT 0.00,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed default templates
INSERT INTO intel_templates (name, page_type, layout_json, brand_id, is_default) VALUES
('Aerial Hero - Standard', 'aerial_hero', '{"zones":["header","aerial","callouts","footer"],"size":"letter-portrait"}', 'cre-consultants', true),
('Market Map - Demographics', 'market_map', '{"zones":["header","map","demographics_table","footer"],"size":"letter-portrait"}', 'cre-consultants', true),
('Site Plan - Tenant Mix', 'site_plan', '{"zones":["header","plan","tenant_table","footer"],"size":"letter-portrait"}', 'cre-consultants', true),
('Aerial Hero - Tabloid', 'aerial_hero', '{"zones":["header","aerial","callouts","footer"],"size":"tabloid-landscape"}', 'cre-consultants', false),
('Social Media Card', 'social_card', '{"zones":["image","overlay","branding"],"size":"1200x630"}', 'cre-consultants', false)
ON CONFLICT DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_intel_projects_tenant ON intel_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_intel_projects_status ON intel_projects(status);
CREATE INDEX IF NOT EXISTS idx_intel_pages_project ON intel_pages(project_id);
CREATE INDEX IF NOT EXISTS idx_intel_logos_name ON intel_logos(business_name);
CREATE INDEX IF NOT EXISTS idx_intel_logos_category ON intel_logos(category);
CREATE INDEX IF NOT EXISTS idx_intel_exports_project ON intel_exports(project_id);
