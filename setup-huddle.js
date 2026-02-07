require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function setupHuddle() {
    try {
        // Clear existing messages (fresh start)
        await pool.query('DELETE FROM huddle_messages');
        console.log('Cleared messages');

        // Check/add team members to users table
        const users = [
            { name: 'Dan Smith', email: 'dan@cre-us.com', role: 'Principal' },
            { name: 'Mitch Tindell', email: 'mitch@cre-us.com', role: 'Principal' },
            { name: 'Chris Khouri', email: 'chris@cre-us.com', role: 'Managing Director' }
        ];

        for (const user of users) {
            await pool.query(`
                INSERT INTO users (organization_id, name, email, password_hash, role)
                VALUES (1, $1, $2, '$2a$10$WMcJzj6zbDQkju864rFBFumf3Qe1aoW3K/3SVj9cnKEEyUnGeyDRG', $3)
                ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
                RETURNING id, name, email
            `, [user.name, user.email, user.role]);
            console.log('Added/updated user:', user.name);
        }

        // Get all users
        const allUsers = await pool.query('SELECT id, name, email, role FROM users WHERE organization_id = 1');
        console.log('\nTeam members:');
        allUsers.rows.forEach(u => console.log(`  ${u.id}: ${u.name} (${u.role})`));

        // Add all users to workspace
        for (const user of allUsers.rows) {
            await pool.query(`
                INSERT INTO huddle_workspace_members (workspace_id, user_id, role)
                VALUES (1, $1, 'member')
                ON CONFLICT (workspace_id, user_id) DO NOTHING
            `, [user.id]);
        }
        console.log('\nAll users added to workspace');

        // Add all users to all channels
        const channels = await pool.query('SELECT id, name FROM huddle_channels WHERE workspace_id = 1');
        for (const channel of channels.rows) {
            for (const user of allUsers.rows) {
                await pool.query(`
                    INSERT INTO huddle_channel_members (channel_id, user_id, role)
                    VALUES ($1, $2, 'member')
                    ON CONFLICT DO NOTHING
                `, [channel.id, user.id]);
            }
        }
        console.log('All users added to channels');

        // Add a welcome message
        await pool.query(`
            INSERT INTO huddle_messages (channel_id, user_id, content, created_at)
            VALUES (1, 1, 'Welcome to The Huddle! ?? This is our team communication space.', NOW())
        `);
        console.log('\nWelcome message added');

        console.log('\n? Huddle setup complete! Ready for testing.');
        pool.end();
    } catch (err) {
        console.error('Error:', err.message);
        pool.end();
    }
}

setupHuddle();
