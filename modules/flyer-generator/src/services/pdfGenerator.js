/**
 * PDF Generation Service
 * 
 * Uses Puppeteer to render HTML templates to print-ready PDFs.
 * Supports both local Chrome and remote browser connections.
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs').promises;
const path = require('path');

/**
 * PDF Generation options
 */
const defaultPDFOptions = {
  format: 'Letter',
  printBackground: true,
  preferCSSPageSize: true,
  margin: {
    top: '0',
    right: '0',
    bottom: '0',
    left: '0',
  },
};

/**
 * Browser launch options
 */
const defaultBrowserOptions = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--font-render-hinting=none',
  ],
};

/**
 * PDFGenerator class
 */
class PDFGenerator {
  constructor(options = {}) {
    this.browserOptions = { ...defaultBrowserOptions, ...options.browserOptions };
    this.pdfOptions = { ...defaultPDFOptions, ...options.pdfOptions };
    this.browser = null;
    
    // Try to find Chrome executable
    this.executablePath = options.executablePath || this.findChrome();
  }
  
  /**
   * Find Chrome/Chromium executable
   */
  findChrome() {
    const possiblePaths = [
      // Linux
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      // Mac
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      // Windows
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    
    for (const chromePath of possiblePaths) {
      try {
        require('fs').accessSync(chromePath);
        return chromePath;
      } catch (e) {
        continue;
      }
    }
    
    // Return null and let puppeteer handle it
    return null;
  }
  
  /**
   * Initialize browser instance
   */
  async init() {
    if (this.browser) return;
    
    const launchOptions = { ...this.browserOptions };
    if (this.executablePath) {
      launchOptions.executablePath = this.executablePath;
    }
    
    try {
      this.browser = await puppeteer.launch(launchOptions);
      console.log('Browser initialized successfully');
    } catch (error) {
      console.error('Failed to launch browser:', error.message);
      throw new Error(`Could not launch browser. Make sure Chrome/Chromium is installed. Error: ${error.message}`);
    }
  }
  
  /**
   * Close browser instance
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
  
  /**
   * Generate PDF from HTML string
   */
  async generateFromHTML(html, outputPath, options = {}) {
    await this.init();
    
    const page = await this.browser.newPage();
    
    try {
      // Set viewport for consistent rendering
      await page.setViewport({
        width: 816,   // 8.5" at 96 DPI
        height: 1056, // 11" at 96 DPI
        deviceScaleFactor: 2, // High resolution
      });
      
      // Load HTML content
      await page.setContent(html, {
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: 30000,
      });
      
      // Wait for fonts to load
      await page.evaluateHandle('document.fonts.ready');
      
      // Wait a bit for any CSS transitions
      await page.waitForTimeout(500);
      
      // Generate PDF
      const pdfOptions = { ...this.pdfOptions, ...options, path: outputPath };
      await page.pdf(pdfOptions);
      
      console.log(`PDF generated: ${outputPath}`);
      return outputPath;
      
    } finally {
      await page.close();
    }
  }
  
  /**
   * Generate PDF from HTML file
   */
  async generateFromFile(htmlPath, outputPath, options = {}) {
    const html = await fs.readFile(htmlPath, 'utf8');
    return this.generateFromHTML(html, outputPath, options);
  }
  
  /**
   * Generate multi-page PDF by combining multiple HTML pages
   */
  async generateMultiPage(htmlPages, outputPath, options = {}) {
    await this.init();
    
    const page = await this.browser.newPage();
    const tempPDFs = [];
    
    try {
      // Set viewport
      await page.setViewport({
        width: 816,
        height: 1056,
        deviceScaleFactor: 2,
      });
      
      // Generate each page as separate PDF
      for (let i = 0; i < htmlPages.length; i++) {
        const tempPath = outputPath.replace('.pdf', `_temp_${i}.pdf`);
        
        await page.setContent(htmlPages[i], {
          waitUntil: ['networkidle0', 'domcontentloaded'],
        });
        
        await page.evaluateHandle('document.fonts.ready');
        await page.waitForTimeout(300);
        
        await page.pdf({
          ...this.pdfOptions,
          ...options,
          path: tempPath,
        });
        
        tempPDFs.push(tempPath);
      }
      
      // If only one page, just rename it
      if (tempPDFs.length === 1) {
        await fs.rename(tempPDFs[0], outputPath);
      } else {
        // Combine PDFs using pdf-lib or similar
        // For now, we'll just use the first one
        // TODO: Implement proper PDF merging
        await fs.rename(tempPDFs[0], outputPath);
        
        // Clean up temp files
        for (let i = 1; i < tempPDFs.length; i++) {
          try {
            await fs.unlink(tempPDFs[i]);
          } catch (e) {}
        }
      }
      
      return outputPath;
      
    } finally {
      await page.close();
    }
  }
  
  /**
   * Generate a preview image (PNG) instead of PDF
   */
  async generatePreview(html, outputPath, options = {}) {
    await this.init();
    
    const page = await this.browser.newPage();
    
    try {
      await page.setViewport({
        width: options.width || 816,
        height: options.height || 1056,
        deviceScaleFactor: options.scale || 2,
      });
      
      await page.setContent(html, {
        waitUntil: ['networkidle0', 'domcontentloaded'],
      });
      
      await page.evaluateHandle('document.fonts.ready');
      await page.waitForTimeout(300);
      
      await page.screenshot({
        path: outputPath,
        fullPage: options.fullPage !== false,
        type: 'png',
      });
      
      console.log(`Preview generated: ${outputPath}`);
      return outputPath;
      
    } finally {
      await page.close();
    }
  }
}

// Export singleton instance factory
let instance = null;

function getPDFGenerator(options = {}) {
  if (!instance) {
    instance = new PDFGenerator(options);
  }
  return instance;
}

module.exports = {
  PDFGenerator,
  getPDFGenerator,
  defaultPDFOptions,
  defaultBrowserOptions,
};
