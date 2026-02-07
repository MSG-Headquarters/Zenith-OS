require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function seedHuddle() {
    try {
        // Check channel_members columns
        const memCols = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'huddle_channel_members'
        `);
        console.log('Channel member columns:', memCols.rows.map(r => r.column_name));

        // Add user 1 to all channels
        const channels = await pool.query('SELECT id FROM huddle_channels WHERE workspace_id = 1');
        
        for (const ch of channels.rows) {
            await pool.query(`
                INSERT INTO huddle_channel_members (channel_id, user_id, role)
                VALUES ($1, 1, 'admin')
                ON CONFLICT DO NOTHING
            `, [ch.id]);
            console.log('User added to channel:', ch.id);
        }

        // Check users table to fix "undefined undefined"
        const userCols = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        console.log('User columns:', userCols.rows.map(r => r.column_name));

        // Get current user data
        const user = await pool.query('SELECT * FROM users WHERE id = 1');
        console.log('User 1:', user.rows[0]);

        pool.end();
    } catch (err) {
        console.error('Error:', err.message);
        pool.end();
    }
}

seedHuddle();
