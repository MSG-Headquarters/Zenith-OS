const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: { rejectUnauthorized: false }
});

const remainingFiles = {
    'hrlodge1.csv':  { industry: 'Lodging', subtype: 'District 1' },
    'hrlodge2.csv':  { industry: 'Lodging', subtype: 'District 2' },
    'hrlodge3.csv':  { industry: 'Lodging', subtype: 'District 3' },
    'hrlodge4.csv':  { industry: 'Lodging', subtype: 'District 4' },
    'hrlodge5.csv':  { industry: 'Lodging', subtype: 'District 5' },
    'hrlodge6.csv':  { industry: 'Lodging', subtype: 'District 6' },
    'hrlodge7.csv':  { industry: 'Lodging', subtype: 'District 7' },
    'lic02ai.csv':   { industry: 'Asbestos/Lead Abatement' },
    'lic03bb.csv':   { industry: 'Barbers & Cosmetology' },
    'lic04home.csv': { industry: 'Home Inspection' },
    'lic07mold.csv': { industry: 'Mold Assessment' },
    'lic08el.csv':   { industry: 'Electrical' },
    'lic09insp.csv': { industry: 'Home Inspection' },
    'lic13la.csv':   { industry: 'Landscape Architecture' },
    'lic23hp.csv':   { industry: 'Harbor Pilots' },
    'lic26vt.csv':   { industry: 'Veterinary' },
    'lic33ddc.csv':  { industry: 'Drugs/Devices/Cosmetics' },
    'lic38cam.csv':  { industry: 'Community Association Manager' },
    'lic48auc.csv':  { industry: 'Auctioneers' },
    'lic53gl.csv':   { industry: 'Geologists' },
    'lic59asb.csv':  { industry: 'Asbestos' },
    'lic60ath.csv':  { industry: 'Athletic Agents' },
    'lic63elc.csv':  { industry: 'Employee Leasing' },
    'lic64appr.csv': { industry: 'Appraisers' },
    'elv_prmt.csv':  { industry: 'Elevator', subtype: 'Permits' },
    'newlodg.csv':   { industry: 'Lodging', subtype: 'New' }
};

async function importFile(filename, config) {
    const filepath = path.join('./dbpr-downloads', filename);
    if (!fs.existsSync(filepath)) {
        console.log('   [' + filename + '] NOT FOUND - skipping');
        return 0;
    }
    
    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    console.log('   [' + filename + '] ' + lines.length + ' lines...');
    
    let imported = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        if (i === 0 && (line.includes('LicenseNumber') || line.includes('License Number') || line.includes('LICENSEE'))) {
            continue;
        }
        
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        if (cols.length < 10) continue;
        
        const licNum = cols[12] || cols[0] || '';
        if (!licNum) continue;
        
        try {
            await pool.query(
                'INSERT INTO danimal_leads (license_number, business_name, dba, address, city, state, zip, county, industry, license_type, license_status, source, lead_grade) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (license_number, source) DO NOTHING',
                [
                    licNum,
                    cols[2] || '',
                    cols[3] || '',
                    cols[4] || '',
                    cols[5] || '',
                    cols[6] || 'FL',
                    cols[7] || '',
                    cols[8] || '',
                    config.industry,
                    cols[1] || config.subtype || '',
                    cols[14] || 'Active',
                    'dbpr',
                    'B'
                ]
            );
            imported++;
        } catch (e) {
            // skip duplicates
        }
        
        if (imported % 5000 === 0 && imported > 0) {
            console.log('   [' + filename + '] ' + imported + ' imported...');
        }
    }
    console.log('   [' + filename + '] DONE: ' + imported + ' records');
    return imported;
}

async function main() {
    console.log('\nDANIMAL DATA - Importing remaining DBPR files...\n');
    let total = 0;
    
    for (const [filename, config] of Object.entries(remainingFiles)) {
        total += await importFile(filename, config);
    }
    
    console.log('\nComplete! Imported ' + total + ' additional records');
    
    const result = await pool.query('SELECT COUNT(*) as total FROM danimal_leads');
    console.log('Total records in database: ' + result.rows[0].total);
    
    await pool.end();
}

main().catch(console.error);