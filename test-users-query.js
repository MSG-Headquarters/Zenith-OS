require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function testUsersQuery() {
    try {
        // This is the query from the API route
        const userId = 10;
        const orgId = 1;

        const users = await pool.query(`
            SELECT id, name, email, role 
            FROM users 
            WHERE organization_id = $1 AND id != $2
            ORDER BY name
        `, [orgId, userId]);

        console.log('Users found:', users.rows);
    } catch (err) {
        console.error('Error:', err.message);
    }
    pool.end();
}

testUsersQuery();
