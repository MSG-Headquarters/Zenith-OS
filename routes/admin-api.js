/**
 * Admin API Routes
 * User and license management for Zenith OS
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware: Check if user is admin
function requireAdmin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const role = req.session.user.role?.toLowerCase() || '';
    if (!['admin', 'principal'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    next();
}

// Generate a license key
function generateLicenseKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like O, 0, I, 1
    let key = '';
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) key += '-';
        key += chars[crypto.randomInt(chars.length)];
    }
    return key;
}

// GET /api/admin/users - List all users in organization
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const orgId = req.session.org?.id || 1;
        const result = await pool.query(`
            SELECT id, name, email, role, status, license_key, last_login, created_at
            FROM users
            WHERE organization_id = $1
            ORDER BY 
                CASE status 
                    WHEN 'pending' THEN 1 
                    WHEN 'active' THEN 2 
                    WHEN 'suspended' THEN 3 
                END,
                name ASC
        `, [orgId]);
        
        res.json({ success: true, users: result.rows });
    } catch (error) {
        console.error('[ADMIN] List users error:', error);
        res.status(500).json({ success: false, error: 'Failed to load users' });
    }
});

// POST /api/admin/users/invite - Create new user with license
router.post('/users/invite', requireAdmin, async (req, res) => {
    try {
        const { name, email, role } = req.body;
        const orgId = req.session.org?.id || 1;
        const tenantId = req.session.org?.id || 1;
        
        if (!name || !email) {
            return res.status(400).json({ success: false, error: 'Name and email required' });
        }
        
        // Check if user already exists
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'User with this email already exists' });
        }
        
        // Generate license key
        const licenseKey = generateLicenseKey();
        const licenseExpires = new Date();
        licenseExpires.setDate(licenseExpires.getDate() + 7); // 7 day expiry
        
        // Create user with pending status
        const result = await pool.query(`
            INSERT INTO users (name, email, role, status, organization_id, tenant_id, license_key, license_expires, created_at)
            VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, NOW())
            RETURNING id, license_key
        `, [name, email.toLowerCase(), role || 'User', orgId, tenantId, licenseKey, licenseExpires]);
        
        const newUser = result.rows[0];
        
        // TODO: Send invitation email with license key
        // For now, we'll just return the license key
        let emailSent = false;
        
        console.log(`[ADMIN] Created user ${email} with license ${licenseKey}`);
        
        res.json({
            success: true,
            user_id: newUser.id,
            license_key: licenseKey,
            email_sent: emailSent
        });
    } catch (error) {
        console.error('[ADMIN] Invite user error:', error);
        res.status(500).json({ success: false, error: 'Failed to create invitation' });
    }
});

// POST /api/admin/users/:id/license - Generate new license for existing user
router.post('/users/:id/license', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const orgId = req.session.org?.id || 1;
        
        // Verify user belongs to org
        const user = await pool.query(
            'SELECT id, email, name FROM users WHERE id = $1 AND organization_id = $2',
            [userId, orgId]
        );
        
        if (user.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Generate new license
        const licenseKey = generateLicenseKey();
        const licenseExpires = new Date();
        licenseExpires.setDate(licenseExpires.getDate() + 7);
        
        await pool.query(`
            UPDATE users 
            SET license_key = $1, license_expires = $2
            WHERE id = $3
        `, [licenseKey, licenseExpires, userId]);
        
        // TODO: Send email with new license
        let emailSent = false;
        
        console.log(`[ADMIN] Generated new license for user ${userId}: ${licenseKey}`);
        
        res.json({
            success: true,
            license_key: licenseKey,
            email_sent: emailSent
        });
    } catch (error) {
        console.error('[ADMIN] Generate license error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate license' });
    }
});

// PUT /api/admin/users/:id/status - Update user status
router.put('/users/:id/status', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { status } = req.body;
        const orgId = req.session.org?.id || 1;
        
        if (!['active', 'pending', 'suspended'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        
        // Verify user belongs to org and isn't the current user
        const user = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
            [userId, orgId]
        );
        
        if (user.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        if (userId === req.session.user.id) {
            return res.status(400).json({ success: false, error: 'Cannot change your own status' });
        }
        
        await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2',
            [status, userId]
        );
        
        // If suspending, invalidate their sessions (Dead Man's Switch!)
        if (status === 'suspended') {
            // This will be handled by session middleware checking status
            console.log(`[ADMIN] User ${userId} suspended - sessions will be invalidated`);
        }
        
        console.log(`[ADMIN] Updated user ${userId} status to ${status}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Update status error:', error);
        res.status(500).json({ success: false, error: 'Failed to update status' });
    }
});

// PUT /api/admin/users/:id - Update user details
router.put('/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { name, role, status } = req.body;
        const orgId = req.session.org?.id || 1;
        
        // Verify user belongs to org
        const user = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
            [userId, orgId]
        );
        
        if (user.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        await pool.query(`
            UPDATE users 
            SET name = $1, role = $2, status = $3
            WHERE id = $4
        `, [name, role, status, userId]);
        
        console.log(`[ADMIN] Updated user ${userId}: ${name}, ${role}, ${status}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Update user error:', error);
        res.status(500).json({ success: false, error: 'Failed to update user' });
    }
});

// DELETE /api/admin/users/:id - Delete user (soft delete by setting status)
router.delete('/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const orgId = req.session.org?.id || 1;
        
        if (userId === req.session.user.id) {
            return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
        }
        
        // Verify user belongs to org
        const user = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
            [userId, orgId]
        );
        
        if (user.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Soft delete - set status to deleted
        await pool.query(
            "UPDATE users SET status = 'deleted' WHERE id = $1",
            [userId]
        );
        
        console.log(`[ADMIN] Deleted user ${userId}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Delete user error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
});

module.exports = router;
