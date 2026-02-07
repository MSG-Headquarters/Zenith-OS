const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'zenith_os',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function debug() {
    try {
        // Check user role assignments
        const result = await pool.query(`
            SELECT u.id, u.name, u.email, ura.role_id, ur.name as role_name, ur.is_admin 
            FROM users u 
            LEFT JOIN user_role_assignments ura ON u.id = ura.user_id 
            LEFT JOIN user_roles ur ON ura.role_id = ur.id 
            WHERE u.organization_id = 1
        `);
        console.log('=== USER ROLE ASSIGNMENTS ===');
        console.table(result.rows);

        // Check if admin role exists
        const roles = await pool.query(`SELECT * FROM user_roles WHERE tenant_id = 1`);
        console.log('\n=== AVAILABLE ROLES ===');
        console.table(roles.rows);

        // Check role_permissions for admin
        const perms = await pool.query(`
            SELECT ur.name as role_name, m.slug as module, rp.access_level
            FROM role_permissions rp
            JOIN user_roles ur ON rp.role_id = ur.id
            JOIN modules m ON rp.module_id = m.id
            WHERE ur.slug = 'admin' AND ur.tenant_id = 1
        `);
        console.log('\n=== ADMIN ROLE PERMISSIONS ===');
        console.table(perms.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

debug();
