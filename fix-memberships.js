require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fixMemberships() {
    // Get all users
    const users = await pool.query('SELECT id, name, email FROM users');
    console.log('Users:', users.rows);

    // Add ALL users to workspace 1
    for (const user of users.rows) {
        await pool.query(`
            INSERT INTO huddle_workspace_members (workspace_id, user_id, role)
            VALUES (1, $1, 'member')
            ON CONFLICT (workspace_id, user_id) DO NOTHING
        `, [user.id]);
        console.log('Added to workspace:', user.name);
    }

    // Add ALL users to ALL channels
    const channels = await pool.query('SELECT id, name FROM huddle_channels WHERE workspace_id = 1');
    for (const channel of channels.rows) {
        for (const user of users.rows) {
            await pool.query(`
                INSERT INTO huddle_channel_members (channel_id, user_id, role)
                VALUES ($1, $2, 'member')
                ON CONFLICT DO NOTHING
            `, [channel.id, user.id]);
        }
        console.log('Added all users to channel:', channel.name);
    }

    // Verify workspace members
    const members = await pool.query(`
        SELECT wm.*, u.name, u.email 
        FROM huddle_workspace_members wm 
        JOIN users u ON wm.user_id = u.id 
        WHERE wm.workspace_id = 1
    `);
    console.log('\nWorkspace 1 members:');
    members.rows.forEach(m => console.log(`  ${m.user_id}: ${m.name} <${m.email}>`));

    pool.end();
}

fixMemberships();
