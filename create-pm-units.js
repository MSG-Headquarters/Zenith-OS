require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('[1/4] Creating pm_units table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS pm_units (
                id SERIAL PRIMARY KEY,
                property_id INTEGER REFERENCES pm_properties(id) NOT NULL,
                unit_number VARCHAR(20) NOT NULL,
                square_feet INTEGER,
                floor VARCHAR(10),
                unit_type VARCHAR(50) DEFAULT 'Commercial',
                asking_rent NUMERIC(10,2),
                asking_rent_type VARCHAR(20) DEFAULT 'SF/YR',
                status VARCHAR(20) DEFAULT 'Vacant',
                tenant_id INTEGER REFERENCES pm_tenants(id),
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(property_id, unit_number)
            )
        `);
        console.log('  + pm_units created');

        await client.query('CREATE INDEX IF NOT EXISTS idx_pm_units_property ON pm_units(property_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_pm_units_status ON pm_units(status)');
        console.log('  + indexes created');

        console.log('\n[2/4] Populating from existing tenants...');
        // Insert occupied units from pm_tenants
        var tenants = await client.query(`
            SELECT t.id as tenant_id, t.property_id, t.unit_number, t.unit_sqft, t.tenant_status,
                   p.short_name
            FROM pm_tenants t
            JOIN pm_properties p ON t.property_id = p.id
            WHERE t.tenant_status IN ('Current','MTM') AND t.unit_number IS NOT NULL
            ORDER BY p.short_name, t.unit_number
        `);

        var inserted = 0;
        for (var t of tenants.rows) {
            try {
                await client.query(`
                    INSERT INTO pm_units (property_id, unit_number, square_feet, status, tenant_id)
                    VALUES ($1, $2, $3, 'Occupied', $4)
                    ON CONFLICT (property_id, unit_number) DO UPDATE SET
                        tenant_id = $4, status = 'Occupied', square_feet = COALESCE(EXCLUDED.square_feet, pm_units.square_feet)
                `, [t.property_id, t.unit_number, t.unit_sqft || null, t.tenant_id]);
                inserted++;
            } catch(e) {
                console.log('  ! Skip duplicate:', t.short_name, t.unit_number, e.message);
            }
        }
        console.log('  + ' + inserted + ' occupied units inserted');

        console.log('\n[3/4] Adding vacant units for known gaps...');
        // For properties where total_units > occupied units, add vacant placeholders
        var props = await client.query(`
            SELECT p.id, p.short_name, p.total_units,
                   (SELECT COUNT(*) FROM pm_units u WHERE u.property_id = p.id) as unit_count
            FROM pm_properties p
            WHERE p.is_active = true AND p.total_units IS NOT NULL
            ORDER BY p.short_name
        `);

        var vacantAdded = 0;
        for (var p of props.rows) {
            var gap = (p.total_units || 0) - (p.unit_count || 0);
            if (gap > 0) {
                // Get highest existing unit number to continue from
                var existing = await client.query(
                    "SELECT unit_number FROM pm_units WHERE property_id = $1 ORDER BY unit_number", [p.id]
                );
                var existingNums = existing.rows.map(function(r) { return r.unit_number; });
                
                for (var i = 0; i < gap; i++) {
                    var vNum = 'V' + String(i + 1).padStart(2, '0');
                    // Make sure we don't collide
                    while (existingNums.includes(vNum)) { vNum = 'V' + String(parseInt(vNum.slice(1)) + 1).padStart(2, '0'); }
                    try {
                        await client.query(
                            "INSERT INTO pm_units (property_id, unit_number, status) VALUES ($1, $2, 'Vacant') ON CONFLICT DO NOTHING",
                            [p.id, vNum]
                        );
                        existingNums.push(vNum);
                        vacantAdded++;
                    } catch(e) {}
                }
                console.log('  + ' + p.short_name + ': added ' + gap + ' vacant unit(s)');
            }
        }
        console.log('  + ' + vacantAdded + ' vacant units added');

        console.log('\n[4/4] Verifying...');
        var summary = await client.query(`
            SELECT status, COUNT(*) as c FROM pm_units GROUP BY status ORDER BY status
        `);
        summary.rows.forEach(function(r) { console.log('  ' + r.status + ': ' + r.c); });
        var total = await client.query('SELECT COUNT(*) as c FROM pm_units');
        console.log('  Total units: ' + total.rows[0].c);

        await client.query('COMMIT');
        console.log('\n==============================');
        console.log('PM UNITS MIGRATION COMPLETE');
        console.log('==============================');
    } catch(e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e.message);
    } finally {
        client.release();
        pool.end();
    }
}
migrate();
