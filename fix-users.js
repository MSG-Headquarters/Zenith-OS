require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fixUsers() {
    try {
        // Check existing users
        const existing = await pool.query('SELECT id, name, email, role FROM users ORDER BY id');
        console.log('Current users:');
        existing.rows.forEach(u => console.log(`  ${u.id}: ${u.name} <${u.email}> - ${u.role}`));

        // Add Dan and Mitch with unique emails
        const result1 = await pool.query(`
            INSERT INTO users (organization_id, name, email, password_hash, role)
            VALUES (1, 'Dan Smith', 'dan@creconsultants.com', '$2a$10$WMcJzj6zbDQkju864rFBFumf3Qe1aoW3K/3SVj9cnKEEyUnGeyDRG', 'Principal')
            ON CONFLICT (email) DO UPDATE SET name = 'Dan Smith', role = 'Principal'
            RETURNING id, name
        `);
        console.log('\nDan:', result1.rows[0]);

        const result2 = await pool.query(`
            INSERT INTO users (organization_id, name, email, password_hash, role)
            VALUES (1, 'Mitch Tindell', 'mitch@creconsultants.com', '$2a$10$WMcJzj6zbDQkju864rFBFumf3Qe1aoW3K/3SVj9cnKEEyUnGeyDRG', 'Principal')
            ON CONFLICT (email) DO UPDATE SET name = 'Mitch Tindell', role = 'Principal'
            RETURNING id, name
        `);
        console.log('Mitch:', result2.rows[0]);

        // Add to workspace and channels
        const userIds = [result1.rows[0].id, result2.rows[0].id];
        for (const userId of userIds) {
            await pool.query(`
                INSERT INTO huddle_workspace_members (workspace_id, user_id, role)
                VALUES (1, $1, 'member')
                ON CONFLICT (workspace_id, user_id) DO NOTHING
            `, [userId]);
            
            const channels = await pool.query('SELECT id FROM huddle_channels WHERE workspace_id = 1');
            for (const ch of channels.rows) {
                await pool.query(`
                    INSERT INTO huddle_channel_members (channel_id, user_id, role)
                    VALUES ($1, $2, 'member')
                    ON CONFLICT DO NOTHING
                `, [ch.id, userId]);
            }
        }

        // Final user list
        const final = await pool.query('SELECT id, name, email, role FROM users WHERE organization_id = 1 ORDER BY id');
        console.log('\nFinal team:');
        final.rows.forEach(u => console.log(`  ${u.id}: ${u.name} (${u.role})`));

        pool.end();
    } catch (err) {
        console.error('Error:', err);
        pool.end();
    }
}

fixUsers();
