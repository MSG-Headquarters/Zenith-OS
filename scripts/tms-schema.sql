-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- ZENITH OS: TRANSACTION MANAGEMENT SYSTEM (TMS) SCHEMA
-- CRE Consultants - Full Deal Lifecycle
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- Flow: CRM Lead â†’ Proposal/BOV â†’ Listing Agreement â†’ Opening Package
--       â†’ Marketing/Flyer â†’ Showings/Activity â†’ Deal Closing â†’ Commission

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 1. LISTINGS (core TMS record â€” created when deal is "Won")
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tms_listings (
    id SERIAL PRIMARY KEY,
    org_id INTEGER REFERENCES organizations(id),
    crm_lead_id INTEGER REFERENCES leads(id),          -- Link back to won CRM deal

    -- Property Information (from Opening Package)
    property_name VARCHAR(255),
    property_address VARCHAR(255),
    suite_unit VARCHAR(100),
    city VARCHAR(100),
    state VARCHAR(10) DEFAULT 'FL',
    zip VARCHAR(20),
    county VARCHAR(50),

    -- Property Details
    property_type VARCHAR(50),       -- Office, Retail, Industrial, Land, Multi-Family, Special Purpose
    deal_type VARCHAR(50),           -- Lease, Sale, Sub-Lease
    agreement_type VARCHAR(50),      -- Listing, User Side, Listing/User Side
    total_building_sf NUMERIC(12,2),
    total_land_acres NUMERIC(10,4),
    land_sf NUMERIC(12,2),
    land_dimensions VARCHAR(100),
    year_built INTEGER,
    parcel_ids TEXT,                  -- Could be multiple
    occupancy VARCHAR(50),
    zoning VARCHAR(50),
    re_taxes NUMERIC(12,2),
    managed_by_cre BOOLEAN DEFAULT false,

    -- Owner Information
    owner_name VARCHAR(255),
    owner_company VARCHAR(255),
    owner_phone VARCHAR(50),
    owner_email VARCHAR(255),
    owner_address TEXT,

    -- Agent/Commission
    listing_agent_id INTEGER REFERENCES users(id),
    listing_agent_name VARCHAR(255),
    agent_commission_pct NUMERIC(5,3),  -- e.g., 0.060 = 6%
    referral_name VARCHAR(255),
    referral_commission_pct NUMERIC(5,3),

    -- Dates
    listing_date DATE,
    execution_date DATE,
    expiration_date DATE,

    -- Marketing Info (for flyer generation)
    flyer_heading VARCHAR(500),
    flyer_subheadline VARCHAR(500),
    flyer_location_line VARCHAR(500),
    flyer_description TEXT,
    flyer_highlights JSONB,          -- Array of bullet points [{"num":1,"text":"..."},...]

    -- Optional Marketing Details
    parking_spaces VARCHAR(100),
    overhead_doors INTEGER,
    door_size VARCHAR(50),
    dock_high BOOLEAN,
    truckwell BOOLEAN,
    ceiling_height VARCHAR(50),
    clear_span BOOLEAN,
    power VARCHAR(100),
    future_land_use VARCHAR(100),
    density VARCHAR(100),
    flood_zone VARCHAR(50),
    utilities VARCHAR(255),
    sprinkler_type VARCHAR(100),
    build_to_suit BOOLEAN,
    build_to_suit_psf NUMERIC(10,2),
    additional_features TEXT,

    -- Status & Workflow
    status VARCHAR(50) DEFAULT 'active',  -- active, pending, under_contract, closed, expired, withdrawn
    sign_order_status VARCHAR(50),         -- pending, ordered, installed, removed
    sign_location_lat NUMERIC(10,7),
    sign_location_lng NUMERIC(10,7),
    sign_location_notes TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 2. LISTING UNITS (available suites/spaces within a listing)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tms_listing_units (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES tms_listings(id) ON DELETE CASCADE,
    suite_number VARCHAR(50),
    square_feet NUMERIC(10,2),
    rent_psf NUMERIC(10,2),
    cam_psf NUMERIC(10,2),
    sale_price NUMERIC(14,2),
    price_psf NUMERIC(10,2),
    price_per_acre NUMERIC(12,2),
    currently_occupied BOOLEAN DEFAULT false,
    will_divide BOOLEAN DEFAULT false,
    availability_date DATE,
    availability_status VARCHAR(50),  -- Immediate, Within 30 days, Specific date
    lease_type VARCHAR(50),           -- NNN, Gross, Modified Gross
    lease_term VARCHAR(100),
    lease_escalations VARCHAR(255),
    commission_on_renewal NUMERIC(5,3),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 3. PROPOSALS (generated from CRM before winning)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tms_proposals (
    id SERIAL PRIMARY KEY,
    org_id INTEGER REFERENCES organizations(id),
    crm_lead_id INTEGER REFERENCES leads(id),
    listing_id INTEGER REFERENCES tms_listings(id),  -- Linked after listing created

    -- Proposal Details
    prepared_for_name VARCHAR(255),
    prepared_for_company VARCHAR(255),
    property_name VARCHAR(255),
    property_address VARCHAR(500),

    -- Proposal Content (JSONB for flexible sections)
    proposal_type VARCHAR(50),       -- lease_pm, sale, lease_only, pm_only
    sections JSONB,                  -- [{title, content, order}]
    
    -- Fee Schedule
    direct_commission_pct NUMERIC(5,3),
    cobrokered_cre_pct NUMERIC(5,3),
    cobrokered_other_pct NUMERIC(5,3),
    pm_monthly_fee NUMERIC(10,2),
    pm_fee_description TEXT,
    land_lease_commission TEXT,

    -- Team
    team_members JSONB,              -- [{name, title, phone, email}]

    -- Status
    status VARCHAR(50) DEFAULT 'draft',  -- draft, sent, accepted, declined
    sent_date TIMESTAMP,
    accepted_date TIMESTAMP,
    
    -- Generated document
    document_url VARCHAR(500),
    template_id VARCHAR(50),

    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 4. LISTING AGREEMENTS (lease, sublease, sale agreements)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tms_listing_agreements (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES tms_listings(id) ON DELETE CASCADE,
    proposal_id INTEGER REFERENCES tms_proposals(id),

    agreement_type VARCHAR(50),      -- lease, sublease, sale, pm
    document_url VARCHAR(500),       -- Stored in Vault
    
    -- Key Terms
    term_start DATE,
    term_end DATE,
    asking_price NUMERIC(14,2),
    asking_rent_psf NUMERIC(10,2),
    commission_structure JSONB,      -- Flexible commission tiers

    -- Signatures
    owner_signed BOOLEAN DEFAULT false,
    owner_signed_date TIMESTAMP,
    agent_signed BOOLEAN DEFAULT false,
    agent_signed_date TIMESTAMP,

    -- When owner signs â†’ CRM lead moves to "Won" â†’ Listing activated
    status VARCHAR(50) DEFAULT 'draft',  -- draft, sent, signed, expired, terminated
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 5. SHOWING ACTIVITY (contacts funneled back to CRM)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tms_showings (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES tms_listings(id) ON DELETE CASCADE,
    listing_unit_id INTEGER REFERENCES tms_listing_units(id),
    
    -- Contact (can link to CRM)
    contact_name VARCHAR(255),
    contact_company VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    crm_lead_id INTEGER REFERENCES leads(id),  -- If linked to CRM contact
    
    -- Showing Details
    showing_date TIMESTAMP,
    showing_type VARCHAR(50),        -- in_person, virtual, drive_by
    agent_id INTEGER REFERENCES users(id),
    
    -- Feedback
    interest_level VARCHAR(50),      -- hot, warm, cold, not_interested
    feedback TEXT,
    follow_up_date DATE,
    follow_up_notes TEXT,
    
    -- LOI
    loi_submitted BOOLEAN DEFAULT false,
    loi_date DATE,
    loi_amount NUMERIC(14,2),
    loi_document_url VARCHAR(500),
    
    status VARCHAR(50) DEFAULT 'scheduled',  -- scheduled, completed, cancelled, no_show
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 6. DEAL CLOSINGS (sale or lease execution)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tms_closings (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES tms_listings(id),
    listing_unit_id INTEGER REFERENCES tms_listing_units(id),
    
    -- Transaction Type
    transaction_type VARCHAR(50),    -- sale, lease, sublease, ground_lease
    
    -- Parties
    landlord_seller_name VARCHAR(255),
    landlord_seller_company VARCHAR(255),
    tenant_buyer_name VARCHAR(255),
    tenant_buyer_company VARCHAR(255),
    tenant_buyer_address TEXT,
    tenant_buyer_phone VARCHAR(50),
    tenant_buyer_email VARCHAR(255),
    
    -- Deal Terms
    closing_date DATE,
    sale_price NUMERIC(14,2),
    lease_sf NUMERIC(10,2),
    lease_type VARCHAR(50),          -- NNN, Gross, Modified Gross
    annual_rent_psf NUMERIC(10,2),
    cam_psf NUMERIC(10,2),
    
    -- Lease Schedule (for commission calc)
    lease_schedule JSONB,            -- [{term_start, term_end, months, sf, rent_psf, annual_rent, comm_pct, commission}]
    total_consideration NUMERIC(14,2),
    
    -- Deal Classification
    is_new_lease BOOLEAN DEFAULT true,
    is_renewal BOOLEAN DEFAULT false,
    is_expansion BOOLEAN DEFAULT false,
    property_managed_by_cre BOOLEAN DEFAULT false,
    
    -- Documents
    abstract_attached BOOLEAN DEFAULT false,
    tenant_financials_attached BOOLEAN DEFAULT false,
    cert_insurance_attached BOOLEAN DEFAULT false,
    hud_statement_url VARCHAR(500),
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',  -- pending, closed, cancelled
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 7. COMMISSION VOUCHERS (lease voucher / closing voucher)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tms_commission_vouchers (
    id SERIAL PRIMARY KEY,
    closing_id INTEGER REFERENCES tms_closings(id),
    listing_id INTEGER REFERENCES tms_listings(id),
    
    -- Commission Totals
    gross_commission NUMERIC(14,2),
    special_commission_notes TEXT,
    
    -- Distribution
    distributions JSONB,             -- [{agent_name, agent_id, amount, pct_to_agent, amt_to_agent, amt_to_house}]
    total_to_agents NUMERIC(14,2),
    total_to_house NUMERIC(14,2),
    
    -- Outside Brokers
    outside_brokers JSONB,           -- [{name, company, amount, paid_direct, represented_landlord}]
    
    -- Payment Schedule
    payment_schedule VARCHAR(50),    -- full, half, quarterly, custom
    first_half_amount NUMERIC(14,2),
    second_half_amount NUMERIC(14,2),
    
    -- CRE Consultants Billing
    cre_payable_name VARCHAR(255) DEFAULT 'CRE Consultants',
    cre_address TEXT DEFAULT '12140 Carissa Commerce Ct, Suite 102, Ft. Myers, Florida 33966',
    cre_tax_id VARCHAR(50) DEFAULT '65-0985131',
    
    -- Invoice
    invoice_number VARCHAR(50),
    invoice_date DATE,
    invoice_to_name VARCHAR(255),
    invoice_to_company VARCHAR(255),
    due_terms TEXT DEFAULT 'DUE AND PAYABLE UPON SCHEDULED TERMS',
    
    -- Status
    status VARCHAR(50) DEFAULT 'draft',  -- draft, submitted, partial_paid, paid
    paid_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 8. SIGN ORDERS (property signage management)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tms_sign_orders (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES tms_listings(id) ON DELETE CASCADE,
    
    office_location VARCHAR(50),     -- Naples, Fort Myers
    order_type VARCHAR(50),          -- Installation, Revision, Repair, Removal
    sign_size VARCHAR(50),           -- 2x2, 4x4, Other
    
    agent_name VARCHAR(255),
    property_name VARCHAR(255),
    property_address VARCHAR(255),
    city VARCHAR(100),
    zip VARCHAR(20),
    cross_street VARCHAR(255),
    
    -- Placement
    diagram_url VARCHAR(500),
    placement_notes TEXT,
    sign_lat NUMERIC(10,7),
    sign_lng NUMERIC(10,7),
    
    -- Riders
    riders JSONB,                    -- [{text, size}]
    remove_other_signs BOOLEAN DEFAULT false,
    
    -- Display Options
    display_config JSONB,            -- {support_type, display_options}
    
    status VARCHAR(50) DEFAULT 'pending',  -- pending, ordered, installed, removed
    ordered_date DATE,
    installed_date DATE,
    removed_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 9. LISTING SYNDICATION (CoStar, LoopNet, Crexi tracking)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tms_syndication (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES tms_listings(id) ON DELETE CASCADE,
    listing_unit_id INTEGER REFERENCES tms_listing_units(id),
    
    platform VARCHAR(50),            -- costar, loopnet, crexi, zillow, social_media
    platform_listing_id VARCHAR(255),
    listing_url VARCHAR(500),
    
    posted_date TIMESTAMP,
    updated_date TIMESTAMP,
    removed_date TIMESTAMP,
    
    status VARCHAR(50) DEFAULT 'active',  -- draft, active, paused, removed
    auto_remove_on_close BOOLEAN DEFAULT true,
    
    -- Analytics
    views INTEGER DEFAULT 0,
    inquiries INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10. LISTING ACTIVITY LOG (comprehensive audit trail)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tms_activity_log (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES tms_listings(id) ON DELETE CASCADE,
    
    activity_type VARCHAR(50),       -- showing, inquiry, offer, price_change, status_change, marketing, note
    description TEXT,
    
    -- Optional links
    showing_id INTEGER REFERENCES tms_showings(id),
    closing_id INTEGER REFERENCES tms_closings(id),
    user_id INTEGER REFERENCES users(id),
    
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- INDEXES
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE INDEX IF NOT EXISTS idx_tms_listings_org ON tms_listings(org_id);
CREATE INDEX IF NOT EXISTS idx_tms_listings_status ON tms_listings(status);
CREATE INDEX IF NOT EXISTS idx_tms_listings_agent ON tms_listings(listing_agent_id);
CREATE INDEX IF NOT EXISTS idx_tms_listings_crm ON tms_listings(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_tms_showings_listing ON tms_showings(listing_id);
CREATE INDEX IF NOT EXISTS idx_tms_showings_date ON tms_showings(showing_date);
CREATE INDEX IF NOT EXISTS idx_tms_closings_listing ON tms_closings(listing_id);
CREATE INDEX IF NOT EXISTS idx_tms_proposals_crm ON tms_proposals(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_tms_syndication_listing ON tms_syndication(listing_id);
CREATE INDEX IF NOT EXISTS idx_tms_activity_listing ON tms_activity_log(listing_id);
