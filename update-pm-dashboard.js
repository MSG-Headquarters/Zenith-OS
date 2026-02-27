const fs = require('fs');
let html = fs.readFileSync('./views/pm/dashboard.ejs', 'utf8');

// 1. Replace showAddProperty placeholder
html = html.replace(
    "function showAddProperty() { showToast('Property import from Danimal Data coming soon!'); }",
    `function showAddProperty() { document.getElementById('addPropertyModal').style.display = 'flex'; }`
);

// 2. Replace updateRequest placeholder
html = html.replace(
    "function updateRequest(rid) { showToast('Request management coming soon!'); }",
    `function updateRequest(rid) {
            const req = document.querySelector('tr td[style*="color:#6366F1"]');
            document.getElementById('updateReqId').value = rid;
            document.getElementById('updateReqModal').style.display = 'flex';
        }`
);

// 3. Add "Add Tenant" button next to the tenants table header search
html = html.replace(
    `<select class="btn btn-outline" id="tenantStatusFilter"`,
    `<button class="btn btn-primary btn-sm" onclick="showAddTenant()"><i class="bi bi-plus-lg"></i> Add Tenant</button>
                            <select class="btn btn-outline" id="tenantStatusFilter"`
);

// 4. Add Portal Management nav item
html = html.replace(
    `<a href="#" class="nav-item" onclick="switchTab('maintenance', this)">`,
    `<a href="#" class="nav-item" onclick="switchTab('portal', this)"><i class="bi bi-globe"></i> Tenant Portal</a>
            <a href="#" class="nav-item" onclick="switchTab('maintenance', this)">`
);

// 5. Add Portal panel + all modals before closing </div> of content
const portalPanel = `
            <div id="panelPortal" class="tab-panel">
                <div class="table-card">
                    <div class="table-header">
                        <div class="table-title"><i class="bi bi-globe"></i> Tenant Portal Management</div>
                        <div class="table-actions">
                            <button class="btn btn-primary btn-sm" onclick="showAddMitchMinutes()"><i class="bi bi-camera-video"></i> Add Mitch Minutes</button>
                            <button class="btn btn-primary btn-sm" onclick="showAddUpdate()"><i class="bi bi-bell"></i> New Update</button>
                        </div>
                    </div>
                    <div style="padding:16px 20px;">
                        <h4 style="font-size:14px;font-weight:600;margin-bottom:12px;"><i class="bi bi-people"></i> Portal Access</h4>
                    </div>
                    <table><thead><tr><th>Tenant</th><th>Property</th><th>Unit</th><th>Email</th><th>Portal Status</th><th>Last Login</th><th>Actions</th></tr></thead><tbody id="portalBody"></tbody></table>
                </div>
                <div class="table-card" style="margin-top:20px;">
                    <div class="table-header"><div class="table-title"><i class="bi bi-camera-video"></i> Mitch Minutes Videos</div></div>
                    <table><thead><tr><th>Property</th><th>Title</th><th>Published</th><th>URL</th><th>Actions</th></tr></thead><tbody id="mitchBody"></tbody></table>
                </div>
                <div class="table-card" style="margin-top:20px;">
                    <div class="table-header"><div class="table-title"><i class="bi bi-bell"></i> Property Updates</div></div>
                    <table><thead><tr><th>Property</th><th>Title</th><th>Category</th><th>Priority</th><th>Created</th><th>Actions</th></tr></thead><tbody id="updatesBody"></tbody></table>
                </div>
            </div>`;

// Insert portal panel before closing content div
html = html.replace(
    `</div>\n    </div>\n    <div class="toast"`,
    portalPanel + `\n        </div>\n    </div>\n    <div class="toast"`
);

