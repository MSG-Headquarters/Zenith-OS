// ============================================
// ZENITH OS — Marketing Suite API Routes
// Drop into: routes/marketing-api.js
// Mount in app.js: app.use('/api/marketing', marketingApi(pool));
// ============================================
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

module.exports = function(pool) {
  const router = express.Router();
  let workflow = null;
  let generator = null;

  function getWorkflow() {
    if (!workflow) {
      const { MarketingWorkflow } = require('../services/marketing-workflow');
      workflow = new MarketingWorkflow(pool);
    }
    return workflow;
  }

  function getGenerator() {
    if (!generator) {
      const { GenerationService } = require('../services/marketing-generation');
      generator = new GenerationService(pool, getWorkflow(), {
        apiKey: process.env.ANTHROPIC_API_KEY || null,
        chromePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
        outputDir: path.join(__dirname, '..', 'marketing-output'),
      });
    }
    return generator;
  }

  function requireAuth(req, res, next) {
    if (!req.session?.user) return res.status(401).json({ error: 'Authentication required' });
    next();
  }
  function getTenantId(req) { return req.session?.tenant?.id; }
  function getUserId(req) { return req.session?.user?.id; }
  function getUserRole(req) {
    const role = req.session?.user?.role || req.session?.user?.access_level;
    if (role === 'super_admin' || role === 'admin') return 'admin';
    if (role === 'broker' || role === 'principal') return 'broker';
    return 'marketing';
  }

  // GET /api/marketing/drafts
  router.get('/drafts', requireAuth, async (req, res) => {
    try {
      const { status, listing_id, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;
      let query = 'SELECT * FROM marketing_drafts WHERE tenant_id = $1';
      const params = [getTenantId(req)];
      let idx = 2;
      if (status) { query += ` AND status = $${idx++}`; params.push(status); }
      if (listing_id) { query += ` AND listing_id = $${idx++}`; params.push(listing_id); }
      query += ` ORDER BY updated_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(parseInt(limit), offset);
      const result = await pool.query(query, params);
      const countR = await pool.query('SELECT COUNT(*) FROM marketing_drafts WHERE tenant_id = $1', [getTenantId(req)]);
      res.json({ drafts: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countR.rows[0].count) } });
    } catch (err) { console.error('GET /drafts error:', err); res.status(500).json({ error: 'Failed to fetch drafts' }); }
  });

  // GET /api/marketing/drafts/:id
  router.get('/drafts/:id', requireAuth, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM marketing_drafts WHERE id = $1 AND tenant_id = $2', [req.params.id, getTenantId(req)]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Draft not found' });
      const draft = result.rows[0];
      draft.available_transitions = getWorkflow().getAvailableTransitions(draft.status, getUserRole(req));
      const history = await pool.query('SELECT * FROM marketing_draft_history WHERE draft_id = $1 ORDER BY created_at DESC', [req.params.id]);
      draft.history = history.rows;
      const photos = await pool.query('SELECT * FROM marketing_photos WHERE draft_id = $1 ORDER BY sort_order', [req.params.id]);
      draft.photos = photos.rows;
      res.json(draft);
    } catch (err) { console.error('GET /drafts/:id error:', err); res.status(500).json({ error: 'Failed to fetch draft' }); }
  });

  // POST /api/marketing/drafts/:id/transition
  router.post('/drafts/:id/transition', requireAuth, async (req, res) => {
    try {
      const { transition, comments, ...params } = req.body;
      if (!transition) return res.status(400).json({ error: 'Missing transition name' });
      const result = await getWorkflow().transition(req.params.id, transition, getUserId(req), getUserRole(req), { comments, ...params });
      if (!result.success) return res.status(result.httpStatus || 422).json({ error: result.error });
      result.draft.available_transitions = getWorkflow().getAvailableTransitions(result.draft.status, getUserRole(req));
      res.json({ success: true, draft: result.draft, transition: result.transition });
    } catch (err) { console.error('POST /transition error:', err); res.status(500).json({ error: 'Transition failed' }); }
  });

  // POST /api/marketing/drafts/:id/generate
  router.post('/drafts/:id/generate', requireAuth, async (req, res) => {
    try {
      const transResult = await getWorkflow().transition(req.params.id, 'generate', getUserId(req), getUserRole(req));
      if (!transResult.success) return res.status(transResult.httpStatus || 422).json({ error: transResult.error });
      getGenerator().queueGeneration(req.params.id, getTenantId(req)).catch(err => console.error('Generation failed:', err));
      res.json({ success: true, message: 'Generation started', draft: transResult.draft });
    } catch (err) { console.error('POST /generate error:', err); res.status(500).json({ error: 'Failed to start generation' }); }
  });

  // POST /api/marketing/webhook/crm
  router.post('/webhook/crm', async (req, res) => {
    try {
      const { event, listing_id, tenant_id, data } = req.body;
      if (!event || !listing_id || !tenant_id) return res.status(400).json({ error: 'Invalid webhook payload' });
      console.log(`[Marketing] CRM Webhook: ${event} — Listing ${listing_id}`);
      if (event === 'listing_won' || (event === 'listing_status_changed' && data?.new_status === 'Won')) {
        const brandR = await pool.query('SELECT id FROM marketing_brands WHERE tenant_id = $1 AND is_default = TRUE LIMIT 1', [tenant_id]);
        const listing = data?.listing || {};
        const ruleR = await pool.query('SELECT template_sequence FROM marketing_template_rules WHERE listing_type = $1 AND is_active = TRUE ORDER BY priority DESC LIMIT 1', [listing.listing_type || 'for_sale']);
        const draftId = uuidv4();
        const templateSeq = ruleR.rows[0]?.template_sequence || ['cover-standard', 'details-offering', 'location-map'];
        await pool.query('INSERT INTO marketing_drafts (id, tenant_id, listing_id, brand_id, status, template_sequence, generated_by) VALUES ($1, $2, $3, $4, \'pending\', $5, $6)', [draftId, tenant_id, listing_id, brandR.rows[0]?.id || null, templateSeq, data?.actor_id || null]);
        await pool.query('INSERT INTO marketing_draft_history (draft_id, from_status, to_status, actor_role, comments, metadata) VALUES ($1, NULL, \'pending\', \'system\', \'Auto-created from CRM listing won\', $2)', [draftId, JSON.stringify({ event, listing_id })]);
        console.log(`[Marketing] Draft created: ${draftId}`);
        return res.json({ success: true, draft_id: draftId });
      }
      res.json({ success: true, message: `Event '${event}' acknowledged` });
    } catch (err) { console.error('[Marketing] Webhook error:', err); res.status(500).json({ error: 'Webhook failed' }); }
  });

  // GET /api/marketing/brands
  router.get('/brands', requireAuth, async (req, res) => {
    try { const r = await pool.query('SELECT * FROM marketing_brands WHERE tenant_id = $1 ORDER BY is_default DESC, name', [getTenantId(req)]); res.json(r.rows); }
    catch (err) { res.status(500).json({ error: 'Failed to fetch brands' }); }
  });

  // POST /api/marketing/brands
  router.post('/brands', requireAuth, async (req, res) => {
    try {
      const tid = getTenantId(req);
      const { name, colors, fonts, logo_url, disclaimer, website_url, offices, is_default } = req.body;
      if (is_default) await pool.query('UPDATE marketing_brands SET is_default = FALSE WHERE tenant_id = $1', [tid]);
      const r = await pool.query('INSERT INTO marketing_brands (tenant_id, name, colors, fonts, logo_url, disclaimer, website_url, offices, is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [tid, name, JSON.stringify(colors||{}), JSON.stringify(fonts||{}), logo_url, disclaimer, website_url, JSON.stringify(offices||[]), is_default||false]);
      res.status(201).json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Failed to create brand' }); }
  });

  // GET /api/marketing/templates
  router.get('/templates', async (req, res) => {
    try { const r = await pool.query('SELECT id, name, description, category, tags, sort_order FROM marketing_templates WHERE is_active = TRUE ORDER BY sort_order'); res.json(r.rows); }
    catch (err) { res.status(500).json({ error: 'Failed to fetch templates' }); }
  });

  // GET /api/marketing/health
  router.get('/health', async (req, res) => {
    try {
      const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'marketing_%'");
      res.json({ status: 'ok', module: 'Marketing Suite', tables: r.rows.map(x => x.table_name), aiEnabled: !!process.env.ANTHROPIC_API_KEY });
    } catch (err) { res.status(500).json({ status: 'error', error: err.message }); }
  });

  return router;
};
