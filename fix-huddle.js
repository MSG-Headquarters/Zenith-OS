require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function checkAndFix() {
    try {
        // Check if table exists
        const tables = await pool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'huddle_workspace_members'
        `);
        
        if (tables.rows.length === 0) {
            console.log('Table huddle_workspace_members does not exist! Creating...');
            await pool.query(`
                CREATE TABLE huddle_workspace_members (
                    id SERIAL PRIMARY KEY,
                    workspace_id INTEGER REFERENCES huddle_workspaces(id),
                    user_id INTEGER REFERENCES users(id),
                    role VARCHAR(50) DEFAULT 'member',
                    joined_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(workspace_id, user_id)
                )
            `);
            console.log('Table created!');
        } else {
            console.log('Table exists, checking columns...');
            const cols = await pool.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'huddle_workspace_members'
            `);
            console.log('Columns:', cols.rows.map(r => r.column_name));
        }

        // Add user to workspace
        await pool.query(`
            INSERT INTO huddle_workspace_members (workspace_id, user_id, role)
            VALUES (1, 1, 'admin')
            ON CONFLICT (workspace_id, user_id) DO NOTHING
        `);
        console.log('User 1 added to workspace 1');

        // Verify
        const members = await pool.query('SELECT * FROM huddle_workspace_members');
        console.log('Workspace members:', members.rows);

        pool.end();
    } catch (err) {
        console.error('Error:', err.message);
        pool.end();
    }
}

checkAndFix();
