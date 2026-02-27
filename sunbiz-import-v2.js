const Database = require('better-sqlite3');
const { Pool } = require('pg');
require('dotenv').config();

const SUNBIZ_DB = 'C:\\Users\\17242\\msg-corporate-os\\danimal-data\\data\\sunbiz.db';
const BATCH_SIZE = 500;
const SQLITE_CHUNK = 10000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000
});

function mapIndustry(d) {
    if (!d) return 'Business Services';
    if (d.includes('LLC')) return 'LLC';
    if (d.includes('Profit') && !d.includes('Non')) return 'Corporation';
    if (d.includes('Non')) return 'Nonprofit';
    if (d.includes('Partnership')) return 'Partnership';
    return 'Business Services';
}

function getContact(row) {
    try {
        const o = JSON.parse(row.officers_json || '[]');
        if (o.length > 0) { const x = o[0]; return (x.fullName || ((x.firstName||'') + ' ' + (x.lastName||'')).trim()).substring(0,200) || null; }
    } catch(e) {}
    return row.registered_agent ? row.registered_agent.substring(0,200) : null;
}

function buildBatchInsert(rows) {
    const C = 13; const values = []; const params = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const o = i * C; const ph = [];
        for (let j = 1; j <= C; j++) ph.push('$' + (o + j));
        values.push('(' + ph.join(',') + ')');
        const ed = r.entity_description || r.entity_type || '';
        params.push('sunbiz', r.doc_number, r.corp_name, r.doc_number, r.entity_type, r.status,
            r.address_line1||null, r.city||null, r.state||'FL', r.zip||null,
            getContact(r), mapIndustry(ed), ed.substring(0,100));
    }
    const sql = 'INSERT INTO danimal_leads (source,source_id,business_name,document_number,entity_type,license_status,street_address,city,state,zip_code,contact_name,industry,business_type) VALUES ' + values.join(',') + ' ON CONFLICT DO NOTHING';
    return { sql, params };
}

async function run() {
    console.log('SUNBIZ IMPORT v2.1 (BATCH)');
    if (!process.env.DATABASE_URL) { console.error('ERROR: DATABASE_URL not found in .env'); process.exit(1); }
    console.log('DB: ' + process.env.DATABASE_URL.replace(/\/\/.*:.*@/, '//***:***@'));
    const sqlite = new Database(SUNBIZ_DB, { readonly: true });
    const { cnt: total } = sqlite.prepare("SELECT COUNT(*) as cnt FROM corporations WHERE status = 'Active'").get();
    console.log('Records: ' + total.toLocaleString());

    const t = await pool.query("SELECT COUNT(*) as cnt FROM danimal_leads WHERE source = 'sunbiz'");
    const existing = parseInt(t.rows[0].cnt);
    console.log('Existing: ' + existing.toLocaleString());
    if (existing > 0) { await pool.query("DELETE FROM danimal_leads WHERE source = 'sunbiz'"); console.log('Cleared.'); }

    try { await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_danimal_leads_source_sourceid ON danimal_leads(source, source_id) WHERE source_id IS NOT NULL"); } catch(e) {}

    console.log('Importing...');
    let imported = 0, skipped = 0, errors = 0, offset = 0;
    const start = Date.now();

    while (offset < total) {
        const chunk = sqlite.prepare("SELECT * FROM corporations WHERE status = 'Active' LIMIT ? OFFSET ?").all(SQLITE_CHUNK, offset);
        if (!chunk.length) break;

        for (let i = 0; i < chunk.length; i += BATCH_SIZE) {
            const batch = chunk.slice(i, i + BATCH_SIZE);
            try {
                const q = buildBatchInsert(batch);
                const res = await pool.query(q.sql, q.params);
                imported += res.rowCount;
                skipped += batch.length - res.rowCount;
            } catch(e) {
                for (const row of batch) {
                    try {
                        const q = buildBatchInsert([row]);
                        const res = await pool.query(q.sql, q.params);
                        imported += res.rowCount;
                        skipped += 1 - res.rowCount;
                    } catch(e2) {
                        errors++;
                        if (errors <= 5) console.error('Err: ' + e2.message.substring(0,120));
                    }
                }
            }
        }
        offset += chunk.length;
        const el = (Date.now() - start) / 1000;
        const rate = Math.round(imported / Math.max(el,1));
        const eta = rate > 0 ? Math.round((total - offset) / rate / 60) : '???';
        process.stdout.write('\r  ' + imported.toLocaleString().padStart(10) + ' / ' + total.toLocaleString() + '  ' + rate + '/sec  ETA:' + eta + 'min  err:' + errors + '   ');
    }
    const el = (Date.now() - start) / 1000;
    console.log('\nDone! ' + imported.toLocaleString() + ' imported, ' + errors + ' errors, ' + (el/60).toFixed(1) + ' min');
    const v = await pool.query("SELECT COUNT(*) as cnt FROM danimal_leads WHERE source = 'sunbiz'");
    console.log('Verified: ' + parseInt(v.rows[0].cnt).toLocaleString() + ' in PostgreSQL');
    sqlite.close(); await pool.end();
}
run().catch(e => { console.error('Fatal:', e); process.exit(1); });
