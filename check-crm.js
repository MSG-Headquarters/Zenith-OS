require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    const stages = await pool.query('SELECT * FROM pipeline_stages ORDER BY position LIMIT 10');
    console.log('=== PIPELINE STAGES ===');
    stages.rows.forEach(s => console.log(s.position, '|', s.name, '|', s.color));
    
    const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leads' ORDER BY ordinal_position");
    console.log('\n=== LEADS TABLE COLUMNS ===');
    cols.rows.forEach(c => console.log(c.column_name, ':', c.data_type));
    
    const won = await pool.query("SELECT id, name, company, stage, value FROM leads WHERE stage = 'Closed Won' LIMIT 5");
    console.log('\n=== CLOSED WON LEADS ===');
    console.log('Count:', won.rows.length);
    won.rows.forEach(l => console.log(l.id, '|', l.name, '|', l.company, '|', l.value));
    
    pool.end();
}
check().catch(console.error);
