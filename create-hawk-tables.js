/**
 * ═══════════════════════════════════════════════════════════════
 * HAWK — Predictive Deal Velocity Engine
 * Database Migration Script
 * ═══════════════════════════════════════════════════════════════
 * 
 * Creates all HAWK tables on Zenith OS RDS.
 * Run: node create-hawk-tables.js
 * 
 * Main Street Group Technology Division
 * Christ is King
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    console.log('');
    console.log('🦅 HAWK — Predictive Deal Velocity Engine');
    console.log('═══════════════════════════════════════════');
    console.log('Creating database tables...');
    console.log('');

    // ── 1. Property Scores (Core) ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_property_scores (
            id SERIAL PRIMARY KEY,
            property_id INTEGER,
            parcel_id VARCHAR(50),
            county VARCHAR(50) NOT NULL,
            sector VARCHAR(50),
            property_address TEXT,
            property_city VARCHAR(100),
            owner_name TEXT,
            owner_entity VARCHAR(255),
            
            -- Scores
            tps_total DECIMAL(5,2) DEFAULT 0,
            tps_property DECIMAL(5,2) DEFAULT 0,
            tps_market DECIMAL(5,2) DEFAULT 0,
            tps_macro DECIMAL(5,2) DEFAULT 0,
            
            -- Ranking
            velocity_rank INTEGER,
            predicted_dom INTEGER,
            confidence DECIMAL(5,2) DEFAULT 0,
            
            -- Signal detail
            signal_flags JSONB DEFAULT '[]',
            active_signals INTEGER DEFAULT 0,
            highest_signal VARCHAR(100),
            
            -- History
            score_history JSONB DEFAULT '[]',
            previous_tps DECIMAL(5,2),
            tps_change_7d DECIMAL(5,2) DEFAULT 0,
            tps_change_30d DECIMAL(5,2) DEFAULT 0,
            
            -- Status
            status VARCHAR(30) DEFAULT 'active',
            broker_assigned INTEGER,
            crm_lead_id INTEGER,
            last_scored_at TIMESTAMP,
            first_flagged_at TIMESTAMP,
            
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_scores_county ON hawk_property_scores(county);
        CREATE INDEX IF NOT EXISTS idx_hawk_scores_sector ON hawk_property_scores(sector);
        CREATE INDEX IF NOT EXISTS idx_hawk_scores_tps ON hawk_property_scores(tps_total DESC);
        CREATE INDEX IF NOT EXISTS idx_hawk_scores_parcel ON hawk_property_scores(parcel_id);
        CREATE INDEX IF NOT EXISTS idx_hawk_scores_status ON hawk_property_scores(status);
        CREATE INDEX IF NOT EXISTS idx_hawk_scores_city ON hawk_property_scores(property_city);
    `);
    console.log('  ✅ hawk_property_scores');

    // ── 2. Deed Transfers ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_deed_transfers (
            id SERIAL PRIMARY KEY,
            county VARCHAR(50) NOT NULL,
            instrument_number VARCHAR(50),
            recording_date DATE,
            document_type VARCHAR(100),
            grantor TEXT,
            grantee TEXT,
            parcel_id VARCHAR(50),
            property_address TEXT,
            property_city VARCHAR(100),
            consideration DECIMAL(14,2),
            doc_stamps DECIMAL(10,2),
            calculated_price DECIMAL(14,2),
            legal_description TEXT,
            is_commercial BOOLEAN DEFAULT false,
            raw_data JSONB,
            
            created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_deeds_county ON hawk_deed_transfers(county);
        CREATE INDEX IF NOT EXISTS idx_hawk_deeds_parcel ON hawk_deed_transfers(parcel_id);
        CREATE INDEX IF NOT EXISTS idx_hawk_deeds_date ON hawk_deed_transfers(recording_date DESC);
        CREATE INDEX IF NOT EXISTS idx_hawk_deeds_grantor ON hawk_deed_transfers(grantor);
        CREATE INDEX IF NOT EXISTS idx_hawk_deeds_grantee ON hawk_deed_transfers(grantee);
        CREATE INDEX IF NOT EXISTS idx_hawk_deeds_commercial ON hawk_deed_transfers(is_commercial);
    `);
    console.log('  ✅ hawk_deed_transfers');

    // ── 3. Lis Pendens (Pre-Foreclosure) ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_lis_pendens (
            id SERIAL PRIMARY KEY,
            county VARCHAR(50) NOT NULL,
            case_number VARCHAR(50),
            filing_date DATE,
            plaintiff TEXT,
            defendant TEXT,
            parcel_id VARCHAR(50),
            property_address TEXT,
            property_city VARCHAR(100),
            loan_amount DECIMAL(14,2),
            status VARCHAR(30) DEFAULT 'active',
            status_date DATE,
            is_commercial BOOLEAN DEFAULT false,
            raw_data JSONB,
            
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_lis_county ON hawk_lis_pendens(county);
        CREATE INDEX IF NOT EXISTS idx_hawk_lis_parcel ON hawk_lis_pendens(parcel_id);
        CREATE INDEX IF NOT EXISTS idx_hawk_lis_date ON hawk_lis_pendens(filing_date DESC);
        CREATE INDEX IF NOT EXISTS idx_hawk_lis_status ON hawk_lis_pendens(status);
        CREATE INDEX IF NOT EXISTS idx_hawk_lis_commercial ON hawk_lis_pendens(is_commercial);
    `);
    console.log('  ✅ hawk_lis_pendens');

    // ── 4. Building Permits ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_building_permits (
            id SERIAL PRIMARY KEY,
            county VARCHAR(50) NOT NULL,
            permit_number VARCHAR(50),
            permit_type VARCHAR(100),
            issue_date DATE,
            parcel_id VARCHAR(50),
            property_address TEXT,
            property_city VARCHAR(100),
            estimated_value DECIMAL(14,2),
            contractor VARCHAR(255),
            description TEXT,
            status VARCHAR(30) DEFAULT 'issued',
            is_commercial BOOLEAN DEFAULT false,
            raw_data JSONB,
            
            created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_permits_county ON hawk_building_permits(county);
        CREATE INDEX IF NOT EXISTS idx_hawk_permits_parcel ON hawk_building_permits(parcel_id);
        CREATE INDEX IF NOT EXISTS idx_hawk_permits_date ON hawk_building_permits(issue_date DESC);
        CREATE INDEX IF NOT EXISTS idx_hawk_permits_type ON hawk_building_permits(permit_type);
        CREATE INDEX IF NOT EXISTS idx_hawk_permits_commercial ON hawk_building_permits(is_commercial);
    `);
    console.log('  ✅ hawk_building_permits');

    // ── 5. CMBS Loans (SEC EDGAR) ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_cmbs_loans (
            id SERIAL PRIMARY KEY,
            sec_filing_id VARCHAR(100),
            deal_name VARCHAR(255),
            property_name VARCHAR(255),
            property_address TEXT,
            city VARCHAR(100),
            state VARCHAR(10) DEFAULT 'FL',
            county VARCHAR(50),
            property_type VARCHAR(50),
            
            -- Loan details
            loan_amount DECIMAL(14,2),
            current_balance DECIMAL(14,2),
            interest_rate DECIMAL(5,3),
            maturity_date DATE,
            origination_date DATE,
            
            -- Risk metrics
            ltv_ratio DECIMAL(5,2),
            current_ltv DECIMAL(5,2),
            dscr DECIMAL(5,2),
            occupancy_at_origination DECIMAL(5,2),
            current_occupancy DECIMAL(5,2),
            noi DECIMAL(14,2),
            
            -- Status flags
            special_servicing BOOLEAN DEFAULT false,
            watchlist BOOLEAN DEFAULT false,
            delinquency_status VARCHAR(50),
            months_to_maturity INTEGER,
            
            -- Cross-reference
            parcel_id VARCHAR(50),
            matched_property_id INTEGER,
            
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_cmbs_county ON hawk_cmbs_loans(county);
        CREATE INDEX IF NOT EXISTS idx_hawk_cmbs_maturity ON hawk_cmbs_loans(maturity_date);
        CREATE INDEX IF NOT EXISTS idx_hawk_cmbs_special ON hawk_cmbs_loans(special_servicing);
        CREATE INDEX IF NOT EXISTS idx_hawk_cmbs_watchlist ON hawk_cmbs_loans(watchlist);
        CREATE INDEX IF NOT EXISTS idx_hawk_cmbs_parcel ON hawk_cmbs_loans(parcel_id);
        CREATE INDEX IF NOT EXISTS idx_hawk_cmbs_deal ON hawk_cmbs_loans(deal_name);
    `);
    console.log('  ✅ hawk_cmbs_loans');

    // ── 6. IRS Migration Data ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_migration_data (
            id SERIAL PRIMARY KEY,
            tax_year INTEGER NOT NULL,
            origin_state_fips VARCHAR(2),
            origin_state_name VARCHAR(50),
            origin_county_fips VARCHAR(3),
            origin_county_name VARCHAR(100),
            dest_state_fips VARCHAR(2),
            dest_state_name VARCHAR(50),
            dest_county_fips VARCHAR(3),
            dest_county_name VARCHAR(100),
            
            -- Migration metrics
            returns INTEGER,
            exemptions INTEGER,
            agi DECIMAL(14,2),
            avg_agi_per_return DECIMAL(12,2),
            
            -- Direction (inflow/outflow relative to SWFL)
            direction VARCHAR(10),
            
            created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_migration_year ON hawk_migration_data(tax_year);
        CREATE INDEX IF NOT EXISTS idx_hawk_migration_dest ON hawk_migration_data(dest_county_name);
        CREATE INDEX IF NOT EXISTS idx_hawk_migration_origin ON hawk_migration_data(origin_state_name);
        CREATE INDEX IF NOT EXISTS idx_hawk_migration_direction ON hawk_migration_data(direction);
    `);
    console.log('  ✅ hawk_migration_data');

    // ── 7. SBA Loans ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_sba_loans (
            id SERIAL PRIMARY KEY,
            program VARCHAR(20),
            borrower_name VARCHAR(255),
            borrower_address TEXT,
            borrower_city VARCHAR(100),
            borrower_state VARCHAR(10),
            borrower_zip VARCHAR(10),
            county VARCHAR(50),
            naics_code VARCHAR(10),
            naics_description VARCHAR(255),
            approval_amount DECIMAL(14,2),
            approval_date DATE,
            lender_name VARCHAR(255),
            jobs_supported INTEGER,
            
            created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_sba_county ON hawk_sba_loans(county);
        CREATE INDEX IF NOT EXISTS idx_hawk_sba_zip ON hawk_sba_loans(borrower_zip);
        CREATE INDEX IF NOT EXISTS idx_hawk_sba_date ON hawk_sba_loans(approval_date DESC);
        CREATE INDEX IF NOT EXISTS idx_hawk_sba_naics ON hawk_sba_loans(naics_code);
        CREATE INDEX IF NOT EXISTS idx_hawk_sba_program ON hawk_sba_loans(program);
    `);
    console.log('  ✅ hawk_sba_loans');

    // ── 8. USPS Vacancy Data ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_usps_vacancy (
            id SERIAL PRIMARY KEY,
            quarter VARCHAR(10),
            year INTEGER,
            state VARCHAR(2) DEFAULT 'FL',
            county VARCHAR(50),
            census_tract VARCHAR(20),
            zip_code VARCHAR(10),
            
            -- Vacancy counts
            total_addresses INTEGER,
            residential_occupied INTEGER,
            residential_vacant INTEGER,
            business_occupied INTEGER,
            business_vacant INTEGER,
            no_stat INTEGER,
            
            -- Calculated
            business_vacancy_rate DECIMAL(5,2),
            residential_vacancy_rate DECIMAL(5,2),
            
            created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_usps_county ON hawk_usps_vacancy(county);
        CREATE INDEX IF NOT EXISTS idx_hawk_usps_zip ON hawk_usps_vacancy(zip_code);
        CREATE INDEX IF NOT EXISTS idx_hawk_usps_quarter ON hawk_usps_vacancy(year, quarter);
        CREATE INDEX IF NOT EXISTS idx_hawk_usps_tract ON hawk_usps_vacancy(census_tract);
    `);
    console.log('  ✅ hawk_usps_vacancy');

    // ── 9. FDIC Bank Branches ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_fdic_branches (
            id SERIAL PRIMARY KEY,
            institution_name VARCHAR(255),
            branch_name VARCHAR(255),
            branch_address TEXT,
            city VARCHAR(100),
            state VARCHAR(10) DEFAULT 'FL',
            county VARCHAR(50),
            zip_code VARCHAR(10),
            
            established_date DATE,
            acquired_date DATE,
            closed_date DATE,
            
            is_active BOOLEAN DEFAULT true,
            branch_type VARCHAR(50),
            fdic_cert VARCHAR(20),
            
            created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_fdic_county ON hawk_fdic_branches(county);
        CREATE INDEX IF NOT EXISTS idx_hawk_fdic_active ON hawk_fdic_branches(is_active);
        CREATE INDEX IF NOT EXISTS idx_hawk_fdic_city ON hawk_fdic_branches(city);
    `);
    console.log('  ✅ hawk_fdic_branches');

    // ── 10. UCC Filings ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_ucc_filings (
            id SERIAL PRIMARY KEY,
            filing_number VARCHAR(50),
            filing_date DATE,
            filing_type VARCHAR(50),
            status VARCHAR(30) DEFAULT 'active',
            lapse_date DATE,
            
            debtor_name TEXT,
            debtor_address TEXT,
            debtor_city VARCHAR(100),
            debtor_state VARCHAR(10),
            
            secured_party TEXT,
            secured_party_address TEXT,
            
            collateral_description TEXT,
            county VARCHAR(50),
            parcel_id VARCHAR(50),
            
            created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_ucc_debtor ON hawk_ucc_filings(debtor_name);
        CREATE INDEX IF NOT EXISTS idx_hawk_ucc_county ON hawk_ucc_filings(county);
        CREATE INDEX IF NOT EXISTS idx_hawk_ucc_date ON hawk_ucc_filings(filing_date DESC);
        CREATE INDEX IF NOT EXISTS idx_hawk_ucc_status ON hawk_ucc_filings(status);
        CREATE INDEX IF NOT EXISTS idx_hawk_ucc_parcel ON hawk_ucc_filings(parcel_id);
    `);
    console.log('  ✅ hawk_ucc_filings');

    // ── 11. Macro Signals (News/Policy/Web) ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_macro_signals (
            id SERIAL PRIMARY KEY,
            signal_type VARCHAR(50) NOT NULL,
            signal_name VARCHAR(255),
            description TEXT,
            
            -- Scope
            county VARCHAR(50),
            sector VARCHAR(50),
            region VARCHAR(50),
            
            -- Impact
            impact_score DECIMAL(5,2),
            direction VARCHAR(10),
            
            -- Source
            source_url TEXT,
            source_name VARCHAR(255),
            published_date DATE,
            
            -- Status
            is_active BOOLEAN DEFAULT true,
            expires_at DATE,
            
            created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_hawk_macro_type ON hawk_macro_signals(signal_type);
        CREATE INDEX IF NOT EXISTS idx_hawk_macro_county ON hawk_macro_signals(county);
        CREATE INDEX IF NOT EXISTS idx_hawk_macro_active ON hawk_macro_signals(is_active);
    `);
    console.log('  ✅ hawk_macro_signals');

    // ── 12. Scoring Audit Log ──
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hawk_score_log (
            id SERIAL PRIMARY KEY,
            run_date TIMESTAMP DEFAULT NOW(),
            properties_scored INTEGER,
            high_velocity_count INTEGER,
            avg_tps DECIMAL(5,2),
            new_flags INTEGER,
            removed_flags INTEGER,
            data_sources_used JSONB DEFAULT '[]',
            run_duration_ms INTEGER,
            notes TEXT
        );
    `);
    console.log('  ✅ hawk_score_log');

    // ── Summary ──
    const tables = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name LIKE 'hawk_%'
        ORDER BY table_name
    `);

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('🦅 HAWK tables created successfully!');
    console.log(`   📊 ${tables.rows.length} tables deployed`);
    console.log('   Tables:');
    tables.rows.forEach(r => console.log(`     - ${r.table_name}`));
    console.log('');
    console.log('   Ready for data ingestion.');
    console.log('   Christ is King 👑');
    console.log('═══════════════════════════════════════════');
    console.log('');

    await pool.end();
}

migrate().catch(err => {
    console.error('Migration error:', err);
    pool.end();
});
