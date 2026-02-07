const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: { rejectUnauthorized: false }
});

async function createPermissionTables() {
    console.log('\n🔐 ZENITH OS - Creating Permission System Tables...\n');

    try {
        // ============================================
        // MODULES TABLE
        // ============================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS modules (
                id SERIAL PRIMARY KEY,
                slug VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                icon VARCHAR(50),
                route VARCHAR(100),
                sort_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ modules table created');

        // ============================================
        // USER ROLES TABLE
        // ============================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_roles (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
                slug VARCHAR(50) NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                is_admin BOOLEAN DEFAULT FALSE,
                is_system BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(tenant_id, slug)
            )
        `);
        console.log('✅ user_roles table created');

        // ============================================
        // ROLE PERMISSIONS TABLE
        // ============================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                id SERIAL PRIMARY KEY,
                role_id INTEGER REFERENCES user_roles(id) ON DELETE CASCADE,
                module_id INTEGER REFERENCES modules(id) ON DELETE CASCADE,
                access_level VARCHAR(20) DEFAULT 'none',
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(role_id, module_id)
            )
        `);
        console.log('✅ role_permissions table created');

        // ============================================
        // USER ROLE ASSIGNMENTS TABLE
        // ============================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_role_assignments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                role_id INTEGER REFERENCES user_roles(id) ON DELETE CASCADE,
                assigned_by INTEGER REFERENCES users(id),
                assigned_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, role_id)
            )
        `);
        console.log('✅ user_role_assignments table created');

        // ============================================
        // USER MODULE OVERRIDES TABLE
        // ============================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_module_overrides (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                module_id INTEGER REFERENCES modules(id) ON DELETE CASCADE,
                access_level VARCHAR(20) NOT NULL,
                reason TEXT,
                granted_by INTEGER REFERENCES users(id),
                granted_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP,
                UNIQUE(user_id, module_id)
            )
        `);
        console.log('✅ user_module_overrides table created');

        // ============================================
        // USER STATUS HISTORY TABLE
        // ============================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_status_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                old_status VARCHAR(20),
                new_status VARCHAR(20) NOT NULL,
                reason TEXT,
                changed_by INTEGER REFERENCES users(id),
                changed_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ user_status_history table created');

        // ============================================
        // USER FREEZE REQUESTS TABLE
        // ============================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_freeze_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                submitted_at TIMESTAMP DEFAULT NOW(),
                reviewed_by INTEGER REFERENCES users(id),
                reviewed_at TIMESTAMP,
                review_notes TEXT
            )
        `);
        console.log('✅ user_freeze_requests table created');

        // ============================================
        // ADD STATUS COLUMNS TO USERS TABLE
        // ============================================
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'
        `);
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS status_reason TEXT
        `);
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS status_changed_by INTEGER
        `);
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP
        `);
        console.log('✅ users table updated with status columns');

        // ============================================
        // AUDIT LOG TABLE
        // ============================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER,
                user_id INTEGER,
                action VARCHAR(100) NOT NULL,
                entity_type VARCHAR(50),
                entity_id INTEGER,
                old_value JSONB,
                new_value JSONB,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`);
        console.log('✅ audit_log table created with indexes');

        // ============================================
        // INSERT DEFAULT MODULES
        // ============================================
        const modules = [
            { slug: 'dashboard', name: 'Dashboard', icon: 'bi-house', route: '/dashboard', sort: 1 },
            { slug: 'crm', name: 'CRM Pipeline', icon: 'bi-kanban', route: '/crm', sort: 2 },
            { slug: 'huddle', name: 'Huddle', icon: 'bi-chat-dots', route: '/huddle', sort: 3 },
            { slug: 'mailer', name: 'Mailer', icon: 'bi-envelope', route: '/mailer', sort: 4 },
            { slug: 'vault', name: 'Vault', icon: 'bi-lock', route: '/vault', sort: 5 },
            { slug: 'marketing_tab', name: 'Marketing', icon: 'bi-megaphone', route: '/marketing', sort: 6 },
            { slug: 'intel', name: 'INTEL', icon: 'bi-broadcast', route: '/intel', sort: 7 },
            { slug: 'danimal', name: 'Danimal Data', icon: 'bi-database', route: '/danimal', sort: 8 },
            { slug: 'cfo', name: 'CFO', icon: 'bi-graph-up', route: '/cfo', sort: 9 },
            { slug: 'pm', name: 'Property Mgmt', icon: 'bi-building', route: '/pm', sort: 10 },
            { slug: 'listings', name: 'Listings DB', icon: 'bi-list-ul', route: '/listings', sort: 11 },
            { slug: 'admin', name: 'Admin', icon: 'bi-gear', route: '/admin', sort: 99 }
        ];

        for (const mod of modules) {
            await pool.query(`
                INSERT INTO modules (slug, name, icon, route, sort_order)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (slug) DO UPDATE SET name = $2, icon = $3, route = $4, sort_order = $5
            `, [mod.slug, mod.name, mod.icon, mod.route, mod.sort]);
        }
        console.log('✅ Default modules inserted');

        // ============================================
        // INSERT DEFAULT ROLES FOR TENANT 1 (CRE Consultants)
        // ============================================
        const roles = [
            { slug: 'admin', name: 'Administrator', is_admin: true, is_system: true },
            { slug: 'broker', name: 'Broker', is_admin: false, is_system: true },
            { slug: 'marketing', name: 'Marketing', is_admin: false, is_system: true },
            { slug: 'accounting', name: 'Accounting', is_admin: false, is_system: true },
            { slug: 'pm', name: 'Property Management', is_admin: false, is_system: true },
            { slug: 'analyst', name: 'Analyst', is_admin: false, is_system: true }
        ];

        for (const role of roles) {
            await pool.query(`
                INSERT INTO user_roles (tenant_id, slug, name, is_admin, is_system)
                VALUES (1, $1, $2, $3, $4)
                ON CONFLICT (tenant_id, slug) DO UPDATE SET name = $2, is_admin = $3
            `, [role.slug, role.name, role.is_admin, role.is_system]);
        }
        console.log('✅ Default roles created for tenant 1');

        // ============================================
        // SET UP DEFAULT ROLE PERMISSIONS
        // ============================================
        
        // Get role and module IDs
        const rolesResult = await pool.query(`SELECT id, slug FROM user_roles WHERE tenant_id = 1`);
        const modulesResult = await pool.query(`SELECT id, slug FROM modules`);
        
        const roleMap = {};
        rolesResult.rows.forEach(r => roleMap[r.slug] = r.id);
        
        const moduleMap = {};
        modulesResult.rows.forEach(m => moduleMap[m.slug] = m.id);

        // Define permissions: role -> module -> access_level
        const permissions = {
            admin: {
                dashboard: 'full', crm: 'full', huddle: 'full', mailer: 'full', vault: 'full',
                marketing_tab: 'full', intel: 'full', danimal: 'full', cfo: 'full', pm: 'full',
                listings: 'full', admin: 'full'
            },
            broker: {
                dashboard: 'own', crm: 'own', huddle: 'full', mailer: 'send', vault: 'own_docs',
                marketing_tab: 'request', intel: 'none', danimal: 'none', cfo: 'none', pm: 'none',
                listings: 'own', admin: 'none'
            },
            marketing: {
                dashboard: 'own', crm: 'none', huddle: 'full', mailer: 'full', vault: 'view',
                marketing_tab: 'full', intel: 'full', danimal: 'full', cfo: 'none', pm: 'none',
                listings: 'view', admin: 'none'
            },
            accounting: {
                dashboard: 'own', crm: 'none', huddle: 'full', mailer: 'none', vault: 'view',
                marketing_tab: 'none', intel: 'none', danimal: 'none', cfo: 'full', pm: 'none',
                listings: 'none', admin: 'none'
            },
            pm: {
                dashboard: 'own', crm: 'none', huddle: 'full', mailer: 'none', vault: 'view',
                marketing_tab: 'none', intel: 'none', danimal: 'none', cfo: 'none', pm: 'full',
                listings: 'none', admin: 'none'
            },
            analyst: {
                dashboard: 'own', crm: 'view', huddle: 'full', mailer: 'view', vault: 'view',
                marketing_tab: 'none', intel: 'view', danimal: 'full', cfo: 'view', pm: 'none',
                listings: 'view', admin: 'none'
            }
        };

        for (const [roleSlug, modulePerms] of Object.entries(permissions)) {
            const roleId = roleMap[roleSlug];
            if (!roleId) continue;
            
            for (const [moduleSlug, accessLevel] of Object.entries(modulePerms)) {
                const moduleId = moduleMap[moduleSlug];
                if (!moduleId) continue;
                
                await pool.query(`
                    INSERT INTO role_permissions (role_id, module_id, access_level)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (role_id, module_id) DO UPDATE SET access_level = $3
                `, [roleId, moduleId, accessLevel]);
            }
        }
        console.log('✅ Default role permissions configured');

        // ============================================
        // ASSIGN ADMIN ROLE TO EXISTING ADMIN USERS
        // ============================================
        const adminRoleId = roleMap['admin'];
        const adminUsers = await pool.query(`
            SELECT id FROM users WHERE role = 'admin' AND org_id = 1
        `);
        
        for (const user of adminUsers.rows) {
            await pool.query(`
                INSERT INTO user_role_assignments (user_id, role_id)
                VALUES ($1, $2)
                ON CONFLICT (user_id, role_id) DO NOTHING
            `, [user.id, adminRoleId]);
        }
        console.log(`✅ Admin role assigned to ${adminUsers.rows.length} existing admin users`);

        console.log('\n🎉 Permission system tables created successfully!\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }

    await pool.end();
}

createPermissionTables();