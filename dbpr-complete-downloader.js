/**
 * DANIMAL DATA - DBPR Complete Downloader
 * 
 * Downloads ALL verified DBPR CSV files (64 files)
 * No Puppeteer needed - just Node.js
 * 
 * USAGE:
 *   node dbpr-complete-downloader.js
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

// ============================================
// ALL 64 VERIFIED DBPR URLs
// ============================================
const VERIFIED_FILES = [
    // ══════════════════════════════════════════════
    // ALCOHOLIC BEVERAGES & TOBACCO (14 files)
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4008lic.csv', name: 'AB Brands', category: 'Alcoholic Beverages' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4011lic.csv', name: 'AB Brand Registrants', category: 'Alcoholic Beverages' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4005lic.csv', name: 'AB Other Permits', category: 'Alcoholic Beverages' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd400lic.csv', name: 'AB Main Licenses', category: 'Alcoholic Beverages' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4014lic.csv', name: 'AB File 14', category: 'Alcoholic Beverages' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4001lic.csv', name: 'AB Distributors Manufacturers', category: 'Alcoholic Beverages' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4003lic.csv', name: 'Bottle Clubs', category: 'Alcoholic Beverages' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4004lic.csv', name: 'Cigarette Tobacco Distributors', category: 'Tobacco' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4006lic.csv', name: 'Passenger Carrier', category: 'Transportation' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4007lic.csv', name: 'AB Revoked Licenses', category: 'Alcoholic Beverages' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bdTOBlic.csv', name: 'Tobacco All', category: 'Tobacco' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4012lic.csv', name: 'AB File 12', category: 'Alcoholic Beverages' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4002lic.csv', name: 'AB Retail Licenses', category: 'Alcoholic Beverages' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4013lic.csv', name: 'AB File 13', category: 'Alcoholic Beverages' },

    // ══════════════════════════════════════════════
    // ARCHITECTURE & DESIGN
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic02ai.csv', name: 'Architects Interior Designers', category: 'Architecture' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/examegbl02ai.csv', name: 'Architect Exam Applicants', category: 'Architecture' },

    // ══════════════════════════════════════════════
    // ASBESTOS & ENVIRONMENTAL
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic59asb.csv', name: 'Asbestos Consultants', category: 'Environmental' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic07mold.csv', name: 'Mold Assessors Remediators', category: 'Environmental' },

    // ══════════════════════════════════════════════
    // PROFESSIONAL LICENSES
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic60ath.csv', name: 'Athletic Agents', category: 'Professional' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic48auc.csv', name: 'Auctioneers', category: 'Professional' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic53gl.csv', name: 'Geologists', category: 'Professional' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic13la.csv', name: 'Landscape Architects', category: 'Professional' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic09insp.csv', name: 'Engineer Inspectors', category: 'Professional' },

    // ══════════════════════════════════════════════
    // PERSONAL SERVICES
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic03bb.csv', name: 'Barbers', category: 'Personal Services' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/COSMETOLOGYLICENSE_1.csv', name: 'Cosmetology Licenses', category: 'Personal Services' },

    // ══════════════════════════════════════════════
    // CONSTRUCTION
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/BuildingCodeLicensee.csv', name: 'Building Code Officials', category: 'Construction' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/CONSTRUCTIONLICENSE_1.csv', name: 'Construction Licenses', category: 'Construction' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic08el.csv', name: 'Electrical Contractors', category: 'Construction' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/elv_prmt.csv', name: 'Elevator Permits', category: 'Construction' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic63elc.csv', name: 'Elevator Contractors', category: 'Construction' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/examappr06cn.csv', name: 'Construction Exam Applicants', category: 'Construction' },

    // ══════════════════════════════════════════════
    // FINANCIAL
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/cpa/licensereports/cpalicensedata20250714.xlsx', name: 'CPAs', category: 'Financial' },

    // ══════════════════════════════════════════════
    // REAL ESTATE - CONDOMINIUMS (5 regions)
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/Condo_NF.csv', name: 'Condos North Florida', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/condo_CE.csv', name: 'Condos Central East', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/Condo_CW.csv', name: 'Condos Central West', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/Condo_MD.csv', name: 'Condos Miami-Dade', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/condo_PB.csv', name: 'Condos Palm Beach', category: 'Real Estate' },

    // ══════════════════════════════════════════════
    // REAL ESTATE - CORE FILES
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/RealEstateCorpLicense.csv', name: 'Real Estate Corps', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/REALESTATE2501LICENSE_1.csv', name: 'Real Estate Brokers', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/re_salesperson.csv', name: 'Real Estate Salespersons', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic64appr.csv', name: 'Real Estate Appraisers', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/RealEstateSchoolLicense.csv', name: 'Real Estate Schools', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic04home.csv', name: 'Home Inspectors', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic38cam.csv', name: 'Community Association Managers', category: 'Real Estate' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/examappl38cam.csv', name: 'CAM Exam Applicants', category: 'Real Estate' },

    // ══════════════════════════════════════════════
    // MARINE
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/ysmailing.csv', name: 'Yacht Ship Brokers', category: 'Marine' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic23hp.csv', name: 'Harbor Pilots', category: 'Marine' },

    // ══════════════════════════════════════════════
    // HEALTHCARE
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic26vt.csv', name: 'Veterinarians', category: 'Healthcare' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic33ddc.csv', name: 'Drugs Devices Cosmetics', category: 'Healthcare' },

    // ══════════════════════════════════════════════
    // BUSINESS SERVICES
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/company.csv', name: 'Employee Leasing Companies', category: 'Business Services' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/FarmLabor.csv', name: 'Farm Labor Contractors', category: 'Agriculture' },

    // ══════════════════════════════════════════════
    // HOTELS & LODGING (8 files)
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrlodge1.csv', name: 'Hotels Region 1', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrlodge2.csv', name: 'Hotels Region 2', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrlodge3.csv', name: 'Hotels Region 3', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrlodge4.csv', name: 'Hotels Region 4', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrlodge5.csv', name: 'Hotels Region 5', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrlodge6.csv', name: 'Hotels Region 6', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrlodge7.csv', name: 'Hotels Region 7', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/newlodg.csv', name: 'New Lodging', category: 'Hotels & Restaurants' },

    // ══════════════════════════════════════════════
    // RESTAURANTS / FOOD SERVICE (7 files)
    // ══════════════════════════════════════════════
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood1.csv', name: 'Food Service Region 1', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood2.csv', name: 'Food Service Region 2', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood3.csv', name: 'Food Service Region 3', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood4.csv', name: 'Food Service Region 4', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood5.csv', name: 'Food Service Region 5', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood6.csv', name: 'Food Service Region 6', category: 'Hotels & Restaurants' },
    { url: 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood7.csv', name: 'Food Service Region 7', category: 'Hotels & Restaurants' },
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
                console.log(`   ⏭ ${filename} (exists - ${(stats.size/1024/1024).toFixed(2)} MB)`);
                return resolve({ success: true, skipped: true, file: filename, size: stats.size });
            }
        }
        
        process.stdout.write(`   ⬇ ${fileInfo.name}... `);
        
        const file = fs.createWriteStream(filePath);
        
        const protocol = fileInfo.url.startsWith('https') ? https : require('http');
        
        protocol.get(fileInfo.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/csv,application/csv,application/vnd.ms-excel,*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www2.myfloridalicense.com/'
            }
        }, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                const newUrl = response.headers.location;
                console.log(`→ redirect`);
                fileInfo.url = newUrl.startsWith('http') ? newUrl : `https://www2.myfloridalicense.com${newUrl}`;
                return downloadFile(fileInfo).then(resolve);
            }
            
            if (response.statusCode !== 200) {
                file.close();
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                console.log(`✗ HTTP ${response.statusCode}`);
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
            console.log(`✗ ${err.message}`);
            resolve({ success: false, error: err.message, file: filename });
        });
    });
}

// ============================================
// MAIN
// ============================================
async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     DANIMAL DATA - DBPR Complete Downloader              ║');
    console.log('║              Main Street Group Technology                ║');
    console.log('║                    64 Verified URLs                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    
    // Create download folder
    if (!fs.existsSync(DOWNLOAD_FOLDER)) {
        fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
    }
    
    console.log(`📁 Download folder: ${DOWNLOAD_FOLDER}`);
    console.log(`📋 Files to download: ${VERIFIED_FILES.length}`);
    console.log('');
    
    const startTime = Date.now();
    const results = { success: 0, failed: 0, skipped: 0, totalSize: 0 };
    const failedFiles = [];
    
    // Group by category
    const byCategory = {};
    VERIFIED_FILES.forEach(f => {
        if (!byCategory[f.category]) byCategory[f.category] = [];
        byCategory[f.category].push(f);
    });
    
    for (const [category, files] of Object.entries(byCategory)) {
        console.log(`\n📂 ${category} (${files.length} files)`);
        console.log('─'.repeat(50));
        
        for (const fileInfo of files) {
            const result = await downloadFile(fileInfo);
            
            if (result.success) {
                if (result.skipped) {
                    results.skipped++;
                    results.totalSize += result.size || 0;
                } else {
                    results.success++;
                    results.totalSize += result.size || 0;
                }
            } else {
                results.failed++;
                failedFiles.push({ name: fileInfo.name, error: result.error });
            }
            
            // Small delay to be nice to the server
            await new Promise(r => setTimeout(r, 300));
        }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                  DOWNLOAD COMPLETE                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n✓ Downloaded: ${results.success} files`);
    console.log(`⏭ Skipped: ${results.skipped} files (already existed)`);
    console.log(`✗ Failed: ${results.failed} files`);
    console.log(`📦 Total size: ${(results.totalSize/1024/1024).toFixed(1)} MB`);
    console.log(`⏱ Duration: ${duration} seconds`);
    console.log(`\n📁 Files saved to: ${DOWNLOAD_FOLDER}`);
    
    // Show failed files
    if (failedFiles.length > 0) {
        console.log('\n⚠ Failed downloads:');
        failedFiles.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
    }
    
    // List all downloaded files
    console.log('\n📋 Downloaded files:');
    const files = fs.readdirSync(DOWNLOAD_FOLDER);
    let totalActualSize = 0;
    files.sort().forEach(f => {
        const stats = fs.statSync(path.join(DOWNLOAD_FOLDER, f));
        totalActualSize += stats.size;
        console.log(`   ${f} (${(stats.size/1024/1024).toFixed(2)} MB)`);
    });
    console.log(`\n   TOTAL: ${files.length} files, ${(totalActualSize/1024/1024).toFixed(1)} MB`);
}

main().catch(err => {
    console.error('Download failed:', err);
    process.exit(1);
});
