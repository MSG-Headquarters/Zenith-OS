const express = require('express');
const router = express.Router();
const { requirePermission, clearPermissionCache } = require('../middleware/permissions');

module.exports = function(pool) {
    
    // All admin routes require admin module access
    router.use(requirePermission('admin', 'full'));

    // ============================================
    // ADMIN DASHBOARD
    // ============================================
    router.get('/', async (req, res) => {
        try {
            const orgId = req.session.org?.id || 1;
            
            // Get user stats
            const userStats = await pool.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'active') as active_count,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
                    COUNT(*) FILTER (WHERE status = 'under_review') as review_count,
                    COUNT(*) FILTER (WHERE status = 'terminated') as terminated_count,
                    COUNT(*) as total_count
                FROM users WHERE organization_id = $1
            `, [orgId]);

            // Get recent audit log
            const recentAudit = await pool.query(`
                SELECT al.*, u.name as user_name
                FROM audit_log al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE al.tenant_id = $1
                ORDER BY al.created_at DESC
                LIMIT 10
            `, [orgId]);

            // Get role counts
            const roleCounts = await pool.query(`
                SELECT ur.name, COUNT(ura.user_id) as user_count
                FROM user_roles ur
                LEFT JOIN user_role_assignments ura ON ur.id = ura.role_id
                WHERE ur.tenant_id = $1
                GROUP BY ur.id, ur.name
                ORDER BY ur.name
            `, [orgId]);

            res.render('admin/dashboard', {
                title: 'Admin Dashboard',
                currentModule: 'admin',
                user: req.session.user,
                org: req.session.org,
                permissions: req.permissions,
                sidebarModules: res.locals.sidebarModules,
                stats: userStats.rows[0],
                recentAudit: recentAudit.rows,
                roleCounts: roleCounts.rows
            });
        } catch (error) {
            console.error('[Admin] Dashboard error:', error);
            res.status(500).render('errors/500', { message: 'Failed to load admin dashboard' });
        }
    });

    // ============================================
    // USER MANAGEMENT
    // ============================================
    router.get('/users', async (req, res) => {
        try {
            const orgId = req.session.org?.id || 1;
            
            const users = await pool.query(`
                SELECT u.*, 
                       ur.name as role_name, ur.slug as role_slug,
                       ura.assigned_at as role_assigned_at
                FROM users u
                LEFT JOIN user_role_assignments ura ON u.id = ura.user_id
                LEFT JOIN user_roles ur ON ura.role_id = ur.id
                WHERE u.organization_id = $1
                ORDER BY u.status, u.name
            `, [orgId]);

            const roles = await pool.query(`
                SELECT id, slug, name, is_admin 
                FROM user_roles 
                WHERE tenant_id = $1 
                ORDER BY name
            `, [orgId]);

            res.render('admin/users', {
                title: 'User Management',
                currentModule: 'admin',
                user: req.session.user,
                org: req.session.org,
                permissions: req.permissions,
                sidebarModules: res.locals.sidebarModules,
                users: users.rows,
                roles: roles.rows
            });
        } catch (error) {
            console.error('[Admin] Users list error:', error);
            res.status(500).render('errors/500', { message: 'Failed to load users' });
        }
    });

    // ============================================
    // API: Get single user
    // ============================================
    router.get('/api/users/:id', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT u.*, ur.id as role_id, ur.slug as role_slug, ur.name as role_name
                FROM users u
                LEFT JOIN user_role_assignments ura ON u.id = ura.user_id
                LEFT JOIN user_roles ur ON ura.role_id = ur.id
                WHERE u.id = $1
            `, [req.params.id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            // Get module overrides
            const overrides = await pool.query(`
                SELECT m.slug, m.name, umo.access_level
                FROM user_module_overrides umo
                JOIN modules m ON umo.module_id = m.id
                WHERE umo.user_id = $1
            `, [req.params.id]);

            res.json({ 
                success: true, 
                user: result.rows[0],
                overrides: overrides.rows
            });
        } catch (error) {
            console.error('[Admin] Get user error:', error);
            res.status(500).json({ success: false, error: 'Failed to load user' });
        }
    });

    // ============================================
    // API: Create user
    // ============================================
    router.post('/api/users', async (req, res) => {
        try {
            const orgId = req.session.org?.id || 1;
            const { name, email, role_id, password } = req.body;

            // Simple password hash (in production, use bcrypt)
            const crypto = require('crypto');
            const passwordHash = crypto.createHash('sha256').update(password || 'changeme123').digest('hex');

            const result = await pool.query(`
                INSERT INTO users (organization_id, name, email, password_hash, status, role)
                VALUES ($1, $2, $3, $4, 'pending', 'User')
                RETURNING *
            `, [orgId, name, email, passwordHash]);

            const newUser = result.rows[0];

            // Assign role if provided
            if (role_id) {
                await pool.query(`
                    INSERT INTO user_role_assignments (user_id, role_id, assigned_by)
                    VALUES ($1, $2, $3)
                `, [newUser.id, role_id, req.session.user.id]);
            }

            // Audit log
            await pool.query(`
                INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, new_value)
                VALUES ($1, $2, 'user.created', 'user', $3, $4)
            `, [orgId, req.session.user.id, newUser.id, JSON.stringify({ name, email })]);

            res.json({ success: true, user: newUser });
        } catch (error) {
            console.error('[Admin] Create user error:', error);
            if (error.code === '23505') {
                return res.status(400).json({ success: false, error: 'Email already exists' });
            }
            res.status(500).json({ success: false, error: 'Failed to create user' });
        }
    });

    // ============================================
    // API: Update user
    // ============================================
    router.put('/api/users/:id', async (req, res) => {
        try {
            const { name, email, role_id } = req.body;
            const userId = req.params.id;
            const orgId = req.session.org?.id || 1;

            await pool.query(`
                UPDATE users SET name = $1, email = $2 WHERE id = $3
            `, [name, email, userId]);

            // Update role assignment
            if (role_id) {
                await pool.query(`DELETE FROM user_role_assignments WHERE user_id = $1`, [userId]);
                await pool.query(`
                    INSERT INTO user_role_assignments (user_id, role_id, assigned_by)
                    VALUES ($1, $2, $3)
                `, [userId, role_id, req.session.user.id]);
            }

            // Clear permission cache
            clearPermissionCache(userId, orgId);

            // Audit log
            await pool.query(`
                INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, new_value)
                VALUES ($1, $2, 'user.updated', 'user', $3, $4)
            `, [orgId, req.session.user.id, userId, JSON.stringify({ name, email, role_id })]);

            res.json({ success: true });
        } catch (error) {
            console.error('[Admin] Update user error:', error);
            res.status(500).json({ success: false, error: 'Failed to update user' });
        }
    });

    // ============================================
    // API: Change user status (freeze/terminate/activate)
    // ============================================
    router.put('/api/users/:id/status', async (req, res) => {
        try {
            const { status, reason } = req.body;
            const userId = req.params.id;
            const orgId = req.session.org?.id || 1;

            // Prevent self-termination
            if (userId == req.session.user.id && (status === 'terminated' || status === 'under_review')) {
                return res.status(400).json({ success: false, error: 'Cannot change your own status' });
            }

            // Get old status
            const oldResult = await pool.query(`SELECT status FROM users WHERE id = $1`, [userId]);
            const oldStatus = oldResult.rows[0]?.status;

            // Update status
            await pool.query(`
                UPDATE users 
                SET status = $1, status_reason = $2, status_changed_by = $3, status_changed_at = NOW()
                WHERE id = $4
            `, [status, reason, req.session.user.id, userId]);

            // Log to status history
            await pool.query(`
                INSERT INTO user_status_history (user_id, old_status, new_status, reason, changed_by)
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, oldStatus, status, reason, req.session.user.id]);

            // Audit log
            await pool.query(`
                INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value)
                VALUES ($1, $2, $3, 'user', $4, $5, $6)
            `, [orgId, req.session.user.id, `user.${status}`, userId, 
                JSON.stringify({ status: oldStatus }), 
                JSON.stringify({ status, reason })]);

            // Clear permission cache
            clearPermissionCache(userId, orgId);

            res.json({ success: true, status });
        } catch (error) {
            console.error('[Admin] Change status error:', error);
            res.status(500).json({ success: false, error: 'Failed to change user status' });
        }
    });

    // ============================================
    // API: Get audit log
    // ============================================
    router.get('/api/audit', async (req, res) => {
        try {
            const orgId = req.session.org?.id || 1;
            const { user_id, action, limit = 50 } = req.query;

            let query = `
                SELECT al.*, u.name as user_name, u.email as user_email
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

            query += ` ORDER BY al.created_at DESC LIMIT $${paramCount + 1}`;
            params.push(parseInt(limit));

            const result = await pool.query(query, params);
            res.json({ success: true, audit: result.rows });
        } catch (error) {
            console.error('[Admin] Audit log error:', error);
            res.status(500).json({ success: false, error: 'Failed to load audit log' });
        }
    });

    return router;
};