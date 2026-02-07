require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function cleanupDuplicates() {
    console.log('Starting duplicate cleanup in batches...');
    
    let totalDeleted = 0;
    let batchNum = 0;
    
    while (true) {
        batchNum++;
        console.log(`Batch ${batchNum}: Finding duplicates...`);
        
        // Find 1000 duplicate IDs at a time
        const dupes = await pool.query(`
            SELECT id FROM danimal_leads d1
            WHERE EXISTS (
                SELECT 1 FROM danimal_leads d2
                WHERE d2.source = d1.source
                AND d2.business_name = d1.business_name
                AND d2.street_address = d1.street_address
                AND d2.city = d1.city
                AND d2.id < d1.id
            )
            LIMIT 1000
        `);
        
        if (dupes.rows.length === 0) {
            console.log('No more duplicates found!');
            break;
        }
        
        const ids = dupes.rows.map(r => r.id);
        
        const result = await pool.query(
            'DELETE FROM danimal_leads WHERE id = ANY($1)',
            [ids]
        );
        
        totalDeleted += result.rowCount;
        console.log(`Batch ${batchNum}: Deleted ${result.rowCount} (Total: ${totalDeleted})`);
    }
    
    const count = await pool.query('SELECT COUNT(*) FROM danimal_leads');
    console.log(`\nCleanup complete! Total deleted: ${totalDeleted}`);
    console.log(`Remaining records: ${count.rows[0].count}`);
    
    pool.end();
}

cleanupDuplicates().catch(e => { console.error(e); pool.end(); });
