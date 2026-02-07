/**
 * HUDDLE - API Routes
 * 
 * Internal Messaging + Client Portal System
 * Supports: Channels, DMs, Threads, File Sharing, Client Portals
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Portal user auth (for client portal)
const requirePortalAuth = (req, res, next) => {
    if (!req.session || !req.session.portalUser) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Either internal or portal user
const requireAnyAuth = (req, res, next) => {
    if (req.session?.user || req.session?.portalUser) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
};

// ═══════════════════════════════════════════════════════════════════════════
// WORKSPACES
// ═══════════════════════════════════════════════════════════════════════════

// Get all workspaces for user
router.get('/workspaces', requireAuth, async (req, res) => {
    try {
        const tenantId = req.session.user.tenant_id;
        
        const result = await pool.query(`
            SELECT * FROM huddle_workspaces 
            WHERE tenant_id = $1 
            ORDER BY type, name
        `, [tenantId]);
        
        res.json({ success: true, workspaces: result.rows });
    } catch (err) {
        console.error('Workspaces error:', err);
        res.status(500).json({ error: 'Failed to fetch workspaces' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CHANNELS
// ═══════════════════════════════════════════════════════════════════════════

// Get channels for a workspace
router.get('/workspace/:workspaceId/channels', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { workspaceId } = req.params;
        
        const result = await pool.query(`
            SELECT c.*, 
                   cm.last_read_at,
                   (SELECT COUNT(*) FROM huddle_messages m 
                    WHERE m.channel_id = c.id 
                    AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')) as unread_count
            FROM huddle_channels c
            LEFT JOIN huddle_channel_members cm ON c.id = cm.channel_id AND cm.user_id = $1
            WHERE c.workspace_id = $2
            AND c.is_archived = false
            AND (c.type = 'public' OR cm.user_id IS NOT NULL)
            ORDER BY c.is_default DESC, c.name
        `, [userId, workspaceId]);
        
        res.json({ success: true, channels: result.rows });
    } catch (err) {
        console.error('Channels error:', err);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// Get all channels user has access to
router.get('/channels', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const tenantId = req.session.user.tenant_id;
        
        const result = await pool.query(`
            SELECT c.*, w.name as workspace_name, w.slug as workspace_slug,
                   cm.last_read_at,
                   (SELECT COUNT(*) FROM huddle_messages m 
                    WHERE m.channel_id = c.id 
                    AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')) as unread_count
            FROM huddle_channels c
            JOIN huddle_workspaces w ON c.workspace_id = w.id
            LEFT JOIN huddle_channel_members cm ON c.id = cm.channel_id AND cm.user_id = $1
            WHERE w.tenant_id = $2
            AND c.is_archived = false
            AND (c.type = 'public' OR cm.user_id IS NOT NULL)
            ORDER BY w.name, c.is_default DESC, c.name
        `, [userId, tenantId]);
        
        res.json({ success: true, channels: result.rows });
    } catch (err) {
        console.error('Channels error:', err);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// Create channel
router.post('/channels', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { workspaceId, name, description, type, icon } = req.body;
        
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        const result = await pool.query(`
            INSERT INTO huddle_channels (workspace_id, name, slug, description, type, icon, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [workspaceId, name, slug, description, type || 'public', icon || '💬', userId]);
        
        // Add creator as channel owner
        await pool.query(`
            INSERT INTO huddle_channel_members (channel_id, user_id, role)
            VALUES ($1, $2, 'owner')
        `, [result.rows[0].id, userId]);
        
        res.json({ success: true, channel: result.rows[0] });
    } catch (err) {
        console.error('Create channel error:', err);
        res.status(500).json({ error: 'Failed to create channel' });
    }
});

// Join channel
router.post('/channels/:channelId/join', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { channelId } = req.params;
        
        await pool.query(`
            INSERT INTO huddle_channel_members (channel_id, user_id, role)
            VALUES ($1, $2, 'member')
            ON CONFLICT (channel_id, user_id) DO NOTHING
        `, [channelId, userId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Join channel error:', err);
        res.status(500).json({ error: 'Failed to join channel' });
    }
});

// Leave channel
router.post('/channels/:channelId/leave', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { channelId } = req.params;
        
        await pool.query(`
            DELETE FROM huddle_channel_members 
            WHERE channel_id = $1 AND user_id = $2
        `, [channelId, userId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Leave channel error:', err);
        res.status(500).json({ error: 'Failed to leave channel' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

// Get messages for a channel
router.get('/channels/:channelId/messages', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { channelId } = req.params;
        const { before, limit = 50 } = req.query;
        
        let query = `
            SELECT m.*, 
                   u.first_name, u.last_name, u.email, u.avatar,
                   (SELECT json_agg(json_build_object('emoji', r.emoji, 'user_id', r.user_id))
                    FROM huddle_reactions r WHERE r.message_id = m.id) as reactions,
                   (SELECT json_agg(json_build_object('id', a.id, 'file_name', a.file_name, 'file_type', a.file_type, 'file_url', a.file_url))
                    FROM huddle_attachments a WHERE a.message_id = m.id) as attachments
            FROM huddle_messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.channel_id = $1
            AND m.is_deleted = false
            AND m.thread_parent_id IS NULL
        `;
        
        const params = [channelId];
        
        if (before) {
            query += ` AND m.created_at < $${params.length + 1}`;
            params.push(before);
        }
        
        query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));
        
        const result = await pool.query(query, params);
        
        // Mark channel as read
        await pool.query(`
            UPDATE huddle_channel_members 
            SET last_read_at = NOW() 
            WHERE channel_id = $1 AND user_id = $2
        `, [channelId, userId]);
        
        res.json({ success: true, messages: result.rows.reverse() });
    } catch (err) {
        console.error('Messages error:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Send message to channel
router.post('/channels/:channelId/messages', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { channelId } = req.params;
        const { content, threadParentId } = req.body;
        
        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Message content required' });
        }
        
        // Insert message
        const result = await pool.query(`
            INSERT INTO huddle_messages (channel_id, user_id, content, thread_parent_id)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [channelId, userId, content.trim(), threadParentId || null]);
        
        const message = result.rows[0];
        
        // If this is a thread reply, update parent's reply count
        if (threadParentId) {
            await pool.query(`
                UPDATE huddle_messages 
                SET thread_reply_count = thread_reply_count + 1,
                    thread_last_reply_at = NOW()
                WHERE id = $1
            `, [threadParentId]);
        }
        
        // Process @mentions
        const mentionRegex = /@(\w+)/g;
        let match;
        while ((match = mentionRegex.exec(content)) !== null) {
            const username = match[1];
            // Find user by username or name
            const userResult = await pool.query(`
                SELECT id FROM users 
                WHERE LOWER(first_name) = LOWER($1) 
                OR LOWER(CONCAT(first_name, last_name)) = LOWER($1)
                LIMIT 1
            `, [username]);
            
            if (userResult.rows.length > 0) {
                await pool.query(`
                    INSERT INTO huddle_mentions (message_id, user_id)
                    VALUES ($1, $2)
                `, [message.id, userResult.rows[0].id]);
                
                // Create notification
                await pool.query(`
                    INSERT INTO huddle_notifications (user_id, type, title, body, link_type, link_id)
                    VALUES ($1, 'mention', 'You were mentioned', $2, 'channel', $3)
                `, [userResult.rows[0].id, content.substring(0, 100), channelId]);
            }
        }
        
        // Get full message with user info
        const fullMessage = await pool.query(`
            SELECT m.*, u.first_name, u.last_name, u.email, u.avatar
            FROM huddle_messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.id = $1
        `, [message.id]);
        
        res.json({ success: true, message: fullMessage.rows[0] });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Edit message
router.put('/messages/:messageId', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { messageId } = req.params;
        const { content } = req.body;
        
        const result = await pool.query(`
            UPDATE huddle_messages 
            SET content = $1, is_edited = true, edited_at = NOW()
            WHERE id = $2 AND user_id = $3
            RETURNING *
        `, [content, messageId, userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found or not authorized' });
        }
        
        res.json({ success: true, message: result.rows[0] });
    } catch (err) {
        console.error('Edit message error:', err);
        res.status(500).json({ error: 'Failed to edit message' });
    }
});

// Delete message
router.delete('/messages/:messageId', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { messageId } = req.params;
        
        await pool.query(`
            UPDATE huddle_messages 
            SET is_deleted = true, deleted_at = NOW()
            WHERE id = $1 AND user_id = $2
        `, [messageId, userId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete message error:', err);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Add reaction to message
router.post('/messages/:messageId/reactions', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { messageId } = req.params;
        const { emoji } = req.body;
        
        await pool.query(`
            INSERT INTO huddle_reactions (message_id, user_id, emoji)
            VALUES ($1, $2, $3)
            ON CONFLICT (message_id, user_id, emoji) DO NOTHING
        `, [messageId, userId, emoji]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Add reaction error:', err);
        res.status(500).json({ error: 'Failed to add reaction' });
    }
});

// Remove reaction
router.delete('/messages/:messageId/reactions/:emoji', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { messageId, emoji } = req.params;
        
        await pool.query(`
            DELETE FROM huddle_reactions 
            WHERE message_id = $1 AND user_id = $2 AND emoji = $3
        `, [messageId, userId, emoji]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Remove reaction error:', err);
        res.status(500).json({ error: 'Failed to remove reaction' });
    }
});

// Get thread replies
router.get('/messages/:messageId/thread', requireAuth, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        const result = await pool.query(`
            SELECT m.*, u.first_name, u.last_name, u.email, u.avatar
            FROM huddle_messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.thread_parent_id = $1
            AND m.is_deleted = false
            ORDER BY m.created_at ASC
        `, [messageId]);
        
        res.json({ success: true, replies: result.rows });
    } catch (err) {
        console.error('Thread error:', err);
        res.status(500).json({ error: 'Failed to fetch thread' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DIRECT MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

// Get user's DM conversations
router.get('/direct', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        const result = await pool.query(`
            SELECT c.*, 
                   dp.last_read_at,
                   (SELECT json_agg(json_build_object(
                       'user_id', u.id, 
                       'first_name', u.first_name, 
                       'last_name', u.last_name,
                       'avatar', u.avatar
                   ))
                    FROM huddle_direct_participants dp2 
                    JOIN users u ON dp2.user_id = u.id
                    WHERE dp2.conversation_id = c.id AND dp2.user_id != $1
                   ) as participants,
                   (SELECT content FROM huddle_direct_messages 
                    WHERE conversation_id = c.id 
                    ORDER BY created_at DESC LIMIT 1) as last_message,
                   (SELECT COUNT(*) FROM huddle_direct_messages dm
                    WHERE dm.conversation_id = c.id 
                    AND dm.created_at > COALESCE(dp.last_read_at, '1970-01-01')) as unread_count
            FROM huddle_direct_conversations c
            JOIN huddle_direct_participants dp ON c.id = dp.conversation_id AND dp.user_id = $1
            ORDER BY c.last_message_at DESC NULLS LAST
        `, [userId]);
        
        res.json({ success: true, conversations: result.rows });
    } catch (err) {
        console.error('DM list error:', err);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Start or get existing DM conversation
router.post('/direct/start', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const tenantId = req.session.user.tenant_id;
        const { recipientId } = req.body;
        
        // Check if conversation already exists
        const existing = await pool.query(`
            SELECT c.* FROM huddle_direct_conversations c
            JOIN huddle_direct_participants dp1 ON c.id = dp1.conversation_id AND dp1.user_id = $1
            JOIN huddle_direct_participants dp2 ON c.id = dp2.conversation_id AND dp2.user_id = $2
            WHERE c.type = 'direct'
        `, [userId, recipientId]);
        
        if (existing.rows.length > 0) {
            return res.json({ success: true, conversation: existing.rows[0], existing: true });
        }
        
        // Create new conversation
        const conv = await pool.query(`
            INSERT INTO huddle_direct_conversations (tenant_id, type)
            VALUES ($1, 'direct')
            RETURNING *
        `, [tenantId]);
        
        // Add both participants
        await pool.query(`
            INSERT INTO huddle_direct_participants (conversation_id, user_id)
            VALUES ($1, $2), ($1, $3)
        `, [conv.rows[0].id, userId, recipientId]);
        
        res.json({ success: true, conversation: conv.rows[0], existing: false });
    } catch (err) {
        console.error('Start DM error:', err);
        res.status(500).json({ error: 'Failed to start conversation' });
    }
});

// Get DM messages
router.get('/direct/:conversationId/messages', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { conversationId } = req.params;
        const { before, limit = 50 } = req.query;
        
        // Verify user is participant
        const participant = await pool.query(`
            SELECT * FROM huddle_direct_participants 
            WHERE conversation_id = $1 AND user_id = $2
        `, [conversationId, userId]);
        
        if (participant.rows.length === 0) {
            return res.status(403).json({ error: 'Not a participant' });
        }
        
        let query = `
            SELECT m.*, u.first_name, u.last_name, u.email, u.avatar
            FROM huddle_direct_messages m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE m.conversation_id = $1
            AND m.is_deleted = false
        `;
        
        const params = [conversationId];
        
        if (before) {
            query += ` AND m.created_at < $${params.length + 1}`;
            params.push(before);
        }
        
        query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));
        
        const result = await pool.query(query, params);
        
        // Mark as read
        await pool.query(`
            UPDATE huddle_direct_participants 
            SET last_read_at = NOW() 
            WHERE conversation_id = $1 AND user_id = $2
        `, [conversationId, userId]);
        
        res.json({ success: true, messages: result.rows.reverse() });
    } catch (err) {
        console.error('DM messages error:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Send DM
router.post('/direct/:conversationId/messages', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { conversationId } = req.params;
        const { content } = req.body;
        
        // Insert message
        const result = await pool.query(`
            INSERT INTO huddle_direct_messages (conversation_id, user_id, content)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [conversationId, userId, content.trim()]);
        
        // Update conversation last_message_at
        await pool.query(`
            UPDATE huddle_direct_conversations 
            SET last_message_at = NOW() 
            WHERE id = $1
        `, [conversationId]);
        
        // Get full message with user info
        const fullMessage = await pool.query(`
            SELECT m.*, u.first_name, u.last_name, u.email, u.avatar
            FROM huddle_direct_messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.id = $1
        `, [result.rows[0].id]);
        
        // Notify other participants
        const others = await pool.query(`
            SELECT user_id FROM huddle_direct_participants 
            WHERE conversation_id = $1 AND user_id != $2
        `, [conversationId, userId]);
        
        for (const other of others.rows) {
            await pool.query(`
                INSERT INTO huddle_notifications (user_id, type, title, body, link_type, link_id)
                VALUES ($1, 'message', 'New message', $2, 'direct', $3)
            `, [other.user_id, content.substring(0, 100), conversationId]);
        }
        
        res.json({ success: true, message: fullMessage.rows[0] });
    } catch (err) {
        console.error('Send DM error:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get notifications
router.get('/notifications', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { unreadOnly = false, limit = 20 } = req.query;
        
        let query = `
            SELECT * FROM huddle_notifications 
            WHERE user_id = $1
        `;
        
        if (unreadOnly === 'true') {
            query += ` AND is_read = false`;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $2`;
        
        const result = await pool.query(query, [userId, parseInt(limit)]);
        
        // Get unread count
        const unreadCount = await pool.query(`
            SELECT COUNT(*) FROM huddle_notifications 
            WHERE user_id = $1 AND is_read = false
        `, [userId]);
        
        res.json({ 
            success: true, 
            notifications: result.rows,
            unreadCount: parseInt(unreadCount.rows[0].count)
        });
    } catch (err) {
        console.error('Notifications error:', err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark notification as read
router.post('/notifications/:notificationId/read', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { notificationId } = req.params;
        
        await pool.query(`
            UPDATE huddle_notifications 
            SET is_read = true, read_at = NOW()
            WHERE id = $1 AND user_id = $2
        `, [notificationId, userId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

// Mark all notifications as read
router.post('/notifications/read-all', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        await pool.query(`
            UPDATE huddle_notifications 
            SET is_read = true, read_at = NOW()
            WHERE user_id = $1 AND is_read = false
        `, [userId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Mark all read error:', err);
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// USERS - For @mentions and member lists
// ═══════════════════════════════════════════════════════════════════════════

// Search users for mentions
router.get('/users/search', requireAuth, async (req, res) => {
    try {
        const tenantId = req.session.user.tenant_id;
        const { q } = req.query;
        
        const result = await pool.query(`
            SELECT id, first_name, last_name, email, avatar
            FROM users 
            WHERE tenant_id = $1
            AND (
                LOWER(first_name) LIKE LOWER($2) 
                OR LOWER(last_name) LIKE LOWER($2)
                OR LOWER(email) LIKE LOWER($2)
            )
            LIMIT 10
        `, [tenantId, `%${q}%`]);
        
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error('User search error:', err);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// Get online users
router.get('/users/online', requireAuth, async (req, res) => {
    try {
        const tenantId = req.session.user.tenant_id;
        
        // In a real implementation, this would check a presence system
        // For now, return users active in last 5 minutes
        const result = await pool.query(`
            SELECT id, first_name, last_name, avatar
            FROM users 
            WHERE tenant_id = $1
            AND last_activity_at > NOW() - INTERVAL '5 minutes'
        `, [tenantId]);
        
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error('Online users error:', err);
        res.status(500).json({ error: 'Failed to get online users' });
    }
});

module.exports = router;