// 6. Add modals before closing </body>
const modals = `
    <!-- Add Property Modal -->
    <div id="addPropertyModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;">
        <div style="background:var(--bg-surface,#fff);border-radius:12px;padding:24px;width:520px;max-width:90vw;max-height:90vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="font-size:18px;font-weight:700;"><i class="bi bi-buildings" style="color:#6366F1;"></i> Add Property</h3>
                <button onclick="document.getElementById('addPropertyModal').style.display='none'" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);">&times;</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div style="grid-column:1/-1;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Property Name *</label><input id="propName" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="e.g., Sunset Medical Plaza"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Short Name</label><input id="propShort" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="e.g., Sunset Med"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Account #</label><input id="propAcct" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="CRE-0018"></div>
                <div style="grid-column:1/-1;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Address</label><input id="propAddr" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="123 Main St"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">City</label><input id="propCity" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" value="Fort Myers"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">State</label><input id="propState" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" value="FL"></div><div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Zip</label><input id="propZip" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Type</label><select id="propType" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"><option>Medical Office</option><option>Office</option><option>Retail</option><option>Industrial</option><option>Mixed Use</option><option>Commercial</option></select></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Total Units</label><input id="propUnits" type="number" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="4"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Square Feet</label><input id="propSqft" type="number" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="12000"></div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
                <button class="btn btn-outline" onclick="document.getElementById('addPropertyModal').style.display='none'">Cancel</button>
                <button class="btn btn-primary" onclick="submitProperty()"><i class="bi bi-plus-lg"></i> Add Property</button>
            </div>
        </div>
    </div>

    <!-- Add Tenant Modal -->
    <div id="addTenantModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;">
        <div style="background:var(--bg-surface,#fff);border-radius:12px;padding:24px;width:520px;max-width:90vw;max-height:90vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="font-size:18px;font-weight:700;"><i class="bi bi-person-plus" style="color:#10B981;"></i> Add Tenant</h3>
                <button onclick="document.getElementById('addTenantModal').style.display='none'" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);">&times;</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div style="grid-column:1/-1;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Property *</label><select id="tenProp" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></select></div>
                <div style="grid-column:1/-1;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Tenant / Company Name *</label><input id="tenName" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="e.g., Koda Holdings LLC"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">DBA Name</label><input id="tenDba" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="e.g., Main Street Group"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Unit #</label><input id="tenUnit" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="e.g., 101"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Phone</label><input id="tenPhone" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="(239) 555-0100"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Email</label><input id="tenEmail" type="email" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="tenant@email.com"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Lease Start</label><input id="tenStart" type="date" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Lease End</label><input id="tenEnd" type="date" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Unit SqFt</label><input id="tenSqft" type="number" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Status</label><select id="tenStatus" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"><option>Current</option><option>MTM</option><option>Vacant</option></select></div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
                <button class="btn btn-outline" onclick="document.getElementById('addTenantModal').style.display='none'">Cancel</button>
                <button class="btn btn-primary" onclick="submitTenant()"><i class="bi bi-plus-lg"></i> Add Tenant</button>
            </div>
        </div>
    </div>

    <!-- Update Request Modal -->
    <div id="updateReqModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;">
        <div style="background:var(--bg-surface,#fff);border-radius:12px;padding:24px;width:420px;max-width:90vw;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="font-size:18px;font-weight:700;"><i class="bi bi-wrench" style="color:#06B6D4;"></i> Update Request</h3>
                <button onclick="document.getElementById('updateReqModal').style.display='none'" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);">&times;</button>
            </div>
            <input type="hidden" id="updateReqId">
            <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Status</label><select id="updateReqStatus" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"><option>New</option><option>Assigned</option><option>In Progress</option><option>Completed</option><option>Closed</option></select></div>
            <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Assigned To</label><input id="updateReqAssign" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="Tech name"></div>
            <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Resolution Notes</label><textarea id="updateReqNotes" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;min-height:80px;font-family:inherit;" placeholder="Notes about the resolution..."></textarea></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn btn-outline" onclick="document.getElementById('updateReqModal').style.display='none'">Cancel</button>
                <button class="btn btn-primary" onclick="submitUpdateRequest()"><i class="bi bi-check-lg"></i> Update</button>
            </div>
        </div>
    </div>

    <!-- Add Mitch Minutes Modal -->
    <div id="mitchModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;">
        <div style="background:var(--bg-surface,#fff);border-radius:12px;padding:24px;width:480px;max-width:90vw;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="font-size:18px;font-weight:700;"><i class="bi bi-camera-video" style="color:#10B981;"></i> Add Mitch Minutes</h3>
                <button onclick="document.getElementById('mitchModal').style.display='none'" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);">&times;</button>
            </div>
            <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Property *</label><select id="mitchProp" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></select></div>
            <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Title *</label><input id="mitchTitle" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="February 2026 Update"></div>
            <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Video URL * (YouTube/Vimeo)</label><input id="mitchUrl" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="https://youtube.com/watch?v=..."></div>
            <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Description</label><textarea id="mitchDesc" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;min-height:60px;font-family:inherit;" placeholder="Brief summary..."></textarea></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn btn-outline" onclick="document.getElementById('mitchModal').style.display='none'">Cancel</button>
                <button class="btn btn-primary" onclick="submitMitchMinutes()"><i class="bi bi-upload"></i> Publish</button>
            </div>
        </div>
    </div>

    <!-- Add Property Update Modal -->
    <div id="updateModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;">
        <div style="background:var(--bg-surface,#fff);border-radius:12px;padding:24px;width:480px;max-width:90vw;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="font-size:18px;font-weight:700;"><i class="bi bi-bell" style="color:#F59E0B;"></i> New Property Update</h3>
                <button onclick="document.getElementById('updateModal').style.display='none'" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);">&times;</button>
            </div>
            <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Property (blank = all properties)</label><select id="notifProp" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"><option value="">All Properties</option></select></div>
            <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Title *</label><input id="notifTitle" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" placeholder="Parking Lot Resurfacing"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Category</label><select id="notifCat" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"><option>construction</option><option>maintenance</option><option>safety</option><option>event</option><option>general</option></select></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Priority</label><select id="notifPri" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"><option>low</option><option selected>normal</option><option>high</option><option>urgent</option></select></div>
            </div>
            <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Body *</label><textarea id="notifBody" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;min-height:80px;font-family:inherit;" placeholder="Details about the update..."></textarea></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Starts</label><input id="notifStart" type="date" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>
                <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Ends</label><input id="notifEnd" type="date" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn btn-outline" onclick="document.getElementById('updateModal').style.display='none'">Cancel</button>
                <button class="btn btn-primary" onclick="submitPropertyUpdate()"><i class="bi bi-send"></i> Publish</button>
            </div>
        </div>
    </div>`;

