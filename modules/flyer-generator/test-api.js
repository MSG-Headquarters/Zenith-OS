/**
 * CRE Flyer Generator - API Test Script
 * 
 * Tests all endpoints against the running server
 * 
 * Usage:
 *   1. Start server: npm start
 *   2. Run tests: npm test (in another terminal)
 */

const http = require('http');

const BASE_URL = 'http://localhost:3006';

// Test listing data
const testListing = {
  id: "test-listing-001",
  propertyType: "office",
  propertyTypeCustom: "CLASS A OFFICE",
  buildingName: "Test Building",
  transactionType: "lease",
  address: {
    street: "123 Test Street",
    city: "Naples",
    state: "FL",
    zip: "34102"
  },
  leaseRate: 25.00,
  leaseType: "NNN",
  cam: 12.50,
  sizeSF: 5000,
  description: "This is a test listing for API verification. Beautiful Class A office space with modern amenities.",
  highlights: [
    "Corner unit with windows",
    "Recently renovated",
    "Ample parking"
  ],
  brokers: [
    {
      name: "Test Broker",
      title: "Associate",
      credentials: ["CCIM"],
      phone: "239.555.1234",
      email: "test@creconsultants.com"
    }
  ]
};

// Helper function for HTTP requests
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Test functions
async function testHealth() {
  console.log('\n📋 Testing: GET /api/flyer-generator/health');
  const res = await request('GET', '/api/flyer-generator/health');
  console.log(`   Status: ${res.status}`);
  console.log(`   Response:`, res.data);
  return res.status === 200 && res.data.status === 'healthy';
}

async function testTemplates() {
  console.log('\n📋 Testing: GET /api/flyer-generator/templates');
  const res = await request('GET', '/api/flyer-generator/templates');
  console.log(`   Status: ${res.status}`);
  console.log(`   Templates: ${res.data.templates?.length || 0}`);
  return res.status === 200 && res.data.templates?.length > 0;
}

async function testBrands() {
  console.log('\n📋 Testing: GET /api/flyer-generator/brands');
  const res = await request('GET', '/api/flyer-generator/brands');
  console.log(`   Status: ${res.status}`);
  console.log(`   Brands: ${res.data.brands?.length || 0}`);
  return res.status === 200 && res.data.brands?.length > 0;
}

async function testSchema() {
  console.log('\n📋 Testing: GET /api/flyer-generator/schema');
  const res = await request('GET', '/api/flyer-generator/schema');
  console.log(`   Status: ${res.status}`);
  console.log(`   Has schema: ${!!res.data.schema}`);
  return res.status === 200 && res.data.schema;
}

async function testSchemaExample() {
  console.log('\n📋 Testing: GET /api/flyer-generator/schema/example');
  const res = await request('GET', '/api/flyer-generator/schema/example');
  console.log(`   Status: ${res.status}`);
  console.log(`   Example listing: ${res.data.address?.street || 'N/A'}`);
  return res.status === 200 && res.data.address;
}

async function testGenerate() {
  console.log('\n📋 Testing: POST /api/flyer-generator/generate');
  const res = await request('POST', '/api/flyer-generator/generate', {
    listing: testListing,
    format: 'html',
    pages: [1, 2]
  });
  console.log(`   Status: ${res.status}`);
  console.log(`   Success: ${res.data.success}`);
  console.log(`   Job ID: ${res.data.jobId}`);
  console.log(`   Files generated: ${res.data.files?.length || 0}`);
  if (res.data.files) {
    res.data.files.forEach(f => console.log(`     - ${f.url}`));
  }
  return res.status === 200 && res.data.success && res.data.files?.length > 0;
}

async function testGenerateValidation() {
  console.log('\n📋 Testing: POST /api/flyer-generator/generate (validation - no listing)');
  const res = await request('POST', '/api/flyer-generator/generate', {
    format: 'html'
  });
  console.log(`   Status: ${res.status}`);
  console.log(`   Error: ${res.data.error}`);
  return res.status === 400 && res.data.error;
}

async function testFlyers() {
  console.log('\n📋 Testing: GET /api/flyer-generator/flyers');
  const res = await request('GET', '/api/flyer-generator/flyers');
  console.log(`   Status: ${res.status}`);
  console.log(`   Flyers found: ${res.data.count || 0}`);
  return res.status === 200;
}

async function test404() {
  console.log('\n📋 Testing: GET /api/nonexistent (404 handler)');
  const res = await request('GET', '/api/nonexistent');
  console.log(`   Status: ${res.status}`);
  console.log(`   Error: ${res.data.error}`);
  return res.status === 404;
}

// Run all tests
async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CRE FLYER GENERATOR - API TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Target: ${BASE_URL}`);
  console.log('═══════════════════════════════════════════════════════════');

  const tests = [
    { name: 'Health Check', fn: testHealth },
    { name: 'Templates List', fn: testTemplates },
    { name: 'Brands List', fn: testBrands },
    { name: 'Schema', fn: testSchema },
    { name: 'Schema Example', fn: testSchemaExample },
    { name: 'Generate Flyer', fn: testGenerate },
    { name: 'Validation Error', fn: testGenerateValidation },
    { name: 'List Flyers', fn: testFlyers },
    { name: '404 Handler', fn: test404 }
  ];

  const results = [];

  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.push({ name: test.name, passed: false, error: error.message });
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  
  let passed = 0;
  let failed = 0;
  
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`  ${icon} ${result.name}`);
    if (result.passed) passed++;
    else failed++;
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════');
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error.message);
  console.log('\nMake sure the server is running: npm start');
  process.exit(1);
});
