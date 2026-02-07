/**
 * CRE Flyer Generator - Main Entry Point
 * 
 * This module provides the main API for generating CRE listing flyers.
 * 
 * Usage:
 *   const { generateFlyer } = require('./src/index');
 *   await generateFlyer(listingData, './output/flyer.pdf');
 */

const path = require('path');
const fs = require('fs').promises;

const { CREConsultantsBrand, createBrandConfig } = require('./config/brand');
const { createListing } = require('./config/schema');
const { generatePage1HTML } = require('./templates/page1');
const { generatePage2HTML } = require('./templates/page2');
const { getPDFGenerator } = require('./services/pdfGenerator');

/**
 * Flyer generation options
 */
const defaultOptions = {
  pages: [1, 2],           // Which pages to include
  format: 'pdf',           // 'pdf' or 'html' or 'png'
  brand: null,             // Custom brand config (for white-label)
  license: null,           // Zenith OS license data (future)
  outputDir: './output',   // Output directory
  filename: null,          // Custom filename (auto-generated if null)
  preview: false,          // Generate preview image instead of PDF
};

/**
 * Generate a complete listing flyer
 * 
 * @param {Object} listingData - Listing data object
 * @param {Object} options - Generation options
 * @returns {Object} - { pdf: filepath, html: [html strings], preview: filepath }
 */
async function generateFlyer(listingData, options = {}) {
  const opts = { ...defaultOptions, ...options };
  
  // Create brand config (with white-label support)
  const brand = opts.brand || createBrandConfig(opts.license);
  
  // Normalize listing data
  const listingType = listingData.transactionType === 'lease' ? 'lease' 
                    : listingData.propertyType === 'land' ? 'land' 
                    : 'base';
  const listing = createListing(listingData, listingType);
  
  // Generate HTML for each page
  const htmlPages = [];
  
  if (opts.pages.includes(1)) {
    htmlPages.push(generatePage1HTML(listing, brand));
  }
  
  if (opts.pages.includes(2)) {
    htmlPages.push(generatePage2HTML(listing, brand));
  }
  
  // Determine output filename
  const addressSlug = `${listing.address.street}-${listing.address.city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = opts.filename || `flyer-${addressSlug}-${timestamp}`;
  
  // Ensure output directory exists
  await fs.mkdir(opts.outputDir, { recursive: true });
  
  const result = {
    listing,
    html: htmlPages,
    files: [],
  };
  
  // Generate outputs based on format
  if (opts.format === 'html' || opts.format === 'all') {
    // Save HTML files
    for (let i = 0; i < htmlPages.length; i++) {
      const htmlPath = path.join(opts.outputDir, `${filename}-page${i + 1}.html`);
      await fs.writeFile(htmlPath, htmlPages[i]);
      result.files.push(htmlPath);
    }
  }
  
  if (opts.format === 'pdf' || opts.format === 'all') {
    // Generate PDF
    const pdfPath = path.join(opts.outputDir, `${filename}.pdf`);
    const generator = getPDFGenerator();
    
    try {
      if (htmlPages.length === 1) {
        await generator.generateFromHTML(htmlPages[0], pdfPath);
      } else {
        await generator.generateMultiPage(htmlPages, pdfPath);
      }
      result.pdf = pdfPath;
      result.files.push(pdfPath);
    } catch (error) {
      console.error('PDF generation failed:', error.message);
      result.pdfError = error.message;
    }
  }
  
  if (opts.preview || opts.format === 'png') {
    // Generate preview images
    const generator = getPDFGenerator();
    
    for (let i = 0; i < htmlPages.length; i++) {
      const previewPath = path.join(opts.outputDir, `${filename}-page${i + 1}.png`);
      try {
        await generator.generatePreview(htmlPages[i], previewPath);
        result.files.push(previewPath);
        if (!result.previews) result.previews = [];
        result.previews.push(previewPath);
      } catch (error) {
        console.error(`Preview generation failed for page ${i + 1}:`, error.message);
      }
    }
  }
  
  return result;
}

/**
 * Generate flyer from JSON file
 */
async function generateFlyerFromFile(jsonPath, options = {}) {
  const jsonData = await fs.readFile(jsonPath, 'utf8');
  const listingData = JSON.parse(jsonData);
  return generateFlyer(listingData, options);
}

/**
 * Generate HTML preview only (useful for testing)
 */
async function generateHTMLPreview(listingData, options = {}) {
  return generateFlyer(listingData, { ...options, format: 'html' });
}

/**
 * Cleanup - close browser instance
 */
async function cleanup() {
  const generator = getPDFGenerator();
  await generator.close();
}

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
CRE Flyer Generator
==================

Usage:
  node src/index.js <listing.json> [output-dir]

Examples:
  node src/index.js sample-data/950-encore-way-lease.json
  node src/index.js sample-data/72nd-ave-homesite-sale.json ./output

Options (via environment variables):
  FORMAT=pdf|html|png|all  Output format (default: html for testing)
  PAGES=1,2                Which pages to generate (default: 1,2)
`);
    process.exit(0);
  }
  
  const jsonPath = args[0];
  const outputDir = args[1] || './output';
  const format = process.env.FORMAT || 'html'; // Default to HTML for easier testing
  const pages = (process.env.PAGES || '1,2').split(',').map(Number);
  
  (async () => {
    try {
      console.log(`\nGenerating flyer from: ${jsonPath}`);
      console.log(`Output directory: ${outputDir}`);
      console.log(`Format: ${format}`);
      console.log(`Pages: ${pages.join(', ')}\n`);
      
      const result = await generateFlyerFromFile(jsonPath, {
        outputDir,
        format,
        pages,
      });
      
      console.log('\n✅ Generation complete!');
      console.log('Generated files:');
      result.files.forEach(f => console.log(`  - ${f}`));
      
      if (result.pdfError) {
        console.log(`\n⚠️  PDF generation failed: ${result.pdfError}`);
        console.log('   HTML files were generated successfully and can be viewed in a browser.');
      }
      
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    } finally {
      await cleanup();
    }
  })();
}

module.exports = {
  generateFlyer,
  generateFlyerFromFile,
  generateHTMLPreview,
  cleanup,
  CREConsultantsBrand,
  createBrandConfig,
  createListing,
};
