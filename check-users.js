require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function checkUsers() {
    const users = await pool.query('SELECT id, name, email, role FROM users ORDER BY id');
    console.log('All users:');
    users.rows.forEach(u => console.log(`  ${u.id}: ${u.name} <${u.email}> - ${u.role}`));
    
    console.log('\nNote: All users have the same password hash, which is bcrypt for "password123"');
    console.log('But you should verify or reset Mitch\'s password if needed.');
    
    pool.end();
}

checkUsers();
