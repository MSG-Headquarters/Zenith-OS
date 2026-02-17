/**
 * WebSocket Notification Service
 * Real-time notifications for Zenith OS
 */

const WebSocket = require('ws');
const { Pool } = require('pg');

class NotificationService {
    constructor(server) {
        this.wss = new WebSocket.Server({ server, path: '/ws/notifications' });
        this.clients = new Map(); // Map<userId, Set<WebSocket>>
        this.pool = new Pool({ 
            connectionString: process.env.DATABASE_URL, 
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false 
        });
        
        this.setupWebSocket();
        console.log('[WS] Notification service initialized');
    }
    
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            console.log('[WS] New connection attempt');
            
            // Extract user info from query string (will be set by client)
            const url = new URL(req.url, 'http://localhost');
            const userId = parseInt(url.searchParams.get('userId'));
            const orgId = parseInt(url.searchParams.get('orgId'));
            
            if (!userId || !orgId) {
                console.log('[WS] Connection rejected - no user/org ID');
                ws.close(4001, 'Authentication required');
                return;
            }
            
            // Store connection
            ws.userId = userId;
            ws.orgId = orgId;
            ws.isAlive = true;
            
            if (!this.clients.has(userId)) {
                this.clients.set(userId, new Set());
            }
            this.clients.get(userId).add(ws);
            
            console.log(`[WS] User ${userId} connected. Total connections: ${this.clients.get(userId).size}`);
            
            // Send pending notifications on connect
            this.sendPendingNotifications(ws, userId);
            
            // Handle incoming messages
            ws.on('message', (data) => this.handleMessage(ws, data));
            
            // Handle pong for keepalive
            ws.on('pong', () => { ws.isAlive = true; });
            
            // Handle disconnect
            ws.on('close', () => {
                const userClients = this.clients.get(userId);
                if (userClients) {
                    userClients.delete(ws);
                    if (userClients.size === 0) {
                        this.clients.delete(userId);
                    }
                }
                console.log(`[WS] User ${userId} disconnected`);
            });
            
