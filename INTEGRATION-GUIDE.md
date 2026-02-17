# ZENITH OS — MARKETING SUITE INTEGRATION GUIDE
## Version 1.0 · Main Street Group LLC · February 2026

## QUICK START (5 Steps)

### Step 1: Install Dependencies
```powershell
cd C:\Users\17242\Desktop\Zenith-OS-v2.8.1
npm install puppeteer-core handlebars sharp
```
(uuid is already in your package.json)

### Step 2: Drop Files
Extract this package into your Zenith OS root. It adds:
- `routes/marketing-api.js` — API routes
- `services/marketing-workflow.js` — State machine
- `services/marketing-generation.js` — Pipeline orchestrator
- `marketing-engine/` — AI composition, photo processing, render engine, brands, templates
- `migrations/016_marketing_suite.sql` — Database tables

### Step 3: Run Migration
```bash
psql -h your-rds-endpoint -U your-user -d zenith_db -f migrations/016_marketing_suite.sql
```

Then seed the CRE Consultants brand:
```sql
INSERT INTO marketing_brands (tenant_id, name, is_default, colors, fonts, disclaimer, website_url, offices)
VALUES (1, 'CRE Consultants', TRUE,
  '{"primary":"#1B6B3A","primaryDark":"#145A2E","primaryLight":"#2A8B4A","accent":"#C41E3A","text":"#333333","textLight":"#FFFFFF","textMuted":"#666666","background":"#FFFFFF","backgroundDark":"#4A4A4A","backgroundDarker":"#2D2D2D","border":"#E0E0E0","highlight":"#F7F7F7"}'::jsonb,
  '{"heading":"Montserrat, Arial Black, sans-serif","body":"Open Sans, Helvetica Neue, sans-serif"}'::jsonb,
  'The information contained herein was obtained from sources believed reliable. CRE Consultants makes no guarantees, warranties or representations as to the completeness or accuracy thereof.',
  'CRECONSULTANTS.COM',
  '[{"city":"Fort Myers","address":"4524 Gun Club Rd., Suite 203","phone":"239.481.3800"},{"city":"Naples","address":"4501 Tamiami Trail N., Suite 300","phone":"239.659.1447"}]'::jsonb);
```

### Step 4: Add to app.js (3 lines)

Near your other route imports:
```javascript
const marketingApi = require('./routes/marketing-api');
```

Near your other route mounts:
```javascript
app.use('/api/marketing', marketingApi(pool));
```

Add to .env:
```
CHROME_PATH=/usr/bin/google-chrome
ANTHROPIC_API_KEY=your-key-here
```

### Step 5: Deploy
```powershell
eb deploy
```

Test: `GET /api/marketing/health` should return table list.

## WORKFLOW STATES
```
pending → ready → generating → review → approval → approved → distributed
                      ↓            ↑↓         ↑↓
                    failed     revision    (revisions)
```

## CRM WEBHOOK
POST /api/marketing/webhook/crm with:
```json
{ "event": "listing_won", "listing_id": 123, "tenant_id": 1, "data": { "listing": {...} } }
```

## API ENDPOINTS
- GET    /api/marketing/drafts
- GET    /api/marketing/drafts/:id
- POST   /api/marketing/drafts/:id/transition
- POST   /api/marketing/drafts/:id/generate
- POST   /api/marketing/webhook/crm
- GET    /api/marketing/brands
- POST   /api/marketing/brands
- GET    /api/marketing/templates
- GET    /api/marketing/health
