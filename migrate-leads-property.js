require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
    console.log('Adding property fields to leads table...');
    
    await pool.query(`
        ALTER TABLE leads 
        ADD COLUMN IF NOT EXISTS property_address VARCHAR(500),
        ADD COLUMN IF NOT EXISTS property_city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS property_state VARCHAR(50) DEFAULT 'FL',
        ADD COLUMN IF NOT EXISTS property_zip VARCHAR(20),
        ADD COLUMN IF NOT EXISTS property_type VARCHAR(50),
        ADD COLUMN IF NOT EXISTS property_sqft INTEGER,
        ADD COLUMN IF NOT EXISTS property_lat DECIMAL(10, 8),
        ADD COLUMN IF NOT EXISTS property_lng DECIMAL(11, 8),
        ADD COLUMN IF NOT EXISTS intel_project_id INTEGER,
        ADD COLUMN IF NOT EXISTS flyer_created_at TIMESTAMP
    `);
    
    console.log('Property fields added!');
    
    // Verify
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' AND (column_name LIKE 'property_%' OR column_name LIKE 'intel_%' OR column_name LIKE 'flyer_%')");
    console.log('New columns:', cols.rows.map(c => c.column_name).join(', '));
    
    pool.end();
}
migrate().catch(console.error);
