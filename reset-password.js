const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: 'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: { rejectUnauthorized: false }
});

async function resetPassword() {
    try {
        const hash = await bcrypt.hash('Zenith2026!', 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, 'ck@cre-us.com']);
        console.log('✓ Password reset for ck@cre-us.com');
        console.log('  New password: Zenith2026!');
        await pool.end();
    } catch (err) {
        console.log('Error:', err.message);
    }
}

resetPassword();
