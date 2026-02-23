const path = require('path');
try {
    const IDMLGenerator = require('./modules/idml-generator/idml-generator');
    console.log('IDML module loaded OK');
    
    const generator = new IDMLGenerator({
        outputDir: path.join(__dirname, 'modules', 'idml-generator', 'output')
    });
    console.log('Generator created OK');
    
    // Test with mock data
    const lead = {
        id: 9,
        name: 'Test',
        company: 'Test Co',
        property_address: '1500 Colonial Blvd',
        property_city: 'Fort Myers',
        property_state: 'FL',
        property_zip: '33907',
        property_type: 'Retail',
        property_sqft: 5000,
        value: 1500000,
        stage: 'Closed Won'
    };
    
    generator.generate(lead, [], { name: 'Dan Smith', email: 'dan@test.com' })
        .then(r => console.log('SUCCESS:', r.filename, r.size, 'bytes'))
        .catch(e => console.log('GENERATE ERROR:', e.message));
} catch(e) {
    console.log('LOAD ERROR:', e.message);
}
