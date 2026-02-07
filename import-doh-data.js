/**
 * DANIMAL DATA - Florida DOH Healthcare Practitioner Import
 * 
 * This script imports the DOH MQA licensure data into your Zenith OS database.
 * 
 * USAGE:
 *   1. Extract PROF_ALL.zip and lic_status.zip to a folder
 *   2. Update the DATA_FOLDER path below
 *   3. Run: node import-doh-data.js
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');

// ============================================
// CONFIGURATION - UPDATE THESE PATHS
// ============================================
const DATA_FOLDER = 'C:\\Users\\17242\\Downloads';  // Folder containing extracted CSV files
const PROF_ALL_FILE = 'PROF_ALL.txt';               // Main licensure file (pipe-delimited)
const LIC_STATUS_FILE = 'lic_status.txt';           // License status file

// Database connection - uses your .env file
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: { rejectUnauthorized: false }
});

// ============================================
// PROFESSION CODE MAPPING
// ============================================
const PROFESSION_MAP = {
    // Physicians
    '1501': { name: 'Medical Doctor (MD)', industry: 'Healthcare', category: 'Physicians', priority: 'high' },
    '1502': { name: 'Osteopathic Physician (DO)', industry: 'Healthcare', category: 'Physicians', priority: 'high' },
    '1504': { name: 'Physician Assistant', industry: 'Healthcare', category: 'Physicians', priority: 'high' },
    
    // Nursing
    '1601': { name: 'Registered Nurse (RN)', industry: 'Healthcare', category: 'Nursing', priority: 'medium' },
    '1602': { name: 'Licensed Practical Nurse (LPN)', industry: 'Healthcare', category: 'Nursing', priority: 'medium' },
    '1621': { name: 'Advanced Practice RN (ARNP)', industry: 'Healthcare', category: 'Nursing', priority: 'high' },
    
    // Dental
    '1101': { name: 'Dentist', industry: 'Healthcare', category: 'Dental', priority: 'high' },
    '1102': { name: 'Dental Hygienist', industry: 'Healthcare', category: 'Dental', priority: 'medium' },
    
    // Pharmacy
    '1701': { name: 'Pharmacist', industry: 'Healthcare', category: 'Pharmacy', priority: 'high' },
    '1702': { name: 'Pharmacy Technician', industry: 'Healthcare', category: 'Pharmacy', priority: 'low' },
    
    // Mental Health
    '1801': { name: 'Psychologist', industry: 'Healthcare', category: 'Mental Health', priority: 'high' },
    '1803': { name: 'Mental Health Counselor', industry: 'Healthcare', category: 'Mental Health', priority: 'medium' },
    '1805': { name: 'Clinical Social Worker', industry: 'Healthcare', category: 'Mental Health', priority: 'medium' },
    '1807': { name: 'Marriage & Family Therapist', industry: 'Healthcare', category: 'Mental Health', priority: 'medium' },
    
    // Therapy
    '1901': { name: 'Physical Therapist', industry: 'Healthcare', category: 'Therapy', priority: 'medium' },
    '1902': { name: 'Physical Therapist Assistant', industry: 'Healthcare', category: 'Therapy', priority: 'low' },
    '2001': { name: 'Occupational Therapist', industry: 'Healthcare', category: 'Therapy', priority: 'medium' },
    '2101': { name: 'Speech-Language Pathologist', industry: 'Healthcare', category: 'Therapy', priority: 'medium' },
    
    // Other Medical
    '1201': { name: 'Optometrist', industry: 'Healthcare', category: 'Vision', priority: 'high' },
    '1301': { name: 'Chiropractor', industry: 'Healthcare', category: 'Chiropractic', priority: 'high' },
    '1401': { name: 'Podiatrist', industry: 'Healthcare', category: 'Podiatry', priority: 'high' },
    '2201': { name: 'Acupuncturist', industry: 'Healthcare', category: 'Alternative', priority: 'medium' },
    '2301': { name: 'Massage Therapist', industry: 'Healthcare', category: 'Massage', priority: 'low' },
    '2401': { name: 'Respiratory Therapist', industry: 'Healthcare', category: 'Respiratory', priority: 'medium' },
    '2501': { name: 'Dietitian/Nutritionist', industry: 'Healthcare', category: 'Nutrition', priority: 'medium' },
    '2601': { name: 'Athletic Trainer', industry: 'Healthcare', category: 'Sports Medicine', priority: 'medium' },
};

// Florida county codes
const COUNTY_MAP = {
    '1': 'Alachua', '2': 'Baker', '3': 'Bay', '4': 'Bradford', '5': 'Brevard',
    '6': 'Broward', '7': 'Calhoun', '8': 'Charlotte', '9': 'Citrus', '10': 'Clay',
    '11': 'Collier', '12': 'Columbia', '13': 'Dade', '14': 'DeSoto', '15': 'Dixie',
    '16': 'Duval', '17': 'Escambia', '18': 'Flagler', '19': 'Franklin', '20': 'Gadsden',
    '21': 'Gilchrist', '22': 'Glades', '23': 'Gulf', '24': 'Hamilton', '25': 'Hardee',
    '26': 'Hendry', '27': 'Hernando', '28': 'Highlands', '29': 'Hillsborough', '30': 'Holmes',
    '31': 'Indian River', '32': 'Jackson', '33': 'Jefferson', '34': 'Lafayette', '35': 'Lake',
    '36': 'Lee', '37': 'Leon', '38': 'Levy', '39': 'Liberty', '40': 'Madison',
    '41': 'Manatee', '42': 'Marion', '43': 'Martin', '44': 'Monroe', '45': 'Nassau',
    '46': 'Okaloosa', '47': 'Okeechobee', '48': 'Orange', '49': 'Osceola', '50': 'Palm Beach',
    '51': 'Pasco', '52': 'Pinellas', '53': 'Polk', '54': 'Putnam', '55': 'Santa Rosa',
    '56': 'Sarasota', '57': 'Seminole', '58': 'St. Johns', '59': 'St. Lucie', '60': 'Sumter',
    '61': 'Suwannee', '62': 'Taylor', '63': 'Union', '64': 'Volusia', '65': 'Wakulla',
    '66': 'Walton', '67': 'Washington', '13': 'Miami-Dade'  // Dade is now Miami-Dade
};

// ============================================
// LEAD SCORING FUNCTION
// ============================================
function calculateLeadScore(record) {
    let score = 50; // Base score
    
    // Profession priority
    const profInfo = PROFESSION_MAP[record.pro_cde] || {};
    if (profInfo.priority === 'high') score += 20;
    else if (profInfo.priority === 'medium') score += 10;
    
    // Active license
    if (record.license_status === 'Active' || record.license_status === 'Clear/Active') {
        score += 15;
    }
    
    // Has email
    if (record.email && record.email.includes('@')) {
        score += 10;
    }
    
    // Has phone
    if (record.phone && record.phone.length >= 10) {
        score += 5;
    }
    
    // Florida location
    if (record.state === 'FL') {
        score += 5;
    }
    
    // Prescribing authority
    if (record.prescribe_ind === 'Y') {
        score += 10;
    }
    
    // Cap at 100
    return Math.min(100, Math.max(0, score));
}

function getLeadGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
}

// ============================================
// PARSE PIPE-DELIMITED FILE
// ============================================
async function parsePipeDelimitedFile(filePath, onRecord) {
    return new Promise((resolve, reject) => {
        const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let headers = null;
        let lineCount = 0;
        let processedCount = 0;

        rl.on('line', async (line) => {
            lineCount++;
            
            // First line is headers
            if (!headers) {
                headers = line.split('|').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                console.log(`Headers found: ${headers.length} columns`);
                return;
            }

            const values = line.split('|');
            const record = {};
            
            headers.forEach((header, index) => {
                record[header] = values[index] ? values[index].trim() : null;
            });

            await onRecord(record);
            processedCount++;
            
            if (processedCount % 10000 === 0) {
                console.log(`  Processed ${processedCount.toLocaleString()} records...`);
            }
        });

        rl.on('close', () => {
            console.log(`Finished reading ${lineCount.toLocaleString()} lines, processed ${processedCount.toLocaleString()} records`);
            resolve(processedCount);
        });

        rl.on('error', reject);
    });
}

// ============================================
// BATCH INSERT
// ============================================
class BatchInserter {
    constructor(pool, batchSize = 500) {
        this.pool = pool;
        this.batchSize = batchSize;
        this.batch = [];
        this.totalInserted = 0;
    }

    async add(record) {
        this.batch.push(record);
        if (this.batch.length >= this.batchSize) {
            await this.flush();
        }
    }

    async flush() {
        if (this.batch.length === 0) return;

        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const record of this.batch) {
            const recordPlaceholders = [];
            for (let i = 0; i < 30; i++) {
                recordPlaceholders.push(`$${paramIndex++}`);
            }
            placeholders.push(`(${recordPlaceholders.join(', ')})`);
            
            values.push(
                record.source || 'doh',
                record.source_id || null,
                record.business_name || null,
                record.dba || null,
                record.industry || 'Healthcare',
                record.business_type || null,
                record.license_number || null,
                record.license_type || null,
                record.license_status || null,
                record.license_expiration || null,
                record.document_number || null,
                record.entity_type || null,
                record.filing_date || null,
                record.fei_number || null,
                record.contact_name || null,
                record.phone || null,
                record.email || null,
                record.website || null,
                record.street_address || null,
                record.city || null,
                record.state || 'FL',
                record.zip_code || null,
                record.county || null,
                record.lead_score || 50,
                record.lead_grade || 'C',
                false, // synced_to_crm
                null,  // synced_at
                null,  // crm_lead_id
                new Date(), // created_at
                new Date()  // updated_at
            );
        }

        const query = `
            INSERT INTO danimal_leads (
                source, source_id, business_name, dba, industry, business_type,
                license_number, license_type, license_status, license_expiration,
                document_number, entity_type, filing_date, fei_number,
                contact_name, phone, email, website,
                street_address, city, state, zip_code, county,
                lead_score, lead_grade, synced_to_crm, synced_at, crm_lead_id,
                created_at, updated_at
            ) VALUES ${placeholders.join(', ')}
            ON CONFLICT (license_number) DO UPDATE SET
                license_status = EXCLUDED.license_status,
                license_expiration = EXCLUDED.license_expiration,
                phone = COALESCE(EXCLUDED.phone, danimal_leads.phone),
                email = COALESCE(EXCLUDED.email, danimal_leads.email),
                updated_at = NOW()
        `;

        try {
            await this.pool.query(query, values);
            this.totalInserted += this.batch.length;
        } catch (error) {
            console.error('Batch insert error:', error.message);
            // Try inserting one by one to find problematic records
            for (const record of this.batch) {
                try {
                    await this.insertSingle(record);
                    this.totalInserted++;
                } catch (e) {
                    // Skip problematic record
                }
            }
        }

        this.batch = [];
    }

    async insertSingle(record) {
        const query = `
            INSERT INTO danimal_leads (
                source, source_id, business_name, industry,
                license_number, license_type, license_status,
                contact_name, phone, email,
                street_address, city, state, zip_code, county,
                lead_score, lead_grade, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
            ON CONFLICT (license_number) DO NOTHING
        `;
        
        await this.pool.query(query, [
            record.source, record.source_id, record.business_name, record.industry,
            record.license_number, record.license_type, record.license_status,
            record.contact_name, record.phone, record.email,
            record.street_address, record.city, record.state, record.zip_code, record.county,
            record.lead_score, record.lead_grade
        ]);
    }
}

// ============================================
// MAIN IMPORT FUNCTION
// ============================================
async function importDOHData() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     DANIMAL DATA - DOH Healthcare Practitioner Import    ║');
    console.log('║              Main Street Group Technology                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    // First, add unique constraint if not exists
    try {
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_danimal_license_unique 
            ON danimal_leads(license_number) 
            WHERE license_number IS NOT NULL
        `);
        console.log('✓ Database index ready');
    } catch (e) {
        console.log('Note: Index may already exist');
    }

    const profAllPath = path.join(DATA_FOLDER, PROF_ALL_FILE);
    
    if (!fs.existsSync(profAllPath)) {
        console.error(`\n❌ File not found: ${profAllPath}`);
        console.log('\nPlease:');
        console.log('  1. Extract PROF_ALL.zip to your Downloads folder');
        console.log('  2. Update DATA_FOLDER path in this script if needed');
        console.log(`  3. Expected file: ${profAllPath}`);
        process.exit(1);
    }

    console.log(`\n📁 Importing from: ${profAllPath}`);
    console.log('   This may take several minutes for large files...\n');

    const inserter = new BatchInserter(pool, 500);
    const startTime = Date.now();

    await parsePipeDelimitedFile(profAllPath, async (raw) => {
        // Map DOH fields to our schema
        const profInfo = PROFESSION_MAP[raw.pro_cde] || { 
            name: raw.profession_name || 'Unknown', 
            industry: 'Healthcare', 
            category: 'Other',
            priority: 'low' 
        };

        const record = {
            source: 'doh',
            source_id: raw.lic_id || raw.file_number,
            business_name: raw.business_name || `${raw.first_name || ''} ${raw.last_name || ''}`.trim() || null,
            industry: profInfo.industry,
            business_type: profInfo.category,
            license_number: raw.license_number || raw.lic_nbr,
            license_type: profInfo.name,
            license_status: raw.license_statusdescription || raw.lic_sta_desc || 'Unknown',
            license_expiration: raw.expire_date || raw.expr_dte || null,
            contact_name: `${raw.first_name || ''} ${raw.last_name || ''}`.trim() || null,
            phone: raw.mailing_addressphone_number || raw.phone || null,
            email: raw.email || null,
            street_address: raw.mailing_address_line1 || raw.ml_addr_line1 || null,
            city: raw.mailing_address_city || raw.ml_addr_city || null,
            state: raw.mailing_address_state || raw.ml_addr_state || 'FL',
            zip_code: raw.mailing_addresszipcode || raw.ml_addr_zip || null,
            county: COUNTY_MAP[raw.county] || raw.county_description || null,
            prescribe_ind: raw.prescribe_ind
        };

        // Calculate lead score
        record.lead_score = calculateLeadScore(record);
        record.lead_grade = getLeadGrade(record.lead_score);

        await inserter.add(record);
    });

    // Flush remaining records
    await inserter.flush();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                    IMPORT COMPLETE                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n✓ Total records imported: ${inserter.totalInserted.toLocaleString()}`);
    console.log(`✓ Duration: ${duration} seconds`);
    
    // Get stats
    const stats = await pool.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE lead_grade = 'A') as grade_a,
            COUNT(*) FILTER (WHERE lead_grade = 'B') as grade_b,
            COUNT(*) FILTER (WHERE email IS NOT NULL) as has_email,
            COUNT(*) FILTER (WHERE phone IS NOT NULL) as has_phone
        FROM danimal_leads
        WHERE source = 'doh'
    `);

    const s = stats.rows[0];
    console.log(`\n📊 DOH Data Summary:`);
    console.log(`   Total DOH records: ${parseInt(s.total).toLocaleString()}`);
    console.log(`   Grade A leads: ${parseInt(s.grade_a).toLocaleString()}`);
    console.log(`   Grade B leads: ${parseInt(s.grade_b).toLocaleString()}`);
    console.log(`   With email: ${parseInt(s.has_email).toLocaleString()}`);
    console.log(`   With phone: ${parseInt(s.has_phone).toLocaleString()}`);

    await pool.end();
    console.log('\n✓ Database connection closed');
}

// Run the import
importDOHData().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
