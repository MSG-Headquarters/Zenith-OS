-- ═══════════════════════════════════════════════════════════════════════════
-- HUDDLE - Complete Database Schema
-- Internal Messaging + Client Portal System
-- Main Street Group Technology Division
-- © 2026 All Rights Reserved
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- WORKSPACES - Top level organization (Internal vs Client portals)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_workspaces (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'internal', -- 'internal', 'client_portal'
    description TEXT,
    icon VARCHAR(10) DEFAULT '🏢',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, slug)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CHANNELS - Conversation spaces within workspaces
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_channels (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES huddle_workspaces(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(30) NOT NULL DEFAULT 'public', 
    -- Types: 'public', 'private', 'direct', 'client_owner', 'client_listing', 'client_buyer'
    icon VARCHAR(10) DEFAULT '💬',
    is_default BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    
    -- For client channels, link to related entity
    related_entity_type VARCHAR(50), -- 'property', 'listing', 'lead', 'owner'
    related_entity_id INTEGER,
    
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, slug)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CHANNEL MEMBERS - Who has access to each channel
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_channel_members (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES huddle_channels(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member', -- 'owner', 'admin', 'member', 'guest'
    notifications VARCHAR(20) DEFAULT 'all', -- 'all', 'mentions', 'none'
    last_read_at TIMESTAMP,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_id, user_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- MESSAGES - The actual communications
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_messages (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES huddle_channels(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    
    -- Message content
    content TEXT NOT NULL,
    content_type VARCHAR(20) DEFAULT 'text', -- 'text', 'file', 'image', 'system'
    
    -- Threading support
    thread_parent_id INTEGER REFERENCES huddle_messages(id) ON DELETE CASCADE,
    thread_reply_count INTEGER DEFAULT 0,
    thread_last_reply_at TIMESTAMP,
    
    -- Metadata
    metadata JSONB DEFAULT '{}', -- For rich content, link previews, etc.
    
    -- Edit/Delete tracking
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- MESSAGE ATTACHMENTS - Files shared in messages
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_attachments (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES huddle_messages(id) ON DELETE CASCADE,
    
    -- File info
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    file_url TEXT NOT NULL,
    
    -- Link to Vault document if applicable
    vault_document_id INTEGER, -- Will reference vault_documents when that table exists
    
    -- Thumbnail for images/previews
    thumbnail_url TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- MESSAGE REACTIONS - Emoji reactions to messages
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_reactions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES huddle_messages(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- MENTIONS - Track @mentions for notifications
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_mentions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES huddle_messages(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENT PORTAL USERS - External users (owners, sellers, buyers)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_portal_users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- User info
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    avatar VARCHAR(500),
    
    -- Portal type
    portal_type VARCHAR(30) NOT NULL, -- 'owner', 'seller', 'buyer', 'tenant'
    
    -- Link to CRM lead if applicable
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active', -- 'invited', 'active', 'inactive'
    last_login_at TIMESTAMP,
    
    -- Assigned staff member
    assigned_agent_id INTEGER REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PORTAL USER PROPERTIES - Properties associated with portal users
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_portal_properties (
    id SERIAL PRIMARY KEY,
    portal_user_id INTEGER REFERENCES huddle_portal_users(id) ON DELETE CASCADE,
    
    -- Property relationship
    relationship_type VARCHAR(30) NOT NULL, -- 'owner', 'listing', 'interested', 'leasing'
    
    -- Property details (or link to property table)
    property_id INTEGER, -- Link to properties table if exists
    property_address TEXT,
    property_name VARCHAR(255),
    
    -- For listings
    listing_status VARCHAR(30), -- 'active', 'pending', 'sold', 'leased', 'withdrawn'
    listing_price DECIMAL(12,2),
    listing_date DATE,
    
    -- Channel for this property relationship
    channel_id INTEGER REFERENCES huddle_channels(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITY FEED - Track activity for client portals
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_activity_feed (
    id SERIAL PRIMARY KEY,
    portal_user_id INTEGER REFERENCES huddle_portal_users(id) ON DELETE CASCADE,
    portal_property_id INTEGER REFERENCES huddle_portal_properties(id) ON DELETE CASCADE,
    
    -- Activity details
    activity_type VARCHAR(50) NOT NULL, 
    -- Types: 'showing_scheduled', 'showing_completed', 'inquiry_received', 
    -- 'offer_received', 'price_change', 'status_change', 'document_added',
    -- 'message_received', 'maintenance_request', 'rent_received'
    
    title VARCHAR(255) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Who triggered the activity
    triggered_by_user_id INTEGER REFERENCES users(id),
    triggered_by_portal_user_id INTEGER REFERENCES huddle_portal_users(id),
    
    -- Read status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- DIRECT MESSAGES - 1:1 or small group conversations
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_direct_conversations (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Conversation type
    type VARCHAR(20) DEFAULT 'direct', -- 'direct' (1:1), 'group' (small group)
    name VARCHAR(100), -- Only for group conversations
    
    last_message_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS huddle_direct_participants (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES huddle_direct_conversations(id) ON DELETE CASCADE,
    
    -- Can be internal user OR portal user
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    portal_user_id INTEGER REFERENCES huddle_portal_users(id) ON DELETE CASCADE,
    
    last_read_at TIMESTAMP,
    notifications VARCHAR(20) DEFAULT 'all',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure at least one user type is set
    CHECK (user_id IS NOT NULL OR portal_user_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS huddle_direct_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES huddle_direct_conversations(id) ON DELETE CASCADE,
    
    -- Sender can be internal user OR portal user
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    portal_user_id INTEGER REFERENCES huddle_portal_users(id) ON DELETE SET NULL,
    
    content TEXT NOT NULL,
    content_type VARCHAR(20) DEFAULT 'text',
    metadata JSONB DEFAULT '{}',
    
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (user_id IS NOT NULL OR portal_user_id IS NOT NULL)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS - Unified notification system
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS huddle_notifications (
    id SERIAL PRIMARY KEY,
    
    -- Recipient (internal user OR portal user)
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    portal_user_id INTEGER REFERENCES huddle_portal_users(id) ON DELETE CASCADE,
    
    -- Notification content
    type VARCHAR(50) NOT NULL, 
    -- Types: 'message', 'mention', 'reaction', 'activity', 'system'
    title VARCHAR(255) NOT NULL,
    body TEXT,
    
    -- Link to related content
    link_type VARCHAR(30), -- 'channel', 'direct', 'activity', 'property'
    link_id INTEGER,
    
    -- Status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    
    -- Delivery status
    email_sent BOOLEAN DEFAULT false,
    push_sent BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (user_id IS NOT NULL OR portal_user_id IS NOT NULL)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES for performance
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_huddle_messages_channel ON huddle_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_huddle_messages_thread ON huddle_messages(thread_parent_id) WHERE thread_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_huddle_channel_members_user ON huddle_channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_huddle_mentions_user ON huddle_mentions(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_huddle_notifications_user ON huddle_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_huddle_notifications_portal ON huddle_notifications(portal_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_huddle_activity_portal ON huddle_activity_feed(portal_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_huddle_direct_messages_conv ON huddle_direct_messages(conversation_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- DEFAULT DATA - Create default internal workspace and channels
-- ═══════════════════════════════════════════════════════════════════════════
-- This would be run per-tenant during setup:
/*
INSERT INTO huddle_workspaces (tenant_id, name, slug, type, icon) VALUES
(1, 'CRE Team', 'cre-team', 'internal', '🏢');

INSERT INTO huddle_channels (workspace_id, name, slug, type, icon, is_default) VALUES
((SELECT id FROM huddle_workspaces WHERE slug = 'cre-team'), 'General', 'general', 'public', '💬', true),
((SELECT id FROM huddle_workspaces WHERE slug = 'cre-team'), 'Deals', 'deals', 'public', '🤝', false),
((SELECT id FROM huddle_workspaces WHERE slug = 'cre-team'), 'Property Management', 'pm-team', 'private', '🏠', false),
((SELECT id FROM huddle_workspaces WHERE slug = 'cre-team'), 'Marketing', 'marketing', 'public', '📣', false),
((SELECT id FROM huddle_workspaces WHERE slug = 'cre-team'), 'Random', 'random', 'public', '🎲', false);
*/
