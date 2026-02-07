/**
 * HUDDLE - Client Portal API Routes
 * 
 * External access for:
 * - Property Owners (communicate with PM team)
 * - Listing Clients (see activity on their listings)
 * - Buyers/Tenants (communicate with agents)
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE - Portal User Authentication
// ═══════════════════════════════════════════════════════════════════════════
const requirePortalAuth = (req, res, next) => {
    if (!req.session || !req.session.portalUser) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// ═══════════════════════════════════════════════════════════════════════════
// PORTAL AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════

// Portal Login
router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const result = await pool.query(`
            SELECT pu.*, t.name as tenant_name
            FROM huddle_portal_users pu
            JOIN tenants t ON pu.tenant_id = t.id
            WHERE pu.email = $1 AND pu.status = 'active'
        `, [email.toLowerCase()]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Update last login
        await pool.query(`
            UPDATE huddle_portal_users 
            SET last_login_at = NOW() 
            WHERE id = $1
        `, [user.id]);
        
        // Set session
        req.session.portalUser = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            portalType: user.portal_type,
            tenantId: user.tenant_id,
            assignedAgentId: user.assigned_agent_id
        };
        
        res.json({ 
            success: true, 
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                portalType: user.portal_type
            }
        });
    } catch (err) {
        console.error('Portal login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Portal Logout
router.post('/auth/logout', (req, res) => {
    req.session.portalUser = null;
    res.json({ success: true });
});

// Get current portal user
router.get('/auth/me', requirePortalAuth, (req, res) => {
    res.json({ success: true, user: req.session.portalUser });
});

// ═══════════════════════════════════════════════════════════════════════════
// PORTAL USER MANAGEMENT (for staff to create/manage portal users)
// ═══════════════════════════════════════════════════════════════════════════

// Create portal user (staff only)
router.post('/users', async (req, res) => {
    // Verify staff authentication
    if (!req.session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const tenantId = req.session.user.tenant_id;
        const { email, firstName, lastName, phone, portalType, assignedAgentId, leadId } = req.body;
        
        // Generate temporary password
        const tempPassword = Math.random().toString(36).substring(2, 10);
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        
        const result = await pool.query(`
            INSERT INTO huddle_portal_users 
            (tenant_id, email, password_hash, first_name, last_name, phone, portal_type, assigned_agent_id, lead_id, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'invited')
            RETURNING *
        `, [tenantId, email.toLowerCase(), passwordHash, firstName, lastName, phone, portalType, assignedAgentId, leadId]);
        
        // Create a channel for this portal user and their agent
        const workspace = await pool.query(`
            SELECT id FROM huddle_workspaces 
            WHERE tenant_id = $1 AND type = 'client_portal'
            LIMIT 1
        `, [tenantId]);
        
        let workspaceId;
        if (workspace.rows.length === 0) {
            // Create client portal workspace if doesn't exist
            const newWorkspace = await pool.query(`
                INSERT INTO huddle_workspaces (tenant_id, name, slug, type, icon)
                VALUES ($1, 'Client Portal', 'client-portal', 'client_portal', '🏠')
                RETURNING id
            `, [tenantId]);
            workspaceId = newWorkspace.rows[0].id;
        } else {
            workspaceId = workspace.rows[0].id;
        }
        
        // Create dedicated channel for this client
        const channelSlug = `client-${result.rows[0].id}`;
        const channelType = portalType === 'owner' ? 'client_owner' : 
                           portalType === 'seller' ? 'client_listing' : 'client_buyer';
        
        const channel = await pool.query(`
            INSERT INTO huddle_channels 
            (workspace_id, name, slug, type, icon, related_entity_type, related_entity_id)
            VALUES ($1, $2, $3, $4, $5, 'portal_user', $6)
            RETURNING id
        `, [workspaceId, `${firstName} ${lastName}`, channelSlug, channelType, '👤', result.rows[0].id]);
        
        // Add assigned agent to channel
        if (assignedAgentId) {
            await pool.query(`
                INSERT INTO huddle_channel_members (channel_id, user_id, role)
                VALUES ($1, $2, 'owner')
            `, [channel.rows[0].id, assignedAgentId]);
        }
        
        res.json({ 
            success: true, 
            user: result.rows[0],
            tempPassword, // Return so staff can share with client
            channelId: channel.rows[0].id
        });
    } catch (err) {
        console.error('Create portal user error:', err);
        res.status(500).json({ error: 'Failed to create portal user' });
    }
});

// List portal users (staff only)
router.get('/users', async (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const tenantId = req.session.user.tenant_id;
        const { type, status } = req.query;
        
        let query = `
            SELECT pu.*, 
                   u.first_name as agent_first_name, u.last_name as agent_last_name,
                   (SELECT COUNT(*) FROM huddle_activity_feed af WHERE af.portal_user_id = pu.id AND af.is_read = false) as unread_activity
            FROM huddle_portal_users pu
            LEFT JOIN users u ON pu.assigned_agent_id = u.id
            WHERE pu.tenant_id = $1
        `;
        const params = [tenantId];
        
        if (type) {
            query += ` AND pu.portal_type = $${params.length + 1}`;
            params.push(type);
        }
        
        if (status) {
            query += ` AND pu.status = $${params.length + 1}`;
            params.push(status);
        }
        
        query += ` ORDER BY pu.created_at DESC`;
        
        const result = await pool.query(query, params);
        
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error('List portal users error:', err);
        res.status(500).json({ error: 'Failed to list portal users' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PORTAL USER - PROPERTIES
// ═══════════════════════════════════════════════════════════════════════════

// Get portal user's properties
router.get('/my/properties', requirePortalAuth, async (req, res) => {
    try {
        const portalUserId = req.session.portalUser.id;
        
        const result = await pool.query(`
            SELECT pp.*, 
                   c.id as channel_id,
                   (SELECT COUNT(*) FROM huddle_activity_feed af 
                    WHERE af.portal_property_id = pp.id AND af.is_read = false) as unread_activity
            FROM huddle_portal_properties pp
            LEFT JOIN huddle_channels c ON c.related_entity_type = 'property' 
                AND c.related_entity_id = pp.id
            WHERE pp.portal_user_id = $1
            ORDER BY pp.created_at DESC
        `, [portalUserId]);
        
        res.json({ success: true, properties: result.rows });
    } catch (err) {
        console.error('Get properties error:', err);
        res.status(500).json({ error: 'Failed to get properties' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PORTAL USER - ACTIVITY FEED
// ═══════════════════════════════════════════════════════════════════════════

// Get activity feed
router.get('/my/activity', requirePortalAuth, async (req, res) => {
    try {
        const portalUserId = req.session.portalUser.id;
        const { propertyId, limit = 50 } = req.query;
        
        let query = `
            SELECT af.*, pp.property_name, pp.property_address
            FROM huddle_activity_feed af
            LEFT JOIN huddle_portal_properties pp ON af.portal_property_id = pp.id
            WHERE af.portal_user_id = $1
        `;
        const params = [portalUserId];
        
        if (propertyId) {
            query += ` AND af.portal_property_id = $${params.length + 1}`;
            params.push(propertyId);
        }
        
        query += ` ORDER BY af.created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));
        
        const result = await pool.query(query, params);
        
        res.json({ success: true, activity: result.rows });
    } catch (err) {
        console.error('Get activity error:', err);
        res.status(500).json({ error: 'Failed to get activity' });
    }
});

// Mark activity as read
router.post('/my/activity/:activityId/read', requirePortalAuth, async (req, res) => {
    try {
        const portalUserId = req.session.portalUser.id;
        const { activityId } = req.params;
        
        await pool.query(`
            UPDATE huddle_activity_feed 
            SET is_read = true, read_at = NOW()
            WHERE id = $1 AND portal_user_id = $2
        `, [activityId, portalUserId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Mark activity read error:', err);
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PORTAL USER - MESSAGES (Chat with agent)
// ═══════════════════════════════════════════════════════════════════════════

// Get portal user's chat channel
router.get('/my/channel', requirePortalAuth, async (req, res) => {
    try {
        const portalUserId = req.session.portalUser.id;
        
        const result = await pool.query(`
            SELECT c.*, 
                   u.first_name as agent_first_name, 
                   u.last_name as agent_last_name,
                   u.avatar as agent_avatar
            FROM huddle_channels c
            JOIN huddle_channel_members cm ON c.id = cm.channel_id
            JOIN users u ON cm.user_id = u.id
            WHERE c.related_entity_type = 'portal_user' 
            AND c.related_entity_id = $1
            LIMIT 1
        `, [portalUserId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }
        
        res.json({ success: true, channel: result.rows[0] });
    } catch (err) {
        console.error('Get channel error:', err);
        res.status(500).json({ error: 'Failed to get channel' });
    }
});

// Get messages from portal user's channel
router.get('/my/messages', requirePortalAuth, async (req, res) => {
    try {
        const portalUserId = req.session.portalUser.id;
        const { before, limit = 50 } = req.query;
        
        // Get the channel for this portal user
        const channel = await pool.query(`
            SELECT id FROM huddle_channels 
            WHERE related_entity_type = 'portal_user' AND related_entity_id = $1
        `, [portalUserId]);
        
        if (channel.rows.length === 0) {
            return res.json({ success: true, messages: [] });
        }
        
        const channelId = channel.rows[0].id;
        
        let query = `
            SELECT m.*, 
                   u.first_name, u.last_name, u.avatar,
                   'staff' as sender_type
            FROM huddle_messages m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE m.channel_id = $1
            AND m.is_deleted = false
        `;
        const params = [channelId];
        
        if (before) {
            query += ` AND m.created_at < $${params.length + 1}`;
            params.push(before);
        }
        
        query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));
        
        const result = await pool.query(query, params);
        
        res.json({ success: true, messages: result.rows.reverse() });
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Send message from portal user
router.post('/my/messages', requirePortalAuth, async (req, res) => {
    try {
        const portalUserId = req.session.portalUser.id;
        const portalUser = req.session.portalUser;
        const { content } = req.body;
        
        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Message content required' });
        }
        
        // Get the channel for this portal user
        const channel = await pool.query(`
            SELECT id FROM huddle_channels 
            WHERE related_entity_type = 'portal_user' AND related_entity_id = $1
        `, [portalUserId]);
        
        if (channel.rows.length === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }
        
        const channelId = channel.rows[0].id;
        
        // Portal users don't have a user_id in the main users table
        // We'll store the message with metadata indicating it's from a portal user
        const result = await pool.query(`
            INSERT INTO huddle_messages 
            (channel_id, user_id, content, metadata)
            VALUES ($1, NULL, $2, $3)
            RETURNING *
        `, [channelId, content.trim(), JSON.stringify({
            portal_user_id: portalUserId,
            portal_user_name: `${portalUser.firstName} ${portalUser.lastName}`,
            portal_user_type: portalUser.portalType
        })]);
        
        // Notify assigned agent
        if (portalUser.assignedAgentId) {
            await pool.query(`
                INSERT INTO huddle_notifications (user_id, type, title, body, link_type, link_id)
                VALUES ($1, 'message', $2, $3, 'channel', $4)
            `, [
                portalUser.assignedAgentId, 
                `New message from ${portalUser.firstName} ${portalUser.lastName}`,
                content.substring(0, 100),
                channelId
            ]);
        }
        
        res.json({ success: true, message: result.rows[0] });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STAFF - ADD ACTIVITY TO CLIENT PORTAL
// ═══════════════════════════════════════════════════════════════════════════

// Add activity to a portal user's feed (staff only)
router.post('/activity', async (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const { portalUserId, portalPropertyId, activityType, title, description, metadata } = req.body;
        const staffUserId = req.session.user.id;
        
        const result = await pool.query(`
            INSERT INTO huddle_activity_feed 
            (portal_user_id, portal_property_id, activity_type, title, description, metadata, triggered_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [portalUserId, portalPropertyId, activityType, title, description, JSON.stringify(metadata || {}), staffUserId]);
        
        // Create notification for portal user
        await pool.query(`
            INSERT INTO huddle_notifications (portal_user_id, type, title, body, link_type, link_id)
            VALUES ($1, 'activity', $2, $3, 'activity', $4)
        `, [portalUserId, title, description, result.rows[0].id]);
        
        res.json({ success: true, activity: result.rows[0] });
    } catch (err) {
        console.error('Add activity error:', err);
        res.status(500).json({ error: 'Failed to add activity' });
    }
});

// Activity type presets for convenience
router.get('/activity-types', (req, res) => {
    res.json({
        success: true,
        types: [
            { value: 'showing_scheduled', label: 'Showing Scheduled', icon: '📅' },
            { value: 'showing_completed', label: 'Showing Completed', icon: '✅' },
            { value: 'inquiry_received', label: 'Inquiry Received', icon: '❓' },
            { value: 'offer_received', label: 'Offer Received', icon: '💰' },
            { value: 'offer_accepted', label: 'Offer Accepted', icon: '🎉' },
            { value: 'price_change', label: 'Price Change', icon: '💲' },
            { value: 'status_change', label: 'Status Change', icon: '🔄' },
            { value: 'document_added', label: 'Document Added', icon: '📄' },
            { value: 'message_received', label: 'Message Received', icon: '💬' },
            { value: 'maintenance_request', label: 'Maintenance Request', icon: '🔧' },
            { value: 'maintenance_completed', label: 'Maintenance Completed', icon: '✅' },
            { value: 'rent_received', label: 'Rent Received', icon: '💵' },
            { value: 'lease_expiring', label: 'Lease Expiring Soon', icon: '⚠️' },
            { value: 'tenant_notice', label: 'Tenant Notice', icon: '📋' },
            { value: 'inspection_scheduled', label: 'Inspection Scheduled', icon: '🔍' },
            { value: 'market_update', label: 'Market Update', icon: '📊' },
        ]
    });
});

module.exports = router;
