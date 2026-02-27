const {Pool} = require('pg');
const pool = new Pool({
    connectionString: 'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: { rejectUnauthorized: false }
});

async function createIntelTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS intel_projects (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER,
                created_by INTEGER,
                title VARCHAR(255),
                property_address TEXT,
                property_city VARCHAR(100),
                property_state VARCHAR(2) DEFAULT 'FL',
                property_zip VARCHAR(10),
                lat DECIMAL(10,7),
                lng DECIMAL(10,7),
                property_type VARCHAR(50),
                transaction_type VARCHAR(50),
                property_size DECIMAL(12,2),
                size_unit VARCHAR(10) DEFAULT 'SF',
                price DECIMAL(12,2),
                price_unit VARCHAR(20),
                lead_id INTEGER,
                notes TEXT,
                status VARCHAR(20) DEFAULT 'draft',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('intel_projects created');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS intel_pages (
                id SERIAL PRIMARY KEY,
                project_id INTEGER REFERENCES intel_projects(id) ON DELETE CASCADE,
                page_type VARCHAR(50),
                page_number INTEGER DEFAULT 1,
                canvas_data TEXT,
                status VARCHAR(20) DEFAULT 'draft',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('intel_pages created');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS intel_exports (
                id SERIAL PRIMARY KEY,
                project_id INTEGER REFERENCES intel_projects(id) ON DELETE CASCADE,
                export_type VARCHAR(20),
                file_path TEXT,
                linkedin_shared BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('intel_exports created');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS intel_logos (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER,
                name VARCHAR(255),
                file_path TEXT,
                width_px INTEGER,
                height_px INTEGER,
                is_global BOOLEAN DEFAULT false,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('intel_logos created');

        console.log('All INTEL tables created successfully!');
    } catch (err) {
        console.error('Error:', err.message);
    }
    await pool.end();
}

createIntelTables();