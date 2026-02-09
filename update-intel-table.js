require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function update() {
    console.log('Adding missing columns to intel_projects...');
    
    await pool.query(`
        ALTER TABLE intel_projects 
        ADD COLUMN IF NOT EXISTS canvas_data JSONB,
        ADD COLUMN IF NOT EXISTS enrichment_data JSONB,
        ADD COLUMN IF NOT EXISTS organization_id INTEGER,
        ADD COLUMN IF NOT EXISTS user_id INTEGER
    `);
    
    // Copy data from old columns to new if needed
    await pool.query(`UPDATE intel_projects SET organization_id = tenant_id WHERE organization_id IS NULL AND tenant_id IS NOT NULL`);
    await pool.query(`UPDATE intel_projects SET user_id = created_by WHERE user_id IS NULL AND created_by IS NOT NULL`);
    
    console.log('Columns added!');
    
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'intel_projects' ORDER BY ordinal_position");
    console.log('All columns:', cols.rows.map(c => c.column_name).join(', '));
    
    pool.end();
}
update().catch(console.error);
