-- Sunday-Mail Schema Additions
-- Run this to add campaign recipient tracking tables

-- Email Campaigns (may already exist, adding columns if needed)
CREATE TABLE IF NOT EXISTS email_campaigns (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    html_content TEXT,
    text_content TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- draft, scheduled, sending, sent, paused
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Campaign Recipients
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES email_campaigns(id) ON DELETE CASCADE,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    metadata JSONB, -- Store Danimal data for merge fields
    status VARCHAR(50) DEFAULT 'pending', -- pending, sent, failed, bounced, unsubscribed
    sent_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(campaign_id, email)
);

-- Email Templates
CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    html_content TEXT,
    text_content TEXT,
    merge_fields TEXT[], -- Available merge fields
    category VARCHAR(100), -- intro, followup, promotion, etc.
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Email Segments (saved filters for reuse)
CREATE TABLE IF NOT EXISTS email_segments (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    filters JSONB NOT NULL, -- Stored filter criteria
    lead_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Email Events (for tracking opens/clicks)
CREATE TABLE IF NOT EXISTS email_events (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES email_campaigns(id) ON DELETE CASCADE,
    recipient_id INTEGER REFERENCES campaign_recipients(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- sent, delivered, opened, clicked, bounced, complained, unsubscribed
    metadata JSONB, -- Link clicked, bounce reason, etc.
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email ON campaign_recipients(email);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);

-- Add unsubscribe tracking
CREATE TABLE IF NOT EXISTS email_unsubscribes (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    email VARCHAR(255) NOT NULL,
    reason VARCHAR(255),
    campaign_id INTEGER REFERENCES email_campaigns(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

-- Insert default templates
INSERT INTO email_templates (organization_id, name, subject, html_content, merge_fields, category, is_default)
VALUES 
(NULL, 'Professional Introduction', 'Introduction from {{company_name}}', 
'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<p>Hi {{contact_name}},</p>
<p>I noticed that <strong>{{business_name}}</strong> holds a {{license_type}} license in Florida, and I wanted to reach out.</p>
<p>At {{company_name}}, we specialize in helping businesses like yours succeed. I''d love to learn more about your goals and see if there''s a way we can work together.</p>
<p>Would you be open to a brief 15-minute conversation this week?</p>
<p>Best regards,<br>{{sender_name}}<br>{{company_name}}</p>
</div>',
ARRAY['contact_name', 'business_name', 'license_type', 'company_name', 'sender_name'],
'intro', true),

(NULL, 'License Renewal Outreach', 'Your {{license_type}} license expires {{license_expiration}}',
'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<p>Hi {{contact_name}},</p>
<p>I hope this message finds you well. I noticed that the {{license_type}} license for <strong>{{business_name}}</strong> is set to expire on <strong>{{license_expiration}}</strong>.</p>
<p>As you prepare for renewal, I wanted to share how {{company_name}} has helped similar businesses in {{industry}} streamline their operations and grow.</p>
<p>Would you have time for a quick call to discuss how we might be able to help {{business_name}}?</p>
<p>Best,<br>{{sender_name}}</p>
</div>',
ARRAY['contact_name', 'business_name', 'license_type', 'license_expiration', 'industry', 'company_name', 'sender_name'],
'renewal', true),

(NULL, 'Follow-up Email', 'Following up - {{company_name}}',
'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<p>Hi {{contact_name}},</p>
<p>I wanted to follow up on my previous message. I understand you''re busy running {{business_name}}, but I genuinely believe we could provide value to your business.</p>
<p>If now isn''t the right time, I completely understand. Just let me know, and I''ll reach out again in a few months.</p>
<p>Otherwise, I''d love to schedule a brief call at your convenience.</p>
<p>Thanks for your time,<br>{{sender_name}}<br>{{company_name}}</p>
</div>',
ARRAY['contact_name', 'business_name', 'company_name', 'sender_name'],
'followup', true)

ON CONFLICT DO NOTHING;
