require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function checkMessages() {
    // Check messages
    const msgs = await pool.query('SELECT * FROM huddle_messages ORDER BY created_at DESC LIMIT 10');
    console.log('Recent messages:', msgs.rows);
    
    // Check huddle_messages table structure
    const cols = await pool.query(`
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_name = 'huddle_messages'
    `);
    console.log('\nMessage table columns:', cols.rows);
    
    pool.end();
}

checkMessages();
