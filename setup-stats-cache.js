// Run this once to create the stats cache table and populate it
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function setupStatsCache() {
    try {
        // Create stats cache table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS danimal_stats_cache (
                id INTEGER PRIMARY KEY DEFAULT 1,
                total_leads BIGINT DEFAULT 0,
                with_phone BIGINT DEFAULT 0,
                with_email BIGINT DEFAULT 0,
                sources_count INTEGER DEFAULT 0,
                dbpr_count BIGINT DEFAULT 0,
                sunbiz_count BIGINT DEFAULT 0,
                doh_count BIGINT DEFAULT 0,
                fdot_count BIGINT DEFAULT 0,
                grade_a_count BIGINT DEFAULT 0,
                synced_count BIGINT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT single_row CHECK (id = 1)
            )
        `);
        console.log('Stats cache table created');

        // Populate with current stats (this will take a moment)
        console.log('Calculating stats (this may take a minute)...');
        
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 END) as with_phone,
                COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as with_email,
                COUNT(DISTINCT source) as sources,
                COUNT(CASE WHEN source = 'dbpr' THEN 1 END) as dbpr,
                COUNT(CASE WHEN source = 'sunbiz' THEN 1 END) as sunbiz,
                COUNT(CASE WHEN source = 'doh' THEN 1 END) as doh,
                COUNT(CASE WHEN source = 'fdot' THEN 1 END) as fdot,
                COUNT(CASE WHEN lead_grade = 'A' THEN 1 END) as grade_a,
                COUNT(CASE WHEN synced_to_crm = true THEN 1 END) as synced
            FROM danimal_leads
        `);

        const s = stats.rows[0];
        
        await pool.query(`
            INSERT INTO danimal_stats_cache (id, total_leads, with_phone, with_email, sources_count, dbpr_count, sunbiz_count, doh_count, fdot_count, grade_a_count, synced_count, updated_at)
            VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            ON CONFLICT (id) DO UPDATE SET
                total_leads = $1, with_phone = $2, with_email = $3, sources_count = $4,
                dbpr_count = $5, sunbiz_count = $6, doh_count = $7, fdot_count = $8,
                grade_a_count = $9, synced_count = $10, updated_at = NOW()
        `, [s.total, s.with_phone, s.with_email, s.sources, s.dbpr, s.sunbiz, s.doh, s.fdot, s.grade_a, s.synced]);

        console.log('Stats cached successfully!');
        console.log(`Total: ${parseInt(s.total).toLocaleString()}`);
        console.log(`With Phone: ${parseInt(s.with_phone).toLocaleString()}`);
        console.log(`With Email: ${parseInt(s.with_email).toLocaleString()}`);
        console.log(`Sources: ${s.sources}`);
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

setupStatsCache();
