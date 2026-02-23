require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    const result = await pool.query(`
        SELECT id, name, email, role, status 
        FROM users 
        WHERE organization_id = 1 
        ORDER BY id
    `);
    console.log('\nCurrent Users:');
    console.table(result.rows);
    
    // Check if any have "marketing" in role
    const marketing = result.rows.filter(u => u.role && u.role.toLowerCase().includes('marketing'));
    console.log('\nUsers with Marketing role:', marketing.length > 0 ? marketing : 'NONE - need to add one!');
    
    pool.end();
}
check();
