# INTEL Module - Phase 1 Integration Guide
## Zenith OS v2.9.0

---

## Files Included

```
intel-phase1/
├── migrations/
│   └── intel-tables.sql          # Run against RDS PostgreSQL
├── routes/
│   └── intel-api.js              # API routes (mount in app.js)
├── views/
│   └── intel/
│       └── dashboard.ejs         # Full canvas editor + project manager
├── public/
│   └── intel/
│       ├── exports/              # Generated export images stored here
│       ├── css/
│       ├── js/
│       └── logos/                # Logo catalog image files
└── INTEGRATION_GUIDE.md          # This file
```

---

## Step 1: Run Database Migration

Connect to your AWS RDS via CloudShell or psql:

```bash
psql "postgresql://zenith_admin:YOUR_PASSWORD@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/postgres"
```

Then paste the contents of `migrations/intel-tables.sql` and run.

This creates 8 tables:
- `intel_logos` - Logo catalog
- `intel_projects` - Top-level project container  
- `intel_pages` - Individual pages (aerial, market map, site plan)
- `intel_templates` - Reusable page templates
- `intel_exports` - Generated files + LinkedIn share tracking
- `intel_demographics` - Cached demographic data (Phase 3)
- `intel_traffic` - Cached FDOT traffic counts (Phase 2/3)
- `intel_logo_matches` - Google Places → logo mapping (Phase 2)

Plus seeds 5 default templates.

---

## Step 2: Add Files to Zenith OS

```powershell
# Copy route file
Copy-Item "intel-api.js" -Destination "C:\Users\17242\Desktop\Zenith-OS-v2.9.0\routes\intel-api.js"

# Copy view
New-Item -ItemType Directory -Force -Path "C:\Users\17242\Desktop\Zenith-OS-v2.9.0\views\intel"
Copy-Item "dashboard.ejs" -Destination "C:\Users\17242\Desktop\Zenith-OS-v2.9.0\views\intel\dashboard.ejs"

# Create exports directory
New-Item -ItemType Directory -Force -Path "C:\Users\17242\Desktop\Zenith-OS-v2.9.0\public\intel\exports"
```

---

## Step 3: Wire into app.js

Add these lines to your existing `app.js`:

### 3a. Require the route at the top (near other requires)

Find this section near line 13-15:
```javascript
const danimalApi = require('./routes/danimal-api');
const huddleApi = require('./routes/huddle-api');
```

Add below it:
```javascript
const intelApi = require('./routes/intel-api');
```

### 3b. Mount the API route (near other app.use lines)

Find this section near line 208-210:
```javascript
app.use('/api/danimal', danimalApi);
app.use('/api/huddle', ...);
```

Add below it:
```javascript
app.use('/api/intel', intelApi(pool));
```

### 3c. Add the INTEL page route (near other app.get routes)

Find the section with routes like `app.get('/danimal', ...)` and add:

```javascript
// ============================================
// INTEL MODULE
// ============================================
app.get('/intel', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        res.render('intel/dashboard', {
            user: req.session.user,
            tenant: req.session.tenant
        });
    } catch (error) {
        console.error('[INTEL] Dashboard error:', error);
        res.redirect('/dashboard');
    }
});
```

### 3d. Add INTEL to the navigation in all views

In every EJS view that has the sidebar navigation, add this nav-item
(between Property Mgmt and wherever makes sense):

```html
<a href="/intel" class="nav-item">
    <span class="nav-icon">🛰️</span> INTEL
</a>
```

OR run this from CloudShell after uploading:

```bash
for file in views/dashboard.ejs views/crm.ejs views/huddle.ejs views/mailer.ejs views/vault.ejs views/cfo.ejs views/command.ejs views/admin.ejs views/danimal/dashboard.ejs views/pm/dashboard.ejs; do
  sed -i 's|<a href="/pm" class="nav-item">|<a href="/intel" class="nav-item">\n                    <span class="nav-icon">🛰️</span> INTEL\n                </a>\n                <a href="/pm" class="nav-item">|g' "$file" 2>/dev/null
  echo "Updated: $file"
done
```

### 3e. Serve static exports

Add this with the other `express.static` lines:

```javascript
app.use('/intel/exports', express.static(path.join(__dirname, 'public', 'intel', 'exports')));
```

---

## Step 4: Add uuid dependency

```bash
npm install uuid
```

(You may already have this from the flyer generator)

---

## Step 5: Update package.json version

```json
{
  "version": "2.9.0"
}
```

---

## Step 6: Deploy to Elastic Beanstalk

Package and deploy as usual:

```bash
# From CloudShell or locally
zip -r zenith-os-v2.9.0.zip . -x "node_modules/*" ".git/*"
# Upload via EB console or CLI
```

---

## Step 7: Verify

After deployment, visit:

- `https://zenith.umbrassi.com/intel` → INTEL dashboard
- `https://zenith.umbrassi.com/api/intel/health` → Should return healthy
- `https://zenith.umbrassi.com/api/intel/templates` → Should return 5 templates
- `https://zenith.umbrassi.com/api/intel/stats` → Should return zeroed stats

---

## What's Working in Phase 1

| Feature | Status |
|---------|--------|
| Project CRUD (create, list, open, archive) | ✅ |
| 3-page project structure (aerial, market map, site plan) | ✅ |
| Fabric.js canvas editor with full toolbar | ✅ |
| Background aerial image upload | ✅ |
| Logo catalog with search + categories + upload | ✅ |
| Drag logos onto canvas from catalog | ✅ |
| Text labels, arrows, rectangles, freehand draw | ✅ |
| Undo/Redo with Ctrl+Z / Ctrl+Y | ✅ |
| Canvas state save/load (persistent across sessions) | ✅ |
| Zoom in/out/fit with multiple canvas sizes | ✅ |
| Export to PNG/JPG with 2x resolution | ✅ |
| Quick download directly from canvas | ✅ |
| LinkedIn share (opens share dialog with image) | ✅ |
| Export history tracking per project | ✅ |
| Keyboard shortcuts (Ctrl+S save, Delete, etc.) | ✅ |
| CRE Consultants branded dark theme | ✅ |
| Letter/Tabloid/LinkedIn canvas presets | ✅ |

---

## What's Queued for Phase 2

- EagleView API auto-fetch aerials by address
- Google Places tenant auto-identification
- Logo auto-placement from Places geocoordinates
- FDOT traffic count road labels
- LinkedIn Marketing API for direct posting (vs share URL)

---

## Christ is King 👑
