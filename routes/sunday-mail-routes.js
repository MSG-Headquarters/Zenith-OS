/**
 * Sunday-Mail Integration Routes
 * Danimal Data → CRM → Email Campaigns
 * Zenith OS v2.8.2
 */

const express = require('express');
const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// DANIMAL → CRM: Push leads from Danimal Data to CRM Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/danimal/push-to-crm
 * Push selected Danimal leads to CRM
 * Body: { leadIds: [1, 2, 3], stage: 'New', assignedTo: null }
 */
router.post('/danimal/push-to-crm', async (req, res) => {
    try {
        const { leadIds, stage = 'New', assignedTo = null } = req.body;
        const orgId = req.session.org?.id || 1;
        
        if (!leadIds || !leadIds.length) {
            return res.status(400).json({ success: false, error: 'No leads selected' });
        }
        
        // Get Danimal leads
        const danimalResult = await req.pool.query(`
            SELECT id, business_name, contact_name, email, phone, 
                   industry, license_type, license_status, license_number,
                   street_address, city, state, zip_code
            FROM danimal_leads 
            WHERE id = ANY($1)
        `, [leadIds]);
        
        if (danimalResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'No leads found' });
        }
        
        let inserted = 0;
        let skipped = 0;
        
        for (const lead of danimalResult.rows) {
            // Check if already in CRM (by email or business name)
            const existingCheck = await req.pool.query(`
                SELECT id FROM leads 
                WHERE organization_id = $1 
                AND (email = $2 OR company = $3)
            `, [orgId, lead.email, lead.business_name]);
            
            if (existingCheck.rows.length > 0) {
                skipped++;
                continue;
            }
            
            // Insert into CRM leads
            await req.pool.query(`
                INSERT INTO leads (organization_id, name, email, phone, company, stage, source, notes, tags, assigned_to)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                orgId,
                lead.contact_name || lead.business_name,
                lead.email,
                lead.phone,
                lead.business_name,
                stage,
                'Danimal Data',
                `Industry: ${lead.industry || 'N/A'}\nLicense: ${lead.license_type || 'N/A'} (${lead.license_number || 'N/A'})\nStatus: ${lead.license_status || 'N/A'}\nAddress: ${lead.street_address || ''}, ${lead.city || ''}, ${lead.state || ''} ${lead.zip_code || ''}`,
                [lead.industry, lead.license_status].filter(Boolean),
                assignedTo
            ]);
            inserted++;
        }
        
        res.json({ 
            success: true, 
            inserted, 
            skipped,
            message: `Added ${inserted} leads to CRM${skipped > 0 ? ` (${skipped} already existed)` : ''}`
        });
    } catch (error) {
        console.error('Push to CRM error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/danimal/bulk-push
 * Push leads matching filter criteria to CRM
 * Body: { filters: { industry, city, license_status, etc. }, limit: 100 }
 */
router.post('/danimal/bulk-push', async (req, res) => {
    try {
        const { filters = {}, limit = 100, stage = 'New' } = req.body;
        const orgId = req.session.org?.id || 1;
        
        // Build dynamic query from filters
        let whereConditions = [];
        let params = [];
        let paramIndex = 1;
        
        if (filters.industry) {
            whereConditions.push(`industry ILIKE $${paramIndex++}`);
            params.push(`%${filters.industry}%`);
        }
        if (filters.city) {
            whereConditions.push(`city ILIKE $${paramIndex++}`);
            params.push(`%${filters.city}%`);
        }
        if (filters.license_status) {
            whereConditions.push(`license_status = $${paramIndex++}`);
            params.push(filters.license_status);
        }
        if (filters.license_type) {
            whereConditions.push(`license_type ILIKE $${paramIndex++}`);
            params.push(`%${filters.license_type}%`);
        }
        if (filters.hasEmail) {
            whereConditions.push(`email IS NOT NULL AND email != ''`);
        }
        
        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        
        params.push(limit);
        
        const query = `
            SELECT id, business_name, contact_name, email, phone,
                   industry, license_type, license_status, license_number,
                   street_address, city, state, zip_code
            FROM danimal_leads
            ${whereClause}
            ORDER BY lead_score DESC NULLS LAST
            LIMIT $${paramIndex}
        `;
        
        const danimalResult = await req.pool.query(query, params);
        
        let inserted = 0;
        let skipped = 0;
        
        for (const lead of danimalResult.rows) {
            const existingCheck = await req.pool.query(`
                SELECT id FROM leads 
                WHERE organization_id = $1 
                AND (email = $2 OR company = $3)
            `, [orgId, lead.email, lead.business_name]);
            
            if (existingCheck.rows.length > 0) {
                skipped++;
                continue;
            }
            
            await req.pool.query(`
                INSERT INTO leads (organization_id, name, email, phone, company, stage, source, notes, tags)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                orgId,
                lead.contact_name || lead.business_name,
                lead.email,
                lead.phone,
                lead.business_name,
                stage,
                'Danimal Data',
                `Industry: ${lead.industry || 'N/A'}\nLicense: ${lead.license_type || 'N/A'}`,
                [lead.industry, lead.license_status].filter(Boolean)
            ]);
            inserted++;
        }
        
        res.json({ 
            success: true, 
            inserted, 
            skipped,
            total: danimalResult.rows.length
        });
    } catch (error) {
        console.error('Bulk push error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ═══════════════════════════════════════════════════════════════════════════════
// CRM → MAILER: Create campaigns from CRM leads
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/crm/add-to-campaign
 * Add CRM leads to an email campaign
 * Body: { leadIds: [1, 2, 3], campaignId: 5 } or { leadIds: [...], newCampaign: { name, subject } }
 */
router.post('/crm/add-to-campaign', async (req, res) => {
    try {
        const { leadIds, campaignId, newCampaign } = req.body;
        const orgId = req.session.org?.id || 1;
        
        if (!leadIds || !leadIds.length) {
            return res.status(400).json({ success: false, error: 'No leads selected' });
        }
        
        let targetCampaignId = campaignId;
        
        // Create new campaign if specified
        if (newCampaign && !campaignId) {
            const campaignResult = await req.pool.query(`
                INSERT INTO email_campaigns (organization_id, name, subject, status, created_at)
                VALUES ($1, $2, $3, 'draft', NOW())
                RETURNING id
            `, [orgId, newCampaign.name, newCampaign.subject || '']);
            targetCampaignId = campaignResult.rows[0].id;
        }
        
        if (!targetCampaignId) {
            return res.status(400).json({ success: false, error: 'No campaign specified' });
        }
        
        // Get CRM leads with emails
        const leadsResult = await req.pool.query(`
            SELECT id, name, email, company 
            FROM leads 
            WHERE id = ANY($1) AND organization_id = $2 AND email IS NOT NULL AND email != ''
        `, [leadIds, orgId]);
        
        let added = 0;
        for (const lead of leadsResult.rows) {
            // Check if already in campaign
            const existingCheck = await req.pool.query(`
                SELECT id FROM campaign_recipients 
                WHERE campaign_id = $1 AND email = $2
            `, [targetCampaignId, lead.email]);
            
            if (existingCheck.rows.length === 0) {
                await req.pool.query(`
                    INSERT INTO campaign_recipients (campaign_id, lead_id, email, name, status)
                    VALUES ($1, $2, $3, $4, 'pending')
                `, [targetCampaignId, lead.id, lead.email, lead.name]);
                added++;
            }
        }
        
        res.json({ 
            success: true, 
            campaignId: targetCampaignId,
            added,
            message: `Added ${added} recipients to campaign`
        });
    } catch (error) {
        console.error('Add to campaign error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/crm/create-segment
 * Create a reusable segment from CRM filter criteria
 */
router.post('/crm/create-segment', async (req, res) => {
    try {
        const { name, filters } = req.body;
        const orgId = req.session.org?.id || 1;
        
        const result = await req.pool.query(`
            INSERT INTO email_segments (organization_id, name, filters, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING id
        `, [orgId, name, JSON.stringify(filters)]);
        
        res.json({ success: true, segmentId: result.rows[0].id });
    } catch (error) {
        console.error('Create segment error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ═══════════════════════════════════════════════════════════════════════════════
// SUNDAY-MAIL: Email Campaign Management with AI Enrichment
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/sunday-mail/templates
 * Get email templates with merge field support
 */
router.get('/sunday-mail/templates', async (req, res) => {
    try {
        const orgId = req.session.org?.id || 1;
        
        const result = await req.pool.query(`
            SELECT * FROM email_templates 
            WHERE organization_id = $1 OR organization_id IS NULL
            ORDER BY name
        `, [orgId]);
        
        // Add default templates if none exist
        const templates = result.rows.length > 0 ? result.rows : [
            {
                id: 'default-intro',
                name: 'Professional Introduction',
                subject: 'Introduction from {{company_name}}',
                html: `<p>Hi {{contact_name}},</p>
<p>I noticed that {{business_name}} holds a {{license_type}} license in Florida, and I wanted to reach out.</p>
<p>At {{company_name}}, we specialize in helping businesses like yours with [your service].</p>
<p>Would you be open to a brief conversation?</p>
<p>Best regards,<br>{{sender_name}}</p>`,
                merge_fields: ['contact_name', 'business_name', 'license_type', 'company_name', 'sender_name']
            },
            {
                id: 'default-followup',
                name: 'Follow-up',
                subject: 'Following up - {{company_name}}',
                html: `<p>Hi {{contact_name}},</p>
<p>I wanted to follow up on my previous message regarding {{business_name}}.</p>
<p>I understand you're busy, but I believe we could provide real value to your business.</p>
<p>Do you have 15 minutes this week for a quick call?</p>
<p>Best,<br>{{sender_name}}</p>`,
                merge_fields: ['contact_name', 'business_name', 'company_name', 'sender_name']
            },
            {
                id: 'default-license-renewal',
                name: 'License Renewal Reminder',
                subject: 'Your {{license_type}} license expires soon',
                html: `<p>Hi {{contact_name}},</p>
<p>Our records show that the {{license_type}} license for {{business_name}} is expiring on {{license_expiration}}.</p>
<p>We wanted to reach out because [your relevant service].</p>
<p>Would you like to learn more about how we can help?</p>
<p>Regards,<br>{{sender_name}}</p>`,
                merge_fields: ['contact_name', 'business_name', 'license_type', 'license_expiration', 'sender_name']
            }
        ];
        
        res.json({ success: true, templates });
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/sunday-mail/preview
 * Preview email with merge fields populated
 */
router.post('/sunday-mail/preview', async (req, res) => {
    try {
        const { templateHtml, templateSubject, sampleLeadId } = req.body;
        
        let sampleData = {
            contact_name: 'John Smith',
            business_name: 'ABC Construction LLC',
            license_type: 'General Contractor',
            license_number: 'CGC123456',
            license_expiration: '12/31/2026',
            city: 'Miami',
            industry: 'Construction',
            company_name: 'CRE Consultants',
            sender_name: 'Your Name'
        };
        
        // If sample lead provided, use real data
        if (sampleLeadId) {
            const leadResult = await req.pool.query(`
                SELECT * FROM danimal_leads WHERE id = $1
            `, [sampleLeadId]);
            
            if (leadResult.rows.length > 0) {
                const lead = leadResult.rows[0];
                sampleData = {
                    contact_name: lead.contact_name || lead.business_name,
                    business_name: lead.business_name,
                    license_type: lead.license_type || 'N/A',
                    license_number: lead.license_number || 'N/A',
                    license_expiration: lead.license_expiration || 'N/A',
                    city: lead.city || 'N/A',
                    industry: lead.industry || 'N/A',
                    company_name: 'CRE Consultants',
                    sender_name: 'Your Name'
                };
            }
        }
        
        // Replace merge fields
        let previewHtml = templateHtml;
        let previewSubject = templateSubject;
        
        for (const [key, value] of Object.entries(sampleData)) {
            const regex = new RegExp(`{{${key}}}`, 'gi');
            previewHtml = previewHtml.replace(regex, value || '');
            previewSubject = previewSubject.replace(regex, value || '');
        }
        
        res.json({ 
            success: true, 
            preview: {
                subject: previewSubject,
                html: previewHtml
            },
            sampleData
        });
    } catch (error) {
        console.error('Preview error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/sunday-mail/send-campaign
 * Send campaign to all recipients
 */
router.post('/sunday-mail/send-campaign', async (req, res) => {
    try {
        const { campaignId, templateHtml, templateSubject, testMode = false } = req.body;
        const orgId = req.session.org?.id || 1;
        
        // Get campaign recipients
        const recipientsResult = await req.pool.query(`
            SELECT cr.*, l.company, l.notes
            FROM campaign_recipients cr
            LEFT JOIN leads l ON cr.lead_id = l.id
            WHERE cr.campaign_id = $1 AND cr.status = 'pending'
        `, [campaignId]);
        
        if (recipientsResult.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'No pending recipients' });
        }
        
        // In test mode, just return preview
        if (testMode) {
            return res.json({
                success: true,
                testMode: true,
                recipientCount: recipientsResult.rows.length,
                sampleRecipient: recipientsResult.rows[0]
            });
        }
        
        // Send emails (this would integrate with your SES sending logic)
        let sent = 0;
        let failed = 0;
        
        for (const recipient of recipientsResult.rows) {
            try {
                // Prepare personalized email
                let personalizedHtml = templateHtml;
                let personalizedSubject = templateSubject;
                
                const mergeData = {
                    contact_name: recipient.name,
                    email: recipient.email,
                    company_name: 'CRE Consultants'
                };
                
                for (const [key, value] of Object.entries(mergeData)) {
                    const regex = new RegExp(`{{${key}}}`, 'gi');
                    personalizedHtml = personalizedHtml.replace(regex, value || '');
                    personalizedSubject = personalizedSubject.replace(regex, value || '');
                }
                
                // TODO: Call your existing SES send function here
                // await sendEmail(recipient.email, personalizedSubject, personalizedHtml);
                
                // Mark as sent
                await req.pool.query(`
                    UPDATE campaign_recipients 
                    SET status = 'sent', sent_at = NOW()
                    WHERE id = $1
                `, [recipient.id]);
                
                sent++;
            } catch (err) {
                console.error(`Failed to send to ${recipient.email}:`, err);
                await req.pool.query(`
                    UPDATE campaign_recipients 
                    SET status = 'failed', error = $2
                    WHERE id = $1
                `, [recipient.id, err.message]);
                failed++;
            }
        }
        
        // Update campaign status
        await req.pool.query(`
            UPDATE email_campaigns 
            SET status = 'sent', sent_at = NOW(), 
                sent_count = sent_count + $2,
                failed_count = failed_count + $3
            WHERE id = $1
        `, [campaignId, sent, failed]);
        
        res.json({ success: true, sent, failed });
    } catch (error) {
        console.error('Send campaign error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/sunday-mail/campaigns
 * List all campaigns with stats
 */
router.get('/sunday-mail/campaigns', async (req, res) => {
    try {
        const orgId = req.session.org?.id || 1;
        
        const result = await req.pool.query(`
            SELECT c.*,
                (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id) as recipient_count,
                (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'sent') as sent_count,
                (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND opened_at IS NOT NULL) as opened_count
            FROM email_campaigns c
            WHERE c.organization_id = $1
            ORDER BY c.created_at DESC
        `, [orgId]);
        
        res.json({ success: true, campaigns: result.rows });
    } catch (error) {
        console.error('Get campaigns error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ═══════════════════════════════════════════════════════════════════════════════
// DIRECT DANIMAL → CAMPAIGN: Skip CRM for quick campaigns
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/sunday-mail/quick-campaign
 * Create campaign directly from Danimal filters (bypass CRM)
 */
router.post('/sunday-mail/quick-campaign', async (req, res) => {
    try {
        const { 
            campaignName, 
            filters = {},
            limit = 500,
            templateHtml,
            templateSubject
        } = req.body;
        const orgId = req.session.org?.id || 1;
        
        // Build query from filters
        let whereConditions = ["email IS NOT NULL AND email != ''"];
        let params = [];
        let paramIndex = 1;
        
        if (filters.industry) {
            whereConditions.push(`industry ILIKE $${paramIndex++}`);
            params.push(`%${filters.industry}%`);
        }
        if (filters.city) {
            whereConditions.push(`city ILIKE $${paramIndex++}`);
            params.push(`%${filters.city}%`);
        }
        if (filters.license_status) {
            whereConditions.push(`license_status = $${paramIndex++}`);
            params.push(filters.license_status);
        }
        if (filters.license_type) {
            whereConditions.push(`license_type ILIKE $${paramIndex++}`);
            params.push(`%${filters.license_type}%`);
        }
        if (filters.expiringWithinDays) {
            whereConditions.push(`license_expiration BETWEEN NOW() AND NOW() + INTERVAL '${parseInt(filters.expiringWithinDays)} days'`);
        }
        
        params.push(limit);
        
        // Get matching leads
        const leadsResult = await req.pool.query(`
            SELECT id, business_name, contact_name, email, phone,
                   industry, license_type, license_status, license_number, license_expiration,
                   city, state
            FROM danimal_leads
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY lead_score DESC NULLS LAST
            LIMIT $${paramIndex}
        `, params);
        
        if (leadsResult.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'No leads match the criteria' });
        }
        
        // Create campaign
        const campaignResult = await req.pool.query(`
            INSERT INTO email_campaigns (organization_id, name, subject, html_content, status, created_at)
            VALUES ($1, $2, $3, $4, 'draft', NOW())
            RETURNING id
        `, [orgId, campaignName, templateSubject, templateHtml]);
        
        const campaignId = campaignResult.rows[0].id;
        
        // Add recipients directly from Danimal
        for (const lead of leadsResult.rows) {
            await req.pool.query(`
                INSERT INTO campaign_recipients (campaign_id, email, name, metadata, status)
                VALUES ($1, $2, $3, $4, 'pending')
                ON CONFLICT DO NOTHING
            `, [
                campaignId,
                lead.email,
                lead.contact_name || lead.business_name,
                JSON.stringify({
                    danimal_id: lead.id,
                    business_name: lead.business_name,
                    license_type: lead.license_type,
                    license_number: lead.license_number,
                    license_expiration: lead.license_expiration,
                    city: lead.city,
                    industry: lead.industry
                })
            ]);
        }
        
        res.json({
            success: true,
            campaignId,
            recipientCount: leadsResult.rows.length,
            message: `Campaign created with ${leadsResult.rows.length} recipients`
        });
    } catch (error) {
        console.error('Quick campaign error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
