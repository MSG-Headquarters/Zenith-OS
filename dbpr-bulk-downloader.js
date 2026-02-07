/**
 * DANIMAL DATA - DBPR Bulk CSV Downloader
 * 
 * Automatically downloads ALL public records CSV files from DBPR
 * Uses Puppeteer to navigate and click download links
 * 
 * USAGE:
 *   npm install puppeteer
 *   node dbpr-bulk-downloader.js
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ============================================
// CONFIGURATION
// ============================================
const DOWNLOAD_FOLDER = path.join(__dirname, 'dbpr-downloads');
const BASE_URL = 'https://www2.myfloridalicense.com';

// All DBPR public records pages to scrape
const DBPR_CATEGORIES = [
    { name: 'Alcoholic Beverages & Tobacco', url: '/alcoholic-beverages-and-tobacco/public-records/' },
    { name: 'Real Estate Commission', url: '/real-estate-commission/public-records/' },
    { name: 'Construction Industry', url: '/construction-industry/public-records/' },
    { name: 'Cosmetology', url: '/cosmetology/public-records/' },
    { name: 'Community Association Managers', url: '/cam/public-records/' },
    { name: 'Veterinary Medicine', url: '/veterinary-medicine/public-records/' },
    { name: 'Hotels & Restaurants - Lodging', url: '/hotels-restaurants/lodging-public-records/' },
    { name: 'Hotels & Restaurants - Food Service', url: '/hotels-restaurants/food-service-public-records/' },
    { name: 'Architecture & Interior Design', url: '/architecture-interior-design/public-records/' },
    { name: 'Auctioneers', url: '/auctioneers/public-records/' },
    { name: 'Barbers', url: '/barbers/public-records/' },
    { name: 'Building Code Administrators', url: '/building-code-administrators-inspectors/public-records/' },
    { name: 'Certified Public Accounting', url: '/cpa/public-records/' },
    { name: 'Electrical Contractors', url: '/electrical-contractors/public-records/' },
    { name: 'Employee Leasing', url: '/employee-leasing/public-records/' },
    { name: 'Engineers', url: '/engineers/public-records/' },
    { name: 'Geologists', url: '/geologists/public-records/' },
    { name: 'Home Inspectors', url: '/home-inspectors/public-records/' },
    { name: 'Landscape Architecture', url: '/landscape-architecture/public-records/' },
    { name: 'Mobile Homes', url: '/mobile-homes/public-records/' },
    { name: 'Mold-Related Services', url: '/mold-related-services/public-records/' },
    { name: 'Pilot Commissioners', url: '/pilot-commissioners/public-records/' },
    { name: 'Real Estate Appraisal Board', url: '/real-estate-appraisal-board/public-records/' },
    { name: 'Talent Agencies', url: '/talent-agencies/public-records/' },
    { name: 'Drugs, Devices & Cosmetics', url: '/drugs-devices-cosmetics/public-records/' },
    { name: 'Asbestos', url: '/asbestos/public-records/' },
    { name: 'Athlete Agents', url: '/athlete-agents/public-records/' },
    { name: 'Farm Labor', url: '/farm-labor/public-records/' },
    { name: 'Timeshares', url: '/timeshares/public-records/' },
    { name: 'Yacht & Ship', url: '/yacht-ship/public-records/' },
];

// Known direct CSV URLs (from previous research)
const KNOWN_CSV_URLS = [
    // Veterinary
    'https://www2.myfloridalicense.com/sto/file_download/extracts/lic26vt.csv',
    // Drugs, Devices, Cosmetics
    'https://www2.myfloridalicense.com/sto/file_download/extracts/lic33ddc.csv',
    // Engineering
    'https://www2.myfloridalicense.com/sto/file_download/extracts/lic09insp.csv',
    // Cosmetology (multiple files)
    'https://www2.myfloridalicense.com/sto/file_download/extracts/lic05cos.csv',
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function ensureDownloadFolder() {
    if (!fs.existsSync(DOWNLOAD_FOLDER)) {
        fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
        console.log(`📁 Created download folder: ${DOWNLOAD_FOLDER}`);
    }
}

async function downloadFile(url, filename) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(DOWNLOAD_FOLDER, filename);
        
        // Skip if already downloaded
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 1000) { // More than 1KB
                console.log(`   ⏭ Skipping (already exists): ${filename}`);
                return resolve(filePath);
            }
        }
        
        console.log(`   ⬇ Downloading: ${filename}`);
        
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(filePath);
        
        protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/csv,application/csv,text/plain,*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www2.myfloridalicense.com/'
            }
        }, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(filePath);
                return downloadFile(response.headers.location, filename).then(resolve).catch(reject);
            }
            
            if (response.statusCode === 403) {
                file.close();
                fs.unlinkSync(filePath);
                console.log(`   ❌ 403 Forbidden: ${filename}`);
                return resolve(null);
            }
            
            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(filePath);
                console.log(`   ❌ HTTP ${response.statusCode}: ${filename}`);
                return resolve(null);
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                const stats = fs.statSync(filePath);
                console.log(`   ✓ Downloaded: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                resolve(filePath);
            });
        }).on('error', (err) => {
            file.close();
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            console.log(`   ❌ Error: ${filename} - ${err.message}`);
            resolve(null);
        });
    });
}

// ============================================
// PUPPETEER SCRAPER
// ============================================

async function scrapeCategory(browser, category) {
    console.log(`\n📂 ${category.name}`);
    console.log(`   URL: ${BASE_URL}${category.url}`);
    
    const page = await browser.newPage();
    
    try {
        // Set longer timeout
        page.setDefaultTimeout(30000);
        
        // Navigate to the category page
        await page.goto(`${BASE_URL}${category.url}`, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        // Wait a bit for dynamic content
        await page.waitForTimeout(2000);
        
        // Find all CSV download links
        const csvLinks = await page.evaluate(() => {
            const links = [];
            
            // Look for links containing .csv or download patterns
            document.querySelectorAll('a[href*=".csv"], a[href*="download"], a[href*="extract"]').forEach(link => {
                const href = link.href;
                const text = link.textContent.trim();
                if (href && (href.includes('.csv') || href.includes('extract'))) {
                    links.push({ url: href, text: text });
                }
            });
            
            // Also look for links in tables that might be download links
            document.querySelectorAll('table a').forEach(link => {
                const href = link.href;
                const text = link.textContent.trim();
                if (href && !links.some(l => l.url === href)) {
                    // Check if parent row contains size info (indicates a download)
                    const row = link.closest('tr');
                    if (row && row.textContent.match(/\d+,?\d*\s*-\s*\d{2}\/\d{2}\/\d{4}/)) {
                        links.push({ url: href, text: text });
                    }
                }
            });
            
            return links;
        });
        
        console.log(`   Found ${csvLinks.length} download links`);
        
        // Download each file
        for (const link of csvLinks) {
            const filename = link.url.split('/').pop() || `${category.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.csv`;
            await downloadFile(link.url, filename);
            
            // Small delay between downloads
            await new Promise(r => setTimeout(r, 500));
        }
        
        return csvLinks.length;
        
    } catch (error) {
        console.log(`   ❌ Error scraping: ${error.message}`);
        return 0;
    } finally {
        await page.close();
    }
}

// ============================================
// ALTERNATIVE: Direct URL Download
// ============================================

async function downloadKnownFiles() {
    console.log('\n📥 Downloading known CSV files directly...\n');
    
    let downloaded = 0;
    
    for (const url of KNOWN_CSV_URLS) {
        const filename = url.split('/').pop();
        const result = await downloadFile(url, filename);
        if (result) downloaded++;
    }
    
    return downloaded;
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║       DANIMAL DATA - DBPR Bulk CSV Downloader            ║');
    console.log('║              Main Street Group Technology                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    
    ensureDownloadFolder();
    
    const startTime = Date.now();
    let totalFiles = 0;
    
    // First try direct downloads (faster, no browser needed)
    console.log('Phase 1: Direct URL Downloads');
    console.log('─'.repeat(50));
    totalFiles += await downloadKnownFiles();
    
    // Then use Puppeteer to scrape and download from each category
    console.log('\nPhase 2: Puppeteer Web Scraping');
    console.log('─'.repeat(50));
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security'
        ]
    });
    
    try {
        for (const category of DBPR_CATEGORIES) {
            const count = await scrapeCategory(browser, category);
            totalFiles += count;
            
            // Delay between categories to avoid rate limiting
            await new Promise(r => setTimeout(r, 1000));
        }
    } finally {
        await browser.close();
    }
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                  DOWNLOAD COMPLETE                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n✓ Total files processed: ${totalFiles}`);
    console.log(`✓ Duration: ${duration} minutes`);
    console.log(`✓ Download folder: ${DOWNLOAD_FOLDER}`);
    
    // List downloaded files
    const files = fs.readdirSync(DOWNLOAD_FOLDER);
    console.log(`\n📁 Downloaded files (${files.length}):`);
    
    let totalSize = 0;
    for (const file of files) {
        const stats = fs.statSync(path.join(DOWNLOAD_FOLDER, file));
        totalSize += stats.size;
        console.log(`   ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    console.log(`\n   Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('\n✓ Next step: Run import-dbpr-data.js to import into database');
}

main().catch(err => {
    console.error('Download failed:', err);
    process.exit(1);
});
