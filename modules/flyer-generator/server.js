/**
 * CRE Flyer Generator - Express API Server
 * Port: 3006
 * 
 * Zenith OS Integration for CRE Tenant
 * Provides REST endpoints for flyer generation from CRM dashboard
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// Import flyer generator modules
const { generateFlyer, cleanup } = require('./src/index');
const { CREConsultantsBrand } = require('./src/config/brand');

const app = express();
const PORT = process.env.FLYER_GENERATOR_PORT || 3006;
const OUTPUT_DIR = process.env.FLYER_OUTPUT_DIR || path.join(__dirname, 'output');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve generated flyers statically
app.use('/outputs', express.static(OUTPUT_DIR));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/api/flyer-generator/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'CRE Flyer Generator',
    version: '1.0.0',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// GENERATE FLYER
// ============================================================================

/**
 * POST /api/flyer-generator/generate
 * 
 * Generate a flyer from listing data
 * 
 * Body:
 * {
 *   listing: { ... },          // Full listing object (required)
 *   format: 'pdf' | 'html' | 'all',  // Output format (default: 'html')
 *   pages: [1, 2],             // Which pages to generate (default: [1, 2])
 *   brand: 'cre-consultants',  // Brand config key (default: 'cre-consultants')
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   jobId: 'uuid',
 *   files: [
 *     { page: 1, format: 'html', url: '/outputs/flyer-xxx-page1.html', path: '...' },
 *     { page: 2, format: 'html', url: '/outputs/flyer-xxx-page2.html', path: '...' }
 *   ]
 * }
 */
