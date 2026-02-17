-- ═══════════════════════════════════════════════════════════════════════════
-- ZENITH OS — MARKETING SUITE — DATABASE MIGRATION
-- PostgreSQL RDS Migration for Marketing Module
-- Designed to integrate with existing Zenith OS tenant/listing tables
-- Main Street Group LLC © 2026
-- ═══════════════════════════════════════════════════════════════════════════

-- Run this migration against your existing Zenith OS PostgreSQL RDS instance.
-- Prerequisites: tenants table, listings table, users table must exist.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. BRANDS TABLE
-- White-label brand profiles for multi-tenant marketing materials
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_brands (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  is_default    BOOLEAN DEFAULT FALSE,

  -- Visual identity
  colors        JSONB NOT NULL DEFAULT '{
    "primary": "#1B6B3A",
    "primaryDark": "#145A2E",
    "primaryLight": "#2A8B4A",
    "accent": "#C41E3A",
    "text": "#333333",
    "textLight": "#FFFFFF",
    "textMuted": "#666666",
    "background": "#FFFFFF",
    "backgroundDark": "#4A4A4A",
    "backgroundDarker": "#2D2D2D",
    "border": "#E0E0E0",
    "highlight": "#F7F7F7"
  }'::jsonb,

  fonts         JSONB NOT NULL DEFAULT '{
    "heading": "Montserrat, Arial Black, sans-serif",
    "subheading": "Montserrat, Arial, sans-serif",
    "body": "Open Sans, Helvetica Neue, sans-serif",
    "detail": "Open Sans, Helvetica, sans-serif"
  }'::jsonb,

  logo_url      TEXT,
  logo_svg      TEXT,
  disclaimer    TEXT,
  website_url   VARCHAR(255),

  -- Office locations for footer
  offices       JSONB DEFAULT '[]'::jsonb,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one default brand per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_brands_default
  ON marketing_brands (tenant_id) WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_marketing_brands_tenant
  ON marketing_brands (tenant_id);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. MARKETING TEMPLATES TABLE
-- Handlebars HTML/CSS page templates with zone definitions
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_templates (
  id            VARCHAR(50) PRIMARY KEY,  -- e.g. 'cover-standard', 'details-offering'
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  category      VARCHAR(50) NOT NULL,     -- 'cover', 'content', 'photo', 'map', 'specialty'
  
  -- Template content
  html_template TEXT NOT NULL,            -- Handlebars template source
  css_template  TEXT,                     -- Separate CSS (optional, can be inline)
  
  -- Zone definitions for photo/data placement
  zones         JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Template metadata
  tags          TEXT[] DEFAULT '{}',       -- ['for_sale', 'for_lease', 'industrial', etc.]
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,

  -- Version tracking
  version       INTEGER DEFAULT 1,
  
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════
-- 3. TEMPLATE RULES TABLE
-- Maps listing_type × property_type to template page sequences
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_template_rules (
  id              SERIAL PRIMARY KEY,
  listing_type    VARCHAR(50) NOT NULL,
  property_type   VARCHAR(50),             -- NULL = matches all property types
  template_sequence TEXT[] NOT NULL,        -- Ordered array of template IDs
  priority        INTEGER DEFAULT 0,       -- Higher priority = evaluated first
  is_active       BOOLEAN DEFAULT TRUE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(listing_type, property_type)
);

-- ══════════════════════════════════════════════════════════════════════════
-- 4. MARKETING DRAFTS TABLE
-- The core table — tracks each generated marketing package through its lifecycle
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  listing_id      INTEGER NOT NULL,  -- References existing listings table
  brand_id        UUID REFERENCES marketing_brands(id),

  -- Workflow state machine
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN (
                    'pending',      -- Listing won, awaiting data validation
                    'ready',        -- Data validated, ready to generate
                    'generating',   -- AI composition + rendering in progress
                    'review',       -- Draft complete, awaiting marketing team review
                    'revision',     -- Open in Resonance for editing
                    'approval',     -- Sent to broker for approval
                    'approved',     -- Broker approved, ready for distribution
                    'distributed',  -- Published to channels
                    'failed'        -- Generation failed, can retry
                  )),

  -- Template configuration
  template_sequence TEXT[] NOT NULL DEFAULT '{}',

  -- Generated assets
  pdf_url         TEXT,
  pdf_size_bytes  INTEGER,
  images          JSONB DEFAULT '{}'::jsonb,
  -- Structure: { "web": "url", "social_1x1": "url", "social_9x16": "url", "thumbnail": "url" }

  -- Quality metrics
  quality_score   INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
  quality_report  JSONB DEFAULT '[]'::jsonb,

  -- AI composition data
  ai_model        VARCHAR(100),
  ai_tokens_in    INTEGER DEFAULT 0,
  ai_tokens_out   INTEGER DEFAULT 0,
  ai_content      JSONB DEFAULT '{}'::jsonb,
  -- Structure: { "overview": "...", "tagline": "...", "highlights": [...], "keywords": [...] }

  -- Photo classifications from AI
  photo_classifications JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{ "photo_id": "...", "classification": "exterior", "confidence": 0.95, "zone": "hero_cover" }]

  -- Workflow tracking
  broker_comments TEXT,
  revision_count  INTEGER DEFAULT 0,
  
  -- Distribution tracking
  distribution_channels JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{ "channel": "loopnet", "status": "published", "url": "...", "published_at": "..." }]

  -- Actors
  generated_by    INTEGER,  -- User who triggered generation
  reviewed_by     INTEGER,  -- Marketing team member
  approved_by     INTEGER,  -- Broker who approved

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_at    TIMESTAMPTZ,
  reviewed_at     TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  distributed_at  TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failure_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_marketing_drafts_tenant
  ON marketing_drafts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_marketing_drafts_listing
  ON marketing_drafts (listing_id);