html = html.replace('</body>', modals + '\n</body>');

// 7. Add all the new JS functions before closing </script>
const newFunctions = `
        // ??? Add Property ???
        async function submitProperty() {
            const body = { property_name: document.getElementById('propName').value, short_name: document.getElementById('propShort').value, account_number: document.getElementById('propAcct').value, property_address: document.getElementById('propAddr').value, city: document.getElementById('propCity').value, state: document.getElementById('propState').value, zip: document.getElementById('propZip').value, property_type: document.getElementById('propType').value, total_units: parseInt(document.getElementById('propUnits').value) || 0, square_feet: parseInt(document.getElementById('propSqft').value) || 0 };
            if (!body.property_name) return alert('Property name is required.');
            try {
                const res = await fetch('/api/pm/properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const data = await res.json();
                if (data.success) { document.getElementById('addPropertyModal').style.display = 'none'; loadProperties(); showToast('Property added!'); } else alert(data.error);
            } catch(e) { alert('Error: ' + e.message); }
        }

        // ??? Add Tenant ???
        function showAddTenant() {
            const sel = document.getElementById('tenProp');
            sel.innerHTML = allProperties.map(p => '<option value="' + p.id + '">' + p.short_name + ' - ' + p.property_name + '</option>').join('');
            document.getElementById('addTenantModal').style.display = 'flex';
        }
        async function submitTenant() {
            const body = { property_id: document.getElementById('tenProp').value, tenant_name: document.getElementById('tenName').value, dba_name: document.getElementById('tenDba').value, unit_number: document.getElementById('tenUnit').value, contact_phone: document.getElementById('tenPhone').value, contact_email: document.getElementById('tenEmail').value, lease_start: document.getElementById('tenStart').value || null, lease_end: document.getElementById('tenEnd').value || null, unit_sqft: parseInt(document.getElementById('tenSqft').value) || null, tenant_status: document.getElementById('tenStatus').value };
            if (!body.tenant_name) return alert('Tenant name is required.');
            try {
                const res = await fetch('/api/pm/tenants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const data = await res.json();
                if (data.success) { document.getElementById('addTenantModal').style.display = 'none'; loadTenants(); showToast('Tenant added!'); } else alert(data.error);
            } catch(e) { alert('Error: ' + e.message); }
        }

        // ??? Update Maintenance Request ???
        async function submitUpdateRequest() {
            const rid = document.getElementById('updateReqId').value;
            const body = { status: document.getElementById('updateReqStatus').value, assigned_to: document.getElementById('updateReqAssign').value, resolution_notes: document.getElementById('updateReqNotes').value };
            try {
                const res = await fetch('/api/pm/requests/' + rid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const data = await res.json();
                if (data.success) { document.getElementById('updateReqModal').style.display = 'none'; loadMaintenance(); showToast('Request updated!'); } else alert(data.error);
            } catch(e) { alert('Error: ' + e.message); }
        }

        // ??? Portal Management ???
        async function loadPortalStatus() {
            try {
                const res = await fetch('/tenant-portal/admin/portal-status');
                const data = await res.json();
                if (!data.success) return;
                const tbody = document.getElementById('portalBody');
                tbody.innerHTML = data.tenants.map(t => '<tr>' +
                    '<td style="font-weight:600;">' + t.tenant_name + (t.dba_name ? '<div style="font-size:11px;color:var(--text-muted);">' + t.dba_name + '</div>' : '') + '</td>' +
                    '<td>' + t.property_name + '</td><td>' + (t.unit_number || '-') + '</td>' +
                    '<td style="font-size:12px;">' + (t.portal_email || t.contact_email || '-') + '</td>' +
                    '<td>' + (t.portal_enabled && t.has_password ? '<span class="badge badge-current">Active</span>' : t.portal_enabled ? '<span class="badge badge-mtm">Invited</span>' : '<span class="badge badge-vacant">Disabled</span>') + '</td>' +
                    '<td style="font-size:12px;">' + (t.portal_last_login ? formatDate(t.portal_last_login) : '-') + '</td>' +
                    '<td>' + (!t.portal_enabled ? '<button class="btn btn-sm btn-primary" onclick="enablePortal(' + t.id + ')"><i class="bi bi-globe"></i> Enable</button>' : '<button class="btn btn-sm btn-outline" onclick="disablePortal(' + t.id + ')"><i class="bi bi-x-circle"></i> Disable</button>') + '</td></tr>'
                ).join('');
            } catch(e) { console.error('Portal status error:', e); }
        }
        async function enablePortal(id) {
            try {
                const res = await fetch('/tenant-portal/admin/enable-portal/' + id, { method: 'POST' });
                const data = await res.json();
                if (data.success) { showToast('Portal enabled! Setup URL: ' + data.setupUrl); prompt('Send this URL to the tenant:', data.setupUrl); loadPortalStatus(); } else alert(data.error);
            } catch(e) { alert('Error: ' + e.message); }
        }
        async function disablePortal(id) {
            if (!confirm('Disable portal access for this tenant?')) return;
            try {
                const res = await fetch('/tenant-portal/admin/disable-portal/' + id, { method: 'POST' });
                const data = await res.json();
                if (data.success) { loadPortalStatus(); showToast('Portal disabled.'); }
            } catch(e) { alert('Error: ' + e.message); }
        }

        // ??? Mitch Minutes ???
        function showAddMitchMinutes() {
            const sel = document.getElementById('mitchProp');
            sel.innerHTML = allProperties.map(p => '<option value="' + p.id + '">' + p.short_name + '</option>').join('');
            document.getElementById('mitchModal').style.display = 'flex';
        }
        async function submitMitchMinutes() {
            const body = { property_id: document.getElementById('mitchProp').value, title: document.getElementById('mitchTitle').value, video_url: document.getElementById('mitchUrl').value, description: document.getElementById('mitchDesc').value };
            if (!body.title || !body.video_url) return alert('Title and video URL are required.');
            try {
                const res = await fetch('/tenant-portal/admin/mitch-minutes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const data = await res.json();
                if (data.success) { document.getElementById('mitchModal').style.display = 'none'; loadMitchMinutes(); showToast('Mitch Minutes published!'); } else alert(data.error);
            } catch(e) { alert('Error: ' + e.message); }
        }
        async function loadMitchMinutes() {
            try {
                const res = await fetch('/tenant-portal/admin/mitch-minutes');
                const data = await res.json();
                const tbody = document.getElementById('mitchBody');
                if (!data.videos || !data.videos.length) { tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><i class="bi bi-camera-video-off"></i><p>No videos yet</p></div></td></tr>'; return; }
                tbody.innerHTML = data.videos.map(v => '<tr><td>' + v.property_name + '</td><td style="font-weight:600;">' + v.title + '</td><td>' + formatDate(v.published_at) + '</td><td><a href="' + v.video_url + '" target="_blank" style="color:#6366F1;font-size:12px;">View</a></td><td><button class="btn btn-sm btn-outline" onclick="deleteMitch(' + v.id + ')"><i class="bi bi-trash"></i></button></td></tr>').join('');
            } catch(e) { console.error('Mitch minutes error:', e); }
        }
        async function deleteMitch(id) { if (!confirm('Delete this video?')) return; await fetch('/tenant-portal/admin/mitch-minutes/' + id, { method: 'DELETE' }); loadMitchMinutes(); showToast('Video removed.'); }

        // ??? Property Updates ???
        function showAddUpdate() {
            const sel = document.getElementById('notifProp');
            sel.innerHTML = '<option value="">All Properties</option>' + allProperties.map(p => '<option value="' + p.id + '">' + p.short_name + '</option>').join('');
            document.getElementById('updateModal').style.display = 'flex';
        }
        async function submitPropertyUpdate() {
            const body = { property_id: document.getElementById('notifProp').value || null, title: document.getElementById('notifTitle').value, body: document.getElementById('notifBody').value, category: document.getElementById('notifCat').value, priority: document.getElementById('notifPri').value, starts_at: document.getElementById('notifStart').value || null, ends_at: document.getElementById('notifEnd').value || null };
            if (!body.title || !body.body) return alert('Title and body are required.');
            try {
                const res = await fetch('/tenant-portal/admin/property-updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const data = await res.json();
                if (data.success) { document.getElementById('updateModal').style.display = 'none'; loadPropertyUpdates(); showToast('Update published!'); } else alert(data.error);
            } catch(e) { alert('Error: ' + e.message); }
        }
        async function loadPropertyUpdates() {
            try {
                const res = await fetch('/tenant-portal/admin/property-updates');
                const data = await res.json();
                const tbody = document.getElementById('updatesBody');
                if (!data.updates || !data.updates.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="bi bi-bell-slash"></i><p>No updates yet</p></div></td></tr>'; return; }
                tbody.innerHTML = data.updates.map(u => '<tr><td>' + (u.property_name || 'All') + '</td><td style="font-weight:600;">' + u.title + '</td><td><span class="badge badge-' + (u.category==='safety'?'emergency':u.category==='construction'?'high':'current') + '">' + u.category + '</span></td><td><span class="badge badge-' + (u.priority==='urgent'?'emergency':u.priority==='high'?'high':'current') + '">' + u.priority + '</span></td><td>' + formatDate(u.created_at) + '</td><td><button class="btn btn-sm btn-outline" onclick="deleteUpdate(' + u.id + ')"><i class="bi bi-trash"></i></button></td></tr>').join('');
            } catch(e) { console.error('Updates error:', e); }
        }
        async function deleteUpdate(id) { if (!confirm('Delete this update?')) return; await fetch('/tenant-portal/admin/property-updates/' + id, { method: 'DELETE' }); loadPropertyUpdates(); showToast('Update removed.'); }
`;

// Also update the switchTab to load portal data
html = html.replace(
    "document.getElementById('panel' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');",
    "document.getElementById('panel' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');\n            if (tab === 'portal') { loadPortalStatus(); loadMitchMinutes(); loadPropertyUpdates(); }"
);

// Also update Tenant Portal link in top bar
html = html.replace(
    `<a href="/maintenance" target="_blank" class="btn btn-outline"><i class="bi bi-box-arrow-up-right"></i> Tenant Portal</a>`,
    `<a href="/tenant-portal/login" target="_blank" class="btn btn-outline"><i class="bi bi-box-arrow-up-right"></i> Tenant Portal</a>`
);

html = html.replace('    </script>', newFunctions + '\n    </script>');

fs.writeFileSync('./views/pm/dashboard.ejs', html);
console.log('PM Dashboard updated with modals + portal management');
