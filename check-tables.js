const{Pool}=require('pg');
const p=new Pool({connectionString:'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',ssl:{rejectUnauthorized:false}});

// Check for property appraiser tables
p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%property%' OR table_name LIKE '%parcel%' OR table_name LIKE '%appraiser%' ORDER BY table_name")
.then(r=>{console.log('Property tables:'); r.rows.forEach(t=>console.log('  ' + t.table_name));
    // Also check for any county data tables
    return p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%county%' OR table_name LIKE '%lee%' OR table_name LIKE '%collier%') ORDER BY table_name");
})
.then(r=>{console.log('County tables:'); r.rows.forEach(t=>console.log('  ' + t.table_name));
    return p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
})
.then(r=>{console.log('All tables:'); r.rows.forEach(t=>console.log('  ' + t.table_name)); p.end();})
.catch(e=>{console.log('Error:',e.message);p.end()});
