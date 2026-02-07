require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function cleanupUsers() {
    try {
        // Remove duplicate users (keep id 1, 7, 8, 9 - the proper ones)
        // First update any references, then delete
        
        // Delete the old duplicates (2, 3, 4)
        await pool.query('DELETE FROM huddle_workspace_members WHERE user_id IN (2, 3, 4)');
        await pool.query('DELETE FROM huddle_channel_members WHERE user_id IN (2, 3, 4)');
        await pool.query('DELETE FROM huddle_messages WHERE user_id IN (2, 3, 4)');
        await pool.query('DELETE FROM users WHERE id IN (2, 3, 4)');
        console.log('Removed duplicate users (2, 3, 4)');

        // Update roles properly
        await pool.query("UPDATE users SET role = 'Admin' WHERE id = 1"); // Koda
        await pool.query("UPDATE users SET role = 'Managing Director' WHERE id = 7"); // Chris
        await pool.query("UPDATE users SET role = 'Principal' WHERE id = 8"); // Dan
        await pool.query("UPDATE users SET role = 'Principal' WHERE id = 9"); // Mitch
        console.log('Updated roles');

        // Final list
        const users = await pool.query('SELECT id, name, email, role FROM users ORDER BY id');
        console.log('\nClean team roster:');
        users.rows.forEach(u => console.log(`  ${u.id}: ${u.name} <${u.email}> - ${u.role}`));

        pool.end();
    } catch (err) {
        console.error('Error:', err);
        pool.end();
    }
}

cleanupUsers();
