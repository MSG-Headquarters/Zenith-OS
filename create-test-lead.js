require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function createTestLead() {
    // Get org ID (CRE Consultants)
    const orgResult = await pool.query("SELECT id FROM organizations LIMIT 1");
    const orgId = orgResult.rows[0]?.id || 1;
    
    // Create a test Closed Won lead with property data
    const result = await pool.query(`
        INSERT INTO leads (
            organization_id, name, email, phone, company, value, stage, source,
            property_address, property_city, property_state, property_zip, property_type, property_sqft
        ) VALUES (
            $1, 'Test Property Deal', 'test@example.com', '239-555-0100', 
            'Colonial Plaza Shopping Center', 2500000, 'Closed Won', 'Direct',
            '1500 Colonial Blvd', 'Fort Myers', 'FL', '33907', 'Retail', 45000
        ) RETURNING id, name, company, stage, property_address
    `, [orgId]);
    
    console.log('Test lead created:');
    console.log(result.rows[0]);
    
    pool.end();
}
createTestLead().catch(console.error);