CREATE INDEX IF NOT EXISTS idx_marketing_drafts_status
  ON marketing_drafts (status);

CREATE INDEX IF NOT EXISTS idx_marketing_drafts_tenant_status
  ON marketing_drafts (tenant_id, status);

-- ══════════════════════════════════════════════════════════════════════════
-- 5. MARKETING DRAFT HISTORY TABLE
-- Audit log for all workflow state transitions
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_draft_history (
  id              SERIAL PRIMARY KEY,
  draft_id        UUID NOT NULL REFERENCES marketing_drafts(id) ON DELETE CASCADE,
  
  from_status     VARCHAR(20),
  to_status       VARCHAR(20) NOT NULL,
  
  actor_id        INTEGER,  -- User who triggered the transition
  actor_role      VARCHAR(50),  -- 'system', 'marketing', 'broker', 'admin'
  
  comments        TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_draft_history_draft
  ON marketing_draft_history (draft_id);

-- ══════════════════════════════════════════════════════════════════════════
-- 6. MARKETING PHOTOS TABLE
-- Processed photos linked to drafts with classification metadata
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id        UUID NOT NULL REFERENCES marketing_drafts(id) ON DELETE CASCADE,
  listing_id      INTEGER NOT NULL,

  -- Original upload
  original_url    TEXT NOT NULL,
  original_width  INTEGER,
  original_height INTEGER,
  original_format VARCHAR(10),

  -- AI classification
  classification  VARCHAR(30),
  confidence      DECIMAL(3,2),
  ai_description  TEXT,
  focal_point_x   DECIMAL(4,3),
  focal_point_y   DECIMAL(4,3),

  -- Processed versions
  processed_url   TEXT,
  processed_width INTEGER,
  processed_height INTEGER,
  assigned_zone   VARCHAR(50),
  
  -- Enhancement settings applied
  enhance_settings JSONB DEFAULT '{}'::jsonb,

  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_photos_draft
  ON marketing_photos (draft_id);

CREATE INDEX IF NOT EXISTS idx_marketing_photos_listing
  ON marketing_photos (listing_id);

-- ══════════════════════════════════════════════════════════════════════════
-- 7. SEED DATA — Default Template Rules
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO marketing_template_rules (listing_type, property_type, template_sequence, priority) VALUES
  ('land_sale',     NULL, ARRAY['cover-standard', 'details-offering', 'location-map'], 10),
  ('for_sale',      NULL, ARRAY['cover-standard', 'details-offering', 'location-map'], 10),
  ('investment',    NULL, ARRAY['cover-standard', 'details-offering', 'location-map'], 10),
  ('for_lease',     NULL, ARRAY['cover-standard', 'details-offering', 'location-map'], 10),
  ('sale_or_lease', NULL, ARRAY['cover-standard', 'details-offering', 'location-map'], 10),
  ('build_to_suit', NULL, ARRAY['cover-standard', 'details-offering', 'location-map'], 10),
  ('retail_lease',  NULL, ARRAY['cover-standard', 'details-offering', 'location-map'], 10),
  ('specialty',     NULL, ARRAY['cover-standard', 'details-offering', 'location-map'], 10)
ON CONFLICT (listing_type, property_type) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 8. SEED DATA — CRE Consultants Default Brand
-- ══════════════════════════════════════════════════════════════════════════

-- Note: tenant_id 1 = CRE Consultants in existing Zenith OS
-- Adjust tenant_id to match your actual tenants table

-- INSERT INTO marketing_brands (tenant_id, name, is_default, colors, fonts, disclaimer, website_url, offices)
-- VALUES (
--   1,
--   'CRE Consultants',
--   TRUE,
--   '{"primary":"#1B6B3A","primaryDark":"#145A2E","primaryLight":"#2A8B4A","accent":"#C41E3A","text":"#333333","textLight":"#FFFFFF","textMuted":"#666666","background":"#FFFFFF","backgroundDark":"#4A4A4A","backgroundDarker":"#2D2D2D","border":"#E0E0E0","highlight":"#F7F7F7"}'::jsonb,
--   '{"heading":"Montserrat, Arial Black, sans-serif","subheading":"Montserrat, Arial, sans-serif","body":"Open Sans, Helvetica Neue, sans-serif","detail":"Open Sans, Helvetica, sans-serif"}'::jsonb,
--   'The information contained herein was obtained from sources believed reliable. CRE Consultants makes no guarantees, warranties or representations as to the completeness or accuracy thereof.',
--   'CRECONSULTANTS.COM',
--   '[{"city":"Fort Myers","address":"4524 Gun Club Rd., Suite 203 · Fort Myers, FL 33907","phone":"239.481.3800"},{"city":"Naples","address":"4501 Tamiami Trail N., Suite 300 · Naples, FL 34103","phone":"239.659.1447"}]'::jsonb
-- );

-- ══════════════════════════════════════════════════════════════════════════
-- 9. HELPER FUNCTION — Update timestamp trigger
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_marketing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_marketing_drafts_updated
  BEFORE UPDATE ON marketing_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER trg_marketing_brands_updated
  BEFORE UPDATE ON marketing_brands
  FOR EACH ROW
  EXECUTE FUNCTION update_marketing_updated_at();

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- Tables: marketing_brands, marketing_templates, marketing_template_rules,
--         marketing_drafts, marketing_draft_history, marketing_photos
-- ══════════════════════════════════════════════════════════════════════════
