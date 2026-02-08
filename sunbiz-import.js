/**
 * SUNBIZ ? DANIMAL LEADS IMPORT
 * 
 * Reads from local SQLite sunbiz.db and imports to PostgreSQL danimal_leads
 * 
 * Run: node sunbiz-import.js
 */

const Database = require('better-sqlite3');
const { Pool } = require('pg');
require('dotenv').config();

// Configuration
const SUNBIZ_DB = 'C:\\Users\\17242\\msg-corporate-os\\danimal-data\\data\\sunbiz.db';
const BATCH_SIZE = 1000;
const ACTIVE_ONLY = true; // Only import active corporations (3.5M vs 12M)

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function importSunbiz() {
    console.log('+------------------------------------------------------------+');
    console.log('¦     SUNBIZ ? DANIMAL LEADS IMPORT                          ¦');
    console.log('+------------------------------------------------------------+');
    console.log('');
    
    // Open SQLite
    console.log('[1/5] Opening SQLite: ' + SUNBIZ_DB);
    const sqlite = new Database(SUNBIZ_DB, { readonly: true });
    
    // Get count
    const countQuery = ACTIVE_ONLY 
        ? "SELECT COUNT(*) as cnt FROM corporations WHERE status = 'Active'"
        : "SELECT COUNT(*) as cnt FROM corporations";
    const { cnt: totalCount } = sqlite.prepare(countQuery).get();
    console.log('      Found ' + totalCount.toLocaleString() + (ACTIVE_ONLY ? ' active' : '') + ' corporations');
    
    // Test PostgreSQL connection
    console.log('[2/5] Testing PostgreSQL connection...');
    try {
        const testResult = await pool.query("SELECT COUNT(*) as cnt FROM danimal_leads WHERE source = 'sunbiz'");
        console.log('      Connected. Existing Sunbiz records: ' + testResult.rows[0].cnt);
    } catch (err) {
        console.error('      PostgreSQL connection failed:', err.message);
        process.exit(1);
    }
    
    // Add unique constraint if needed
    console.log('[3/5] Ensuring unique constraint exists...');
    try {
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_danimal_leads_source_sourceid 
            ON danimal_leads(source, source_id) WHERE source_id IS NOT NULL
        `);
        console.log('      Unique index ready');
    } catch (err) {
        console.log('      Index note: ' + err.message.substring(0, 50));
    }
    
    // Prepare query
    console.log('[4/5] Starting import...');
    const selectQuery = ACTIVE_ONLY
        ? "SELECT * FROM corporations WHERE status = 'Active' LIMIT ? OFFSET ?"
        : "SELECT * FROM corporations LIMIT ? OFFSET ?";
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    let offset = 0;
    const startTime = Date.now();
    
    while (offset < totalCount) {
        const batch = sqlite.prepare(selectQuery).all(BATCH_SIZE, offset);
        if (batch.length === 0) break;
        
        for (const row of batch) {
            try {
                // Parse address
                let address = {};
                try { address = JSON.parse(row.address || '{}'); } catch(e) {}
                
                // Parse officers to get contact name
                let contactName = null;
                try {
                    const officers = JSON.parse(row.officers || '[]');
                    if (officers.length > 0) {
                        contactName = officers[0].fullName || 
                            ((officers[0].firstName || '') + ' ' + (officers[0].lastName || '')).trim();
                    }
                } catch (e) {}
                
                // Also get registered agent as fallback contact
                if (!contactName && row.registered_agent) {
                    contactName = row.registered_agent;
                }
                
                // Map entity type to industry
                const entityDesc = row.entity_description || row.entity_type || '';
                let industry = 'Business Services';
                if (entityDesc.includes('LLC')) industry = 'LLC';
                else if (entityDesc.includes('Profit') && !entityDesc.includes('Non')) industry = 'Corporation';
                else if (entityDesc.includes('Non')) industry = 'Nonprofit';
                else if (entityDesc.includes('Partnership')) industry = 'Partnership';
                
                await pool.query(`
                    INSERT INTO danimal_leads (
                        source, source_id, business_name, document_number, entity_type,
                        license_status, street_address, city, state, zip_code,
                        contact_name, industry, business_type, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
                    ON CONFLICT DO NOTHING
                `, [
                    'sunbiz',
                    row.doc_number,
                    row.corp_name,
                    row.doc_number,
                    row.entity_type,
                    row.status,
                    address.line1 || null,
                    address.city || null,
                    address.state || 'FL',
                    address.zip || null,
                    contactName ? contactName.substring(0, 200) : null,
                    industry,
                    entityDesc.substring(0, 100)
                ]);
                imported++;
            } catch (rowErr) {
                errors++;
                if (errors <= 5) console.error('      Row error: ' + rowErr.message.substring(0, 80));
            }
        }
        
        offset += BATCH_SIZE;
        
        // Progress update every 25k
        if (imported % 25000 < BATCH_SIZE) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = Math.round(imported / elapsed);
            const eta = Math.round((totalCount - offset) / Math.max(rate, 1) / 60);
            process.stdout.write('\r      Progress: ' + imported.toLocaleString() + ' / ' + totalCount.toLocaleString() + ' (' + rate + '/sec, ETA: ' + eta + ' min)     ');
        }
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    
    console.log('');
    console.log('[5/5] Import complete!');
    console.log('');
    console.log('+------------------------------------------------------------+');
    console.log('¦  Imported: ' + imported.toLocaleString().padStart(12) + ' records                       ¦');
    console.log('¦  Errors:   ' + errors.toLocaleString().padStart(12) + ' records                       ¦');
    console.log('¦  Time:     ' + Math.round(elapsed).toLocaleString().padStart(12) + ' seconds                       ¦');
    console.log('+------------------------------------------------------------+');
    
    sqlite.close();
    await pool.end();
}

importSunbiz().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