            // Send welcome message
            ws.send(JSON.stringify({ 
                type: 'connected', 
                message: 'Notification service connected',
                userId: userId 
            }));
        });
        
        // Keepalive ping every 30 seconds
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) return ws.terminate();
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }
    
    async handleMessage(ws, data) {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'mark_read':
                    await this.markAsRead(message.notificationId, ws.userId);
                    break;
                case 'dismiss':
                    await this.dismiss(message.notificationId, ws.userId);
                    break;
                case 'resolve':
                    await this.resolve(message.notificationId, ws.userId);
                    break;
                case 'chat_response':
                    await this.handleChatResponse(ws, message);
                    break;
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (e) {
            console.error('[WS] Message handling error:', e);
        }
    }
    
    async sendPendingNotifications(ws, userId) {
        try {
            const result = await this.pool.query(`
                SELECT * FROM notifications 
                WHERE user_id = $1 
                  AND dismissed_at IS NULL 
                  AND resolved_at IS NULL
                  AND (expires_at IS NULL OR expires_at > NOW())
                ORDER BY created_at DESC
                LIMIT 20
            `, [userId]);
            
            if (result.rows.length > 0) {
                ws.send(JSON.stringify({
                    type: 'pending_notifications',
                    notifications: result.rows
                }));
            }
        } catch (e) {
            console.error('[WS] Error fetching pending notifications:', e);
        }
    }
    
    // Send notification to specific user(s)
    async notify(userIds, notification) {
        const userIdArray = Array.isArray(userIds) ? userIds : [userIds];
        
        for (const userId of userIdArray) {
            try {
                // Save to database
                const result = await this.pool.query(`
                    INSERT INTO notifications 
                    (user_id, organization_id, type, title, message, data, source_type, source_id, 
                     priority, requires_action, action_type, action_label, action_url, timeout_seconds, expires_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    RETURNING *
                `, [
                    userId,
                    notification.organizationId || 1,
                    notification.type || 'info',
                    notification.title,
                    notification.message || null,
                    JSON.stringify(notification.data || {}),
                    notification.sourceType || null,
                    notification.sourceId || null,
                    notification.priority || 'normal',
                    notification.requiresAction || false,
                    notification.actionType || null,
                    notification.actionLabel || null,
                    notification.actionUrl || null,
                    notification.timeoutSeconds || null,
                    notification.expiresAt || null
                ]);
                
                const savedNotification = result.rows[0];
                
                // Send via WebSocket if user is connected
                const userClients = this.clients.get(userId);
                if (userClients && userClients.size > 0) {
                    const payload = JSON.stringify({
                        type: 'notification',
                        notification: savedNotification
                    });
                    
                    userClients.forEach(ws => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(payload);
                        }
                    });
                    console.log(`[WS] Notification sent to user ${userId}: ${notification.title}`);
                } else {
                    console.log(`[WS] User ${userId} not connected, notification saved for later`);
                }
                
            } catch (e) {
                console.error(`[WS] Error sending notification to user ${userId}:`, e);
            }
        }
    }
    
    // Notify all users with a specific role in an organization
    async notifyByRole(orgId, roles, notification) {
        try {
            const roleArray = Array.isArray(roles) ? roles : [roles];
            const result = await this.pool.query(`
                SELECT DISTINCT u.id 
                FROM users u
                JOIN user_roles ur ON u.id = ur.user_id
                JOIN roles r ON ur.role_id = r.id
                WHERE u.organization_id = $1 
                  AND r.slug = ANY($2)
                  AND u.status = 'active'
            `, [orgId, roleArray]);
            
            const userIds = result.rows.map(r => r.id);
            if (userIds.length > 0) {
                await this.notify(userIds, { ...notification, organizationId: orgId });
            }
            return userIds;
        } catch (e) {
            console.error('[WS] Error notifying by role:', e);
            return [];
        }
    }
    
    // Notify users by job title pattern
    async notifyByTitle(orgId, titlePattern, notification) {
        try {
            const result = await this.pool.query(`
                SELECT id FROM users 
                WHERE organization_id = $1 
                  AND (role ILIKE $2 OR role ILIKE $3)
                  AND status = 'active'
            `, [orgId, `%${titlePattern}%`, `%marketing%`]);
            
            const userIds = result.rows.map(r => r.id);
            if (userIds.length > 0) {
                await this.notify(userIds, { ...notification, organizationId: orgId });
            }
            return userIds;
        } catch (e) {
            console.error('[WS] Error notifying by title:', e);
            return [];
        }
    }
    
    async markAsRead(notificationId, userId) {
        await this.pool.query(
            `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2`,
            [notificationId, userId]
        );
    }
    
    async dismiss(notificationId, userId) {
        await this.pool.query(
            `UPDATE notifications SET dismissed_at = NOW() WHERE id = $1 AND user_id = $2`,
            [notificationId, userId]
        );
        
        // Notify client to remove the notification
        const userClients = this.clients.get(userId);
        if (userClients) {
            const payload = JSON.stringify({ type: 'notification_dismissed', notificationId });
            userClients.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) ws.send(payload);
            });
        }
    }
    
    async resolve(notificationId, userId) {
        await this.pool.query(
            `UPDATE notifications SET resolved_at = NOW(), resolved_by = $2 WHERE id = $1`,
            [notificationId, userId]
        );
        
        const userClients = this.clients.get(userId);
        if (userClients) {
            const payload = JSON.stringify({ type: 'notification_resolved', notificationId });
            userClients.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) ws.send(payload);
            });
        }
    }
    
    async handleChatResponse(ws, message) {
        // Handle inline chat responses from notification bubble
        const { notificationId, response, sourceType, sourceId } = message;
        
        if (sourceType === 'intel_project') {
            // Add comment to INTEL project
            await this.pool.query(`
                INSERT INTO intel_comments (project_id, user_id, message, is_from_marketing)
                VALUES ($1, $2, $3, true)
            `, [sourceId, ws.userId, response]);
            
            // Notify the original requester
            const project = await this.pool.query(
                `SELECT created_by, title FROM intel_projects WHERE id = $1`,
                [sourceId]
            );
            
            if (project.rows.length > 0 && project.rows[0].created_by !== ws.userId) {
                await this.notify(project.rows[0].created_by, {
                    type: 'chat_message',
                    title: 'New message on flyer',
                    message: response.substring(0, 100),
                    sourceType: 'intel_project',
                    sourceId: sourceId,
                    actionUrl: `/intel/create?project=${sourceId}`,
                    timeoutSeconds: 10
                });
            }
        }
        
        // Mark original notification as read
        await this.markAsRead(notificationId, ws.userId);
    }
    
    // Get unread count for a user
    async getUnreadCount(userId) {
        const result = await this.pool.query(`
            SELECT COUNT(*) as count FROM notifications 
            WHERE user_id = $1 AND read_at IS NULL AND dismissed_at IS NULL AND resolved_at IS NULL
        `, [userId]);
        return parseInt(result.rows[0].count);
    }
}

module.exports = NotificationService;
