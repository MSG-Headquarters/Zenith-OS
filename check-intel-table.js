require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'intel_projects' ORDER BY ordinal_position");
        console.log('=== INTEL_PROJECTS COLUMNS ===');
        cols.rows.forEach(c => console.log(c.column_name, ':', c.data_type));
    } catch (e) {
        console.log('Table may not exist, creating it...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS intel_projects (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER,
                user_id INTEGER,
                name VARCHAR(255),
                description TEXT,
                property_address VARCHAR(500),
                property_type VARCHAR(100),
                property_lat DECIMAL(10, 8),
                property_lng DECIMAL(11, 8),
                status VARCHAR(50) DEFAULT 'draft',
                canvas_data JSONB,
                enrichment_data JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('intel_projects table created!');
    }
    pool.end();
}
check();