app.post('/api/flyer-generator/generate', async (req, res) => {
  const jobId = uuidv4();
  console.log(`[Job ${jobId}] Starting flyer generation`);
  
  try {
    const { listing, format = 'html', pages = [1, 2], brand = 'cre-consultants' } = req.body;
    
    // Validate required fields
    if (!listing) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: listing',
        jobId
      });
    }
    
    if (!listing.address || !listing.address.street) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: listing.address.street',
        jobId
      });
    }
    
    // Validate format
    const validFormats = ['html', 'pdf', 'png', 'all'];
    if (!validFormats.includes(format)) {
      return res.status(400).json({
        success: false,
        error: `Invalid format. Must be one of: ${validFormats.join(', ')}`,
        jobId
      });
    }
    
    // Get brand config (future: support multiple brands)
    const brandConfig = getBrandConfig(brand);
    
    console.log(`[Job ${jobId}] Generating ${format} flyer for: ${listing.address.street}`);
    console.log(`[Job ${jobId}] Pages: ${pages.join(', ')}`);
    
    // Generate the flyer
    const result = await generateFlyer(listing, {
      format,
      pages,
      brand: brandConfig,
      outputDir: OUTPUT_DIR,
      filename: `flyer-${jobId}`
    });
    
    // Build response with file URLs
    const files = result.files.map((filePath, index) => {
      const filename = path.basename(filePath);
      const ext = path.extname(filename).slice(1);
      const pageMatch = filename.match(/page(\d+)/);
      const pageNum = pageMatch ? parseInt(pageMatch[1]) : index + 1;
      
      return {
        page: pageNum,
        format: ext,
        filename,
        url: `/outputs/${filename}`,
        path: filePath
      };
    });
    
    console.log(`[Job ${jobId}] Generation complete. Files: ${files.length}`);
    
    res.json({
      success: true,
      jobId,
      listing: {
        id: listing.id,
        address: `${listing.address.street}, ${listing.address.city}, ${listing.address.state} ${listing.address.zip}`,
        type: listing.transactionType || listing.propertyType
      },
      files,
      pdfError: result.pdfError || null
    });
    
  } catch (error) {
    console.error(`[Job ${jobId}] Error:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      jobId
    });
  }
});

// ============================================================================
// PREVIEW (HTML)
// ============================================================================

/**
 * POST /api/flyer-generator/preview
 * 
 * Generate HTML preview for iframe embedding in CRM dashboard
 * 
 * Body:
 * {
 *   listing: { ... },
 *   page: 1 | 2
 * }
 * 
 * Response: HTML content (text/html)
 */
app.post('/api/flyer-generator/preview', async (req, res) => {
  try {
    const { listing, page = 1 } = req.body;
    
    if (!listing) {
      return res.status(400).send('<html><body><h1>Error: Missing listing data</h1></body></html>');
    }
    
    const brandConfig = getBrandConfig('cre-consultants');
    
    const result = await generateFlyer(listing, {
      format: 'html',
      pages: [page],
      brand: brandConfig,
      outputDir: OUTPUT_DIR
    });
    
    if (result.html && result.html.length > 0) {
      res.type('text/html').send(result.html[0]);
    } else {
      res.status(500).send('<html><body><h1>Error: Failed to generate preview</h1></body></html>');
    }
    
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).send(`<html><body><h1>Error: ${error.message}</h1></body></html>`);
  }
});

// ============================================================================
// LIST TEMPLATES
// ============================================================================

/**
 * GET /api/flyer-generator/templates
 * 
 * List available flyer templates
 */
app.get('/api/flyer-generator/templates', (req, res) => {
  res.json({
    templates: [
      {
        id: 'standard-2page',
        name: 'Standard 2-Page',
        pages: 2,
        description: 'Page 1: Hero + Details, Page 2: Map + Photos + Demographics',
        propertyTypes: ['lease', 'sale', 'land'],
        default: true
      },
      {
        id: 'development-4page',
        name: 'Development Package',
        pages: 4,
        description: 'Extended format for development/investment properties',
        propertyTypes: ['land', 'development'],
        default: false,
        status: 'coming-soon'
      },
      {
        id: 'social-card',
        name: 'Social Media Card',
        pages: 1,
        description: '1200x630 format for Open Graph / social sharing',
        propertyTypes: ['lease', 'sale', 'land'],
        default: false,
        status: 'coming-soon'
      }
    ]
  });
});

// ============================================================================
// LIST BRANDS
// ============================================================================

/**
 * GET /api/flyer-generator/brands
 * 
 * List available brand configurations (for white-label)
 */
app.get('/api/flyer-generator/brands', (req, res) => {
  res.json({
    brands: [
      {
        id: 'cre-consultants',
        name: 'CRE Consultants',
        description: 'Commercial Real Estate Consultants, LLC',
        status: 'active',
        default: true
      },
      {
        id: 'custom',
        name: 'Custom Brand',
        description: 'Upload your own logo, colors, and contact info',
        status: 'coming-soon'
      }
    ]
  });
});

// ============================================================================
// LIST GENERATED FLYERS
// ============================================================================

/**
 * GET /api/flyer-generator/flyers
 * 
 * List recently generated flyers (for history/re-download)
 */
app.get('/api/flyer-generator/flyers', async (req, res) => {
  try {
    const files = await fs.readdir(OUTPUT_DIR);
    
    const flyers = files
      .filter(f => f.startsWith('flyer-') && (f.endsWith('.html') || f.endsWith('.pdf')))
      .map(filename => {
        const ext = path.extname(filename).slice(1);
        return {
          filename,
          format: ext,
          url: `/outputs/${filename}`
        };
      })
      .sort((a, b) => b.filename.localeCompare(a.filename)); // Newest first
    
    res.json({
      count: flyers.length,
      flyers
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DELETE FLYER
// ============================================================================

/**
 * DELETE /api/flyer-generator/flyers/:filename
 * 
 * Delete a generated flyer
 */
app.delete('/api/flyer-generator/flyers/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security: Only allow deleting files that start with 'flyer-'
    if (!filename.startsWith('flyer-')) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete this file'
      });
    }
    
    const filePath = path.join(OUTPUT_DIR, filename);
    await fs.unlink(filePath);
    
    res.json({
      success: true,
      deleted: filename
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SCHEMA / VALIDATION HELPER
// ============================================================================

/**
 * GET /api/flyer-generator/schema
 * 
 * Return the expected listing data schema (for CRM integration)
 */
app.get('/api/flyer-generator/schema', (req, res) => {
  res.json({
    schema: {
      required: ['address'],
      properties: {
        id: { type: 'string', description: 'Unique listing ID' },
        propertyType: { type: 'string', enum: ['office', 'retail', 'industrial', 'medical', 'land', 'multifamily'] },
        propertyTypeCustom: { type: 'string', description: 'Custom property type label for flyer header' },
        transactionType: { type: 'string', enum: ['lease', 'sale'] },
        buildingName: { type: 'string', description: 'Building or project name' },
        address: {
          type: 'object',
          required: ['street', 'city', 'state', 'zip'],
          properties: {
            street: { type: 'string' },
            unit: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' }
          }
        },
        leaseRate: { type: 'number', description: 'Base lease rate PSF' },
        leaseType: { type: 'string', enum: ['NNN', 'NN', 'Gross', 'Modified Gross'] },
        cam: { type: 'number', description: 'CAM charges PSF' },
        salePrice: { type: 'number', description: 'Sale price (for sale listings)' },
        sizeSF: { type: 'number', description: 'Size in square feet' },
        acres: { type: 'number', description: 'Size in acres (for land)' },
        description: { type: 'string', description: 'Property description' },
        highlights: { type: 'array', items: { type: 'string' } },
        photos: {
          type: 'object',
          properties: {
            hero: { type: 'string', description: 'Main hero image URL' },
            exterior: { type: 'array', items: { type: 'string' } },
            interior: { type: 'array', items: { type: 'string' } },
            aerial: { type: 'array', items: { type: 'string' } }
          }
        },
        brokers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              title: { type: 'string' },
              credentials: { type: 'array', items: { type: 'string' } },
              phone: { type: 'string' },
              email: { type: 'string' }
            }
          }
        },
        demographics: {
          type: 'object',
          description: 'Population, income, traffic data (can be auto-populated from Danimal Data)',
          properties: {
            population_1mi: { type: 'number' },
            population_3mi: { type: 'number' },
            population_5mi: { type: 'number' },
            avgHHIncome_1mi: { type: 'number' },
            avgHHIncome_3mi: { type: 'number' },
            avgHHIncome_5mi: { type: 'number' },
            trafficCount: { type: 'number' }
          }
        }
      }
    },
    example: '/api/flyer-generator/schema/example'
  });
});

/**
 * GET /api/flyer-generator/schema/example
 * 
 * Return example listing data
 */
app.get('/api/flyer-generator/schema/example', async (req, res) => {
  try {
    const examplePath = path.join(__dirname, 'sample-data', '950-encore-way-lease.json');
    const example = JSON.parse(await fs.readFile(examplePath, 'utf8'));
    res.json(example);
  } catch (error) {
    res.status(500).json({ error: 'Could not load example' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get brand configuration by ID
 */
function getBrandConfig(brandId) {
  // For now, only CRE Consultants is supported
  // Future: Load from database or config files
  switch (brandId) {
    case 'cre-consultants':
    default:
      return CREConsultantsBrand;
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// ============================================================================
// STARTUP
// ============================================================================

async function startServer() {
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   CRE FLYER GENERATOR API                                ║
║   ─────────────────────────────────────────────────────  ║
║                                                          ║
║   Port:        ${PORT}                                      ║
║   Output Dir:  ${OUTPUT_DIR.substring(0, 40).padEnd(40)}║
║                                                          ║
║   Endpoints:                                             ║
║   • POST /api/flyer-generator/generate                   ║
║   • POST /api/flyer-generator/preview                    ║
║   • GET  /api/flyer-generator/templates                  ║
║   • GET  /api/flyer-generator/brands                     ║
║   • GET  /api/flyer-generator/flyers                     ║
║   • GET  /api/flyer-generator/schema                     ║
║   • GET  /api/flyer-generator/health                     ║
║                                                          ║
║   Ready for Zenith CRM integration!                      ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    `);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await cleanup();
  process.exit(0);
});

startServer().catch(console.error);

module.exports = app; // For testing
