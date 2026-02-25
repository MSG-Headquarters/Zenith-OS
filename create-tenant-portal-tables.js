/**
 * TENANT PORTAL - Database Migration
 * 
 * Adds portal authentication to pm_tenants
 * Creates pm_mitch_minutes and pm_property_updates tables
 * 
 * Run: node create-tenant-portal-tables.js
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ═══════════════════════════════════════════════════════════
        // 1. Add portal auth columns to pm_tenants
        // ═══════════════════════════════════════════════════════════
        console.log('[1/4] Adding portal auth columns to pm_tenants...');
        
        const authColumns = [
            { name: 'portal_email', sql: "ALTER TABLE pm_tenants ADD COLUMN IF NOT EXISTS portal_email VARCHAR(255)" },
            { name: 'portal_password_hash', sql: "ALTER TABLE pm_tenants ADD COLUMN IF NOT EXISTS portal_password_hash VARCHAR(255)" },
            { name: 'portal_enabled', sql: "ALTER TABLE pm_tenants ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT false" },
            { name: 'portal_last_login', sql: "ALTER TABLE pm_tenants ADD COLUMN IF NOT EXISTS portal_last_login TIMESTAMP" },
            { name: 'portal_token', sql: "ALTER TABLE pm_tenants ADD COLUMN IF NOT EXISTS portal_token VARCHAR(255)" },
            { name: 'portal_token_expires', sql: "ALTER TABLE pm_tenants ADD COLUMN IF NOT EXISTS portal_token_expires TIMESTAMP" },
            { name: 'notification_prefs', sql: "ALTER TABLE pm_tenants ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{\"email_maintenance\": true, \"email_updates\": true, \"email_urgent\": true}'::jsonb" }
        ];

        for (const col of authColumns) {
            await client.query(col.sql);
            console.log(`  ✓ ${col.name}`);
        }

        // Default portal_email to contact_email where not set
        await client.query(`
            UPDATE pm_tenants 
            SET portal_email = contact_email 
            WHERE portal_email IS NULL AND contact_email IS NOT NULL
        `);
        console.log('  ✓ portal_email defaulted from contact_email');

        // ═══════════════════════════════════════════════════════════
        // 2. Create pm_mitch_minutes table
        // ═══════════════════════════════════════════════════════════
        console.log('\n[2/4] Creating pm_mitch_minutes table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS pm_mitch_minutes (
                id SERIAL PRIMARY KEY,
                property_id INTEGER REFERENCES pm_properties(id),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                video_url TEXT NOT NULL,
                thumbnail_url TEXT,
                duration_seconds INTEGER,
                published_at TIMESTAMP DEFAULT NOW(),
                created_by INTEGER,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('  ✓ pm_mitch_minutes created');

        // Index for fast property lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_mitch_minutes_property 
            ON pm_mitch_minutes(property_id, published_at DESC) 
            WHERE is_active = true
        `);
        console.log('  ✓ index on property_id + published_at');

        // ═══════════════════════════════════════════════════════════
        // 3. Create pm_property_updates table
        // ═══════════════════════════════════════════════════════════
        console.log('\n[3/4] Creating pm_property_updates table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS pm_property_updates (
                id SERIAL PRIMARY KEY,
                property_id INTEGER REFERENCES pm_properties(id),
                title VARCHAR(255) NOT NULL,
                body TEXT NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT 'general',
                priority VARCHAR(20) NOT NULL DEFAULT 'normal',
                starts_at TIMESTAMP,
                ends_at TIMESTAMP,
                send_email BOOLEAN DEFAULT false,
                created_by INTEGER,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('  ✓ pm_property_updates created');

        // Index for fast property + active lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_property_updates_property 
            ON pm_property_updates(property_id, created_at DESC) 
            WHERE is_active = true
        `);
        console.log('  ✓ index on property_id + created_at');

        // ═══════════════════════════════════════════════════════════
        // 4. Verify
        // ═══════════════════════════════════════════════════════════
        console.log('\n[4/4] Verifying...');
        
        const tenantCols = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'pm_tenants' AND column_name LIKE 'portal_%'
            ORDER BY ordinal_position
        `);
        console.log(`  ✓ pm_tenants portal columns: ${tenantCols.rows.map(r => r.column_name).join(', ')}`);

        const tables = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name IN ('pm_mitch_minutes', 'pm_property_updates')
            ORDER BY table_name
        `);
        console.log(`  ✓ New tables: ${tables.rows.map(r => r.table_name).join(', ')}`);

        const portalReady = await client.query(`
            SELECT COUNT(*) as total,
                   COUNT(portal_email) as has_email
            FROM pm_tenants WHERE tenant_status IN ('Current', 'MTM')
        `);
        console.log(`  ✓ Active tenants: ${portalReady.rows[0].total} (${portalReady.rows[0].has_email} with portal email)`);

        await client.query('COMMIT');
        console.log('\n══════════════════════════════════════');
        console.log('✅ TENANT PORTAL MIGRATION COMPLETE');
        console.log('══════════════════════════════════════');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ Migration failed:', err.message);
        throw err;
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
