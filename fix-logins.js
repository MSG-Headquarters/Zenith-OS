require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fixLogins() {
    const password = 'Zenith2026!';
    const hash = await bcrypt.hash(password, 10);
    
    // Restore CK@CRE-US.com user
    await pool.query(`
        INSERT INTO users (organization_id, name, email, password_hash, role)
        VALUES (1, 'Chris Khouri', 'ck@cre-us.com', $1, 'Admin')
        ON CONFLICT (email) DO UPDATE SET password_hash = $1, name = 'Chris Khouri', role = 'Admin'
    `, [hash]);
    console.log('? Restored: ck@cre-us.com / Zenith2026!');

    // Update all other users to same password for easy testing
    await pool.query('UPDATE users SET password_hash = $1 WHERE email != $2', [hash, 'ck@cre-us.com']);
    console.log('? All users updated to same password');

    // Show all users
    const users = await pool.query('SELECT id, name, email, role FROM users ORDER BY id');
    console.log('\nAll logins (password: Zenith2026!):');
    users.rows.forEach(u => console.log(`  ${u.email} - ${u.name} (${u.role})`));

    pool.end();
}

fixLogins();
