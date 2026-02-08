// ============================================
// ADD THESE ROUTES TO routes/admin.js
// Insert before the final "return router;" line
// ============================================

    // ============================================
    // ROLES MANAGEMENT PAGE
    // ============================================
    router.get('/roles', async (req, res) => {
        try {
            const orgId = req.session.org?.id || 1;

            // Get all roles with user counts and permission counts
            const roles = await pool.query(`
                SELECT 
                    ur.*,
                    COUNT(DISTINCT ura.user_id) as user_count,
                    COUNT(DISTINCT rp.id) as permission_count
                FROM user_roles ur
                LEFT JOIN user_role_assignments ura ON ur.id = ura.role_id
                LEFT JOIN role_permissions rp ON ur.id = rp.role_id
                WHERE ur.tenant_id = $1
                GROUP BY ur.id
                ORDER BY ur.is_admin DESC, ur.name
            `, [orgId]);

            // Get permissions for each role
            for (let role of roles.rows) {
                const perms = await pool.query(`
                    SELECT rp.*, m.name as module_name, m.slug as module_slug
                    FROM role_permissions rp
                    JOIN modules m ON rp.module_id = m.id
                    WHERE rp.role_id = $1
                `, [role.id]);
                role.permissions = perms.rows;
            }

            // Get all modules for the permission editor
            const modules = await pool.query(`
                SELECT id, name, slug, icon, description
                FROM modules
                WHERE is_active = true
                ORDER BY sort_order, name
            `);

            res.render('admin/roles', {
                title: 'Role Management',
                currentModule: 'admin',
                user: req.session.user,
                org: req.session.org,
                permissions: req.permissions,
                sidebarModules: res.locals.sidebarModules,
                roles: roles.rows,
                modules: modules.rows
            });
        } catch (error) {
            console.error('[Admin] Roles page error:', error);
            res.status(500).render('errors/500', { message: 'Failed to load roles' });
        }
    });

    // ============================================
    // API: Get single role with permissions
    // ============================================
    router.get('/api/roles/:id', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT * FROM user_roles WHERE id = $1
            `, [req.params.id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Role not found' });
            }

            const permissions = await pool.query(`
                SELECT rp.*, m.name as module_name
                FROM role_permissions rp
                JOIN modules m ON rp.module_id = m.id
                WHERE rp.role_id = $1
            `, [req.params.id]);

            res.json({
                success: true,
                role: result.rows[0],
                permissions: permissions.rows
            });
        } catch (error) {
            console.error('[Admin] Get role error:', error);
            res.status(500).json({ success: false, error: 'Failed to load role' });
        }
    });

    // ============================================
    // API: Create role
    // ============================================
    router.post('/api/roles', async (req, res) => {
        try {
            const orgId = req.session.org?.id || 1;
            const { name, slug, description, is_admin, permissions } = req.body;

            // Create role
            const result = await pool.query(`
                INSERT INTO user_roles (tenant_id, name, slug, description, is_admin)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [orgId, name, slug, description, is_admin || false]);

            const newRole = result.rows[0];

            // Add permissions
            if (permissions && permissions.length > 0) {
                for (const perm of permissions) {
                    await pool.query(`
                        INSERT INTO role_permissions (role_id, module_id, access_level)
                        VALUES ($1, $2, $3)
                    `, [newRole.id, perm.module_id, perm.access_level]);
                }
            }

            // Audit log
            await pool.query(`
                INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, new_value)
                VALUES ($1, $2, 'role.created', 'role', $3, $4)
            `, [orgId, req.session.user.id, newRole.id, JSON.stringify({ name, slug, is_admin })]);

            res.json({ success: true, role: newRole });
        } catch (error) {
            console.error('[Admin] Create role error:', error);
            if (error.code === '23505') {
                return res.status(400).json({ success: false, error: 'Role slug already exists' });
            }
            res.status(500).json({ success: false, error: 'Failed to create role' });
        }
    });

    // ============================================
    // API: Update role
    // ============================================
    router.put('/api/roles/:id', async (req, res) => {
        try {
            const roleId = req.params.id;
            const orgId = req.session.org?.id || 1;
            const { name, slug, description, is_admin, permissions } = req.body;

            // Update role
            await pool.query(`
                UPDATE user_roles 
                SET name = $1, slug = $2, description = $3, is_admin = $4, updated_at = NOW()
                WHERE id = $5
            `, [name, slug, description, is_admin || false, roleId]);

            // Clear existing permissions and add new ones
            await pool.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);

            if (permissions && permissions.length > 0) {
                for (const perm of permissions) {
                    await pool.query(`
                        INSERT INTO role_permissions (role_id, module_id, access_level)
                        VALUES ($1, $2, $3)
                    `, [roleId, perm.module_id, perm.access_level]);
                }
            }

            // Clear permission cache for all users with this role
            const usersWithRole = await pool.query(`
                SELECT user_id FROM user_role_assignments WHERE role_id = $1
            `, [roleId]);

            for (const row of usersWithRole.rows) {
                clearPermissionCache(row.user_id, orgId);
            }

            // Audit log
            await pool.query(`
                INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, new_value)
                VALUES ($1, $2, 'role.updated', 'role', $3, $4)
            `, [orgId, req.session.user.id, roleId, JSON.stringify({ name, slug, is_admin, permissions: permissions?.length || 0 })]);

            res.json({ success: true });
        } catch (error) {
            console.error('[Admin] Update role error:', error);
            res.status(500).json({ success: false, error: 'Failed to update role' });
        }
    });

    // ============================================
    // API: Delete role
    // ============================================
    router.delete('/api/roles/:id', async (req, res) => {
        try {
            const roleId = req.params.id;
            const orgId = req.session.org?.id || 1;

            // Check if role is admin
            const roleCheck = await pool.query(`SELECT is_admin, name FROM user_roles WHERE id = $1`, [roleId]);
            if (roleCheck.rows[0]?.is_admin) {
                return res.status(400).json({ success: false, error: 'Cannot delete admin role' });
            }

            // Check if users are assigned
            const userCheck = await pool.query(`SELECT COUNT(*) as count FROM user_role_assignments WHERE role_id = $1`, [roleId]);
            if (parseInt(userCheck.rows[0].count) > 0) {
                return res.status(400).json({ success: false, error: 'Cannot delete role with assigned users. Reassign users first.' });
            }

            // Delete permissions first
            await pool.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);

            // Delete role
            await pool.query(`DELETE FROM user_roles WHERE id = $1`, [roleId]);

            // Audit log
            await pool.query(`
                INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, old_value)
                VALUES ($1, $2, 'role.deleted', 'role', $3, $4)
            `, [orgId, req.session.user.id, roleId, JSON.stringify({ name: roleCheck.rows[0]?.name })]);

            res.json({ success: true });
        } catch (error) {
            console.error('[Admin] Delete role error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete role' });
        }
    });

    // ============================================
    // AUDIT LOG PAGE
    // ============================================
    router.get('/audit', async (req, res) => {
        try {
            const orgId = req.session.org?.id || 1;

            // Get users for filter dropdown
            const users = await pool.query(`
                SELECT id, name, email FROM users 
                WHERE organization_id = $1 
                ORDER BY name
            `, [orgId]);

            res.render('admin/audit', {
                title: 'Audit Log',
                currentModule: 'admin',
                user: req.session.user,
                org: req.session.org,
                permissions: req.permissions,
                sidebarModules: res.locals.sidebarModules,
                users: users.rows
            });
        } catch (error) {
            console.error('[Admin] Audit page error:', error);
            res.status(500).render('errors/500', { message: 'Failed to load audit log' });
        }
    });

    // ============================================
    // API: Get audit log (enhanced with pagination & stats)
    // ============================================
    router.get('/api/audit', async (req, res) => {
        try {
            const orgId = req.session.org?.id || 1;
            const { user_id, action, search, limit = 50, offset = 0 } = req.query;

            let query = `
                SELECT al.*, u.name as user_name, u.email as user_email
                FROM audit_log al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE al.tenant_id = $1
            `;
            let countQuery = `SELECT COUNT(*) as total FROM audit_log al WHERE al.tenant_id = $1`;
            const params = [orgId];
            const countParams = [orgId];
            let paramCount = 1;

            if (user_id) {
                paramCount++;
                query += ` AND al.user_id = $${paramCount}`;
                countQuery += ` AND al.user_id = $${paramCount}`;
                params.push(user_id);
                countParams.push(user_id);
            }

            if (action) {
                paramCount++;
                query += ` AND al.action LIKE $${paramCount}`;
                countQuery += ` AND al.action LIKE $${paramCount}`;
                params.push(`%${action}%`);
                countParams.push(`%${action}%`);
            }

            if (search) {
                paramCount++;
                query += ` AND (al.action ILIKE $${paramCount} OR al.new_value ILIKE $${paramCount} OR al.old_value ILIKE $${paramCount})`;
                countQuery += ` AND (al.action ILIKE $${paramCount} OR al.new_value ILIKE $${paramCount} OR al.old_value ILIKE $${paramCount})`;
                params.push(`%${search}%`);
                countParams.push(`%${search}%`);
            }

            query += ` ORDER BY al.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
            params.push(parseInt(limit), parseInt(offset));

            const result = await pool.query(query, params);
            const countResult = await pool.query(countQuery, countParams);

            // Get stats
            const stats = await pool.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as total_24h,
                    COUNT(*) FILTER (WHERE action LIKE '%login%' AND created_at > NOW() - INTERVAL '24 hours') as logins,
                    COUNT(*) FILTER (WHERE (action LIKE '%create%' OR action LIKE '%update%' OR action LIKE '%delete%') AND created_at > NOW() - INTERVAL '24 hours') as changes,
                    COUNT(DISTINCT user_id) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as active_users
                FROM audit_log WHERE tenant_id = $1
            `, [orgId]);

            res.json({ 
                success: true, 
                audit: result.rows,
                total: parseInt(countResult.rows[0].total),
                stats: stats.rows[0]
            });
        } catch (error) {
            console.error('[Admin] Audit log API error:', error);
            res.status(500).json({ success: false, error: 'Failed to load audit log' });
        }
    });

    // ============================================
    // API: Export audit log as CSV
    // ============================================
    router.get('/api/audit/export', async (req, res) => {
        try {
            const orgId = req.session.org?.id || 1;
            const { user_id, action } = req.query;

            let query = `
                SELECT al.created_at, u.name as user_name, u.email as user_email,
                       al.action, al.entity_type, al.entity_id, al.old_value, al.new_value
                FROM audit_log al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE al.tenant_id = $1
            `;
            const params = [orgId];
            let paramCount = 1;

            if (user_id) {
                paramCount++;
                query += ` AND al.user_id = $${paramCount}`;
                params.push(user_id);
            }

            if (action) {
                paramCount++;
                query += ` AND al.action LIKE $${paramCount}`;
                params.push(`%${action}%`);
            }

            query += ` ORDER BY al.created_at DESC LIMIT 10000`;

            const result = await pool.query(query, params);

            // Generate CSV
            let csv = 'Timestamp,User,Email,Action,Entity Type,Entity ID,Old Value,New Value\n';
            result.rows.forEach(row => {
                csv += `"${row.created_at}","${row.user_name || ''}","${row.user_email || ''}","${row.action}","${row.entity_type || ''}","${row.entity_id || ''}","${(row.old_value || '').replace(/"/g, '""')}","${(row.new_value || '').replace(/"/g, '""')}"\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=audit-log-${new Date().toISOString().split('T')[0]}.csv`);
            res.send(csv);
        } catch (error) {
            console.error('[Admin] Audit export error:', error);
            res.status(500).json({ success: false, error: 'Failed to export audit log' });
        }
    });
