/**
 * DANIMAL DATA - DBPR Direct Download Script
 * 
 * Downloads ALL DBPR public records CSV files using direct URLs
 * No Puppeteer needed - just Node.js
 * 
 * USAGE:
 *   node dbpr-direct-download.js
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================
// CONFIGURATION
// ============================================
const DOWNLOAD_FOLDER = path.join(__dirname, 'dbpr-downloads');

// DBPR uses consistent URL patterns for CSV downloads
const DBPR_BASE = 'https://www2.myfloridalicense.com/sto/file_download/extracts/';
const ABT_BASE = 'https://www2.myfloridalicense.com/sto/file_download/abt/';

// ============================================
// ALL KNOWN DBPR CSV FILES
// ============================================
const DBPR_FILES = [
    // ─────────────────────────────────────────
    // VETERINARY MEDICINE (Board 26)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic26vt.csv`, name: 'Veterinarians', category: 'Healthcare' },
    
    // ─────────────────────────────────────────
    // DRUGS, DEVICES & COSMETICS (Division 33)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic33ddc.csv`, name: 'Drugs Devices Cosmetics', category: 'Healthcare' },
    
    // ─────────────────────────────────────────
    // COSMETOLOGY (Board 05)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic05cos.csv`, name: 'Cosmetology All', category: 'Personal Services' },
    
    // ─────────────────────────────────────────
    // CONSTRUCTION INDUSTRY (Board 48/49)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic48clb.csv`, name: 'Construction Licensing Board', category: 'Construction' },
    { url: `${DBPR_BASE}lic49eli.csv`, name: 'Electrical Contractors', category: 'Construction' },
    
    // ─────────────────────────────────────────
    // REAL ESTATE (Board 83)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic83re.csv`, name: 'Real Estate All', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_corp.csv`, name: 'Real Estate Corps', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_alachua.csv`, name: 'RE Alachua County', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_bay.csv`, name: 'RE Bay County', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_broward.csv`, name: 'RE Broward County', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_duval.csv`, name: 'RE Duval County', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_hillsborough.csv`, name: 'RE Hillsborough County', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_lee.csv`, name: 'RE Lee County', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_dade.csv`, name: 'RE Miami-Dade County', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_orange.csv`, name: 'RE Orange County', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_palmbeach.csv`, name: 'RE Palm Beach County', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_pinellas.csv`, name: 'RE Pinellas County', category: 'Real Estate' },
    { url: `${DBPR_BASE}re_collier.csv`, name: 'RE Collier County', category: 'Real Estate' },
    
    // ─────────────────────────────────────────
    // REAL ESTATE APPRAISAL (Board 84)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic84rea.csv`, name: 'Real Estate Appraisers', category: 'Real Estate' },
    
    // ─────────────────────────────────────────
    // COMMUNITY ASSOCIATION MANAGERS (Board 61)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic61cam.csv`, name: 'Community Association Managers', category: 'Property Management' },
    
    // ─────────────────────────────────────────
    // ENGINEERS (Board 09)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic09eng.csv`, name: 'Professional Engineers', category: 'Professional' },
    { url: `${DBPR_BASE}lic09insp.csv`, name: 'Engineer Inspectors', category: 'Professional' },
    
    // ─────────────────────────────────────────
    // ARCHITECTS (Board 02)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic02arch.csv`, name: 'Architects', category: 'Professional' },
    { url: `${DBPR_BASE}lic02int.csv`, name: 'Interior Designers', category: 'Professional' },
    
    // ─────────────────────────────────────────
    // LANDSCAPE ARCHITECTS (Board 13)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic13la.csv`, name: 'Landscape Architects', category: 'Professional' },
    
    // ─────────────────────────────────────────
    // GEOLOGISTS (Board 55)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic55geo.csv`, name: 'Geologists', category: 'Professional' },
    
    // ─────────────────────────────────────────
    // ACCOUNTANTS / CPA (Board 01)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic01cpa.csv`, name: 'CPAs', category: 'Financial Services' },
    
    // ─────────────────────────────────────────
    // BARBERS (Board 04)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic04bar.csv`, name: 'Barbers', category: 'Personal Services' },
    
    // ─────────────────────────────────────────
    // AUCTIONEERS (Board 03)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic03auc.csv`, name: 'Auctioneers', category: 'Professional' },
    
    // ─────────────────────────────────────────
    // HOME INSPECTORS (Board 57)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic57hi.csv`, name: 'Home Inspectors', category: 'Real Estate' },
    
    // ─────────────────────────────────────────
    // MOLD (Board 70)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic70mold.csv`, name: 'Mold Assessors', category: 'Construction' },
    
    // ─────────────────────────────────────────
    // HOTELS & RESTAURANTS (Board 20)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic20hr.csv`, name: 'Hotels Restaurants All', category: 'Hospitality' },
    { url: `${DBPR_BASE}hr_lodging.csv`, name: 'Lodging', category: 'Hospitality' },
    { url: `${DBPR_BASE}hr_food.csv`, name: 'Food Service', category: 'Hospitality' },
    
    // ─────────────────────────────────────────
    // MOBILE HOMES (Board 63)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic63mh.csv`, name: 'Mobile Home Dealers', category: 'Real Estate' },
    
    // ─────────────────────────────────────────
    // TALENT AGENCIES (Board 35)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic35ta.csv`, name: 'Talent Agencies', category: 'Entertainment' },
    
    // ─────────────────────────────────────────
    // EMPLOYEE LEASING (Board 52)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic52el.csv`, name: 'Employee Leasing', category: 'Business Services' },
    
    // ─────────────────────────────────────────
    // ASBESTOS (Board 73)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic73asb.csv`, name: 'Asbestos Contractors', category: 'Construction' },
    
    // ─────────────────────────────────────────
    // BUILDING CODE (Board 42)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic42bca.csv`, name: 'Building Code Administrators', category: 'Construction' },
    
    // ─────────────────────────────────────────
    // PILOT COMMISSIONERS (Board 31)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic31pil.csv`, name: 'Harbor Pilots', category: 'Maritime' },
    
    // ─────────────────────────────────────────
    // ATHLETE AGENTS (Board 74)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic74aa.csv`, name: 'Athlete Agents', category: 'Sports' },
    
    // ─────────────────────────────────────────
    // FARM LABOR (Board 56)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic56fl.csv`, name: 'Farm Labor Contractors', category: 'Agriculture' },
    
    // ─────────────────────────────────────────
    // TIMESHARES (Board 89)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic89ts.csv`, name: 'Timeshare Resales', category: 'Real Estate' },
    
    // ─────────────────────────────────────────
    // YACHT & SHIP (Board 91)
    // ─────────────────────────────────────────
    { url: `${DBPR_BASE}lic91ys.csv`, name: 'Yacht Ship Brokers', category: 'Maritime' },
    
    // ═══════════════════════════════════════════
    // ALCOHOLIC BEVERAGES & TOBACCO (Division 40)
    // ═══════════════════════════════════════════
    { url: `${ABT_BASE}bd4008lic.csv`, name: 'AB Brands', category: 'Hospitality' },
    { url: `${ABT_BASE}bd4009lic.csv`, name: 'AB Brand Registrants', category: 'Hospitality' },
    { url: `${ABT_BASE}bd4001lic.csv`, name: 'AB Distributors Manufacturers', category: 'Hospitality' },
    { url: `${ABT_BASE}bd4002lic.csv`, name: 'AB Retail Licensees', category: 'Hospitality' },
    { url: `${ABT_BASE}bd4007lic.csv`, name: 'AB Revoked Licensees', category: 'Hospitality' },
    { url: `${ABT_BASE}bd4003lic.csv`, name: 'Bottle Clubs', category: 'Hospitality' },
    { url: `${ABT_BASE}bd4004lic.csv`, name: 'Cigarette Tobacco', category: 'Retail' },
    { url: `${ABT_BASE}bd4005lic.csv`, name: 'Other AB Permits', category: 'Hospitality' },
    { url: `${ABT_BASE}bd4006lic.csv`, name: 'Passenger Carrier', category: 'Transportation' },
];

// ============================================
// DOWNLOAD FUNCTION
// ============================================

function downloadFile(fileInfo) {
    return new Promise((resolve) => {
        const filename = fileInfo.url.split('/').pop();
        const filePath = path.join(DOWNLOAD_FOLDER, filename);
        
        // Skip if already exists and has content
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 1000) {
                console.log(`   ⏭ ${filename} (already exists - ${(stats.size/1024/1024).toFixed(1)}MB)`);
                return resolve({ success: true, skipped: true, file: filename });
            }
        }
        
        process.stdout.write(`   ⬇ ${fileInfo.name}... `);
        
        const file = fs.createWriteStream(filePath);
        
        https.get(fileInfo.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Referer': 'https://www2.myfloridalicense.com/'
            }
        }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(filePath);
                // Follow redirect
                fileInfo.url = response.headers.location;
                return downloadFile(fileInfo).then(resolve);
            }
            
            if (response.statusCode !== 200) {
                file.close();
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                console.log(`❌ HTTP ${response.statusCode}`);
                return resolve({ success: false, error: `HTTP ${response.statusCode}`, file: filename });
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                const stats = fs.statSync(filePath);
                const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
                console.log(`✓ ${sizeMB} MB`);
                resolve({ success: true, file: filename, size: stats.size });
            });
            
        }).on('error', (err) => {
            file.close();
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            console.log(`❌ ${err.message}`);
            resolve({ success: false, error: err.message, file: filename });
        });
    });
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     DANIMAL DATA - DBPR Direct CSV Downloader            ║');
    console.log('║              Main Street Group Technology                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    
    // Create download folder
    if (!fs.existsSync(DOWNLOAD_FOLDER)) {
        fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
    }
    
    console.log(`📁 Download folder: ${DOWNLOAD_FOLDER}`);
    console.log(`📋 Files to download: ${DBPR_FILES.length}`);
    console.log('');
    
    const startTime = Date.now();
    const results = { success: 0, failed: 0, skipped: 0, totalSize: 0 };
    
    // Group by category for organized output
    const byCategory = {};
    DBPR_FILES.forEach(f => {
        if (!byCategory[f.category]) byCategory[f.category] = [];
        byCategory[f.category].push(f);
    });
    
    for (const [category, files] of Object.entries(byCategory)) {
        console.log(`\n📂 ${category}`);
        console.log('─'.repeat(50));
        
        for (const fileInfo of files) {
            const result = await downloadFile(fileInfo);
            
            if (result.success) {
                if (result.skipped) {
                    results.skipped++;
                } else {
                    results.success++;
                    results.totalSize += result.size || 0;
                }
            } else {
                results.failed++;
            }
            
            // Small delay to be nice to the server
            await new Promise(r => setTimeout(r, 300));
        }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                  DOWNLOAD COMPLETE                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n✓ Downloaded: ${results.success} files (${(results.totalSize/1024/1024).toFixed(1)} MB)`);
    console.log(`⏭ Skipped: ${results.skipped} files (already existed)`);
    console.log(`❌ Failed: ${results.failed} files`);
    console.log(`⏱ Duration: ${duration} seconds`);
    console.log(`\n📁 Files saved to: ${DOWNLOAD_FOLDER}`);
    console.log('\n✓ Next step: Run import-dbpr-data.js to import into database');
}

main().catch(err => {
    console.error('Download failed:', err);
    process.exit(1);
});
