require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function testHuddleRoute() {
    try {
        const userId = 10;
        
        // This is the main huddle query
        const workspacesResult = await pool.query(`
            SELECT w.* FROM huddle_workspaces w
            JOIN huddle_workspace_members wm ON w.id = wm.workspace_id
            WHERE wm.user_id = $1
            ORDER BY w.name
        `, [userId]);
        console.log('Workspaces:', workspacesResult.rows);

        const activeWorkspace = workspacesResult.rows[0];
        if (activeWorkspace) {
            const channelsResult = await pool.query(`
                SELECT * FROM huddle_channels
                WHERE workspace_id = $1
                ORDER BY is_default DESC, name
            `, [activeWorkspace.id]);
            console.log('Channels:', channelsResult.rows);

            const activeChannel = channelsResult.find(c => c.is_default) || channelsResult.rows[0];
            if (activeChannel) {
                const messagesResult = await pool.query(`
                    SELECT m.*, u.name, u.email
                    FROM huddle_messages m
                    LEFT JOIN users u ON m.user_id = u.id
                    WHERE m.channel_id = $1
                    ORDER BY m.created_at DESC
                    LIMIT 50
                `, [activeChannel.id]);
                console.log('Messages:', messagesResult.rows.length);
            }
        }
        
        console.log('All queries passed!');
    } catch (err) {
        console.error('Error:', err.message);
    }
    pool.end();
}

testHuddleRoute();
