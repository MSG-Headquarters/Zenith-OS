require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function checkDMTables() {
    // Check direct conversation tables
    const convCols = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'huddle_direct_conversations'
    `);
    console.log('huddle_direct_conversations columns:', convCols.rows.map(r => r.column_name));

    const partCols = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'huddle_direct_participants'
    `);
    console.log('\nhuddle_direct_participants columns:', partCols.rows.map(r => r.column_name));

    const dmCols = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'huddle_direct_messages'
    `);
    console.log('\nhuddle_direct_messages columns:', dmCols.rows.map(r => r.column_name));

    pool.end();
}

checkDMTables();
