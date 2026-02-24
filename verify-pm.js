const{Pool}=require('pg');
const p=new Pool({connectionString:'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',ssl:{rejectUnauthorized:false}});
async function run(){
    // Check what we have
    const props = await p.query("SELECT id, account_number, short_name, total_units, tenant_count FROM pm_properties ORDER BY short_name");
    console.log('=== Current Properties ===');
    props.rows.forEach(r => console.log(r.id, '|', r.account_number, '|', r.short_name, '| units:', r.total_units, '| tenants:', r.tenant_count));
    
    const tenants = await p.query("SELECT t.tenant_name, t.unit_number, p.short_name FROM pm_tenants t JOIN pm_properties p ON t.property_id = p.id ORDER BY p.short_name, t.unit_number");
    console.log('\n=== Current Tenants (' + tenants.rows.length + ') ===');
    let lastProp = '';
    tenants.rows.forEach(r => {
        if (r.short_name !== lastProp) { console.log('\n' + r.short_name + ':'); lastProp = r.short_name; }
        console.log('  Unit ' + r.unit_number + ' - ' + r.tenant_name);
    });
    
    p.end();
}
run();
