const{Pool}=require('pg');
const p=new Pool({connectionString:'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',ssl:{rejectUnauthorized:false}});

async function run() {
    // Clear marketing data
    const drafts = await p.query("DELETE FROM marketing_drafts RETURNING id");
    console.log('Deleted', drafts.rowCount, 'marketing drafts');
    
    try {
        const photos = await p.query("DELETE FROM marketing_photos RETURNING id");
        console.log('Deleted', photos.rowCount, 'marketing photos');
    } catch(e) { console.log('Photos:', e.message); }

    // Clear Huddle data
    try {
        const msgs = await p.query("DELETE FROM messages RETURNING id");
        console.log('Deleted', msgs.rowCount, 'huddle messages');
    } catch(e) { console.log('Messages table:', e.message); }
    
    try {
        const channels = await p.query("DELETE FROM channels RETURNING id");
        console.log('Deleted', channels.rowCount, 'huddle channels');
    } catch(e) { console.log('Channels:', e.message); }

    try {
        const members = await p.query("DELETE FROM channel_members RETURNING channel_id");
        console.log('Deleted', members.rowCount, 'channel memberships');
    } catch(e) { console.log('Members:', e.message); }

    // Verify clean
    const d = await p.query("SELECT COUNT(*) as c FROM marketing_drafts");
    console.log('Marketing drafts remaining:', d.rows[0].c);
    
    p.end();
    console.log('Clean slate!');
}
run().catch(e=>{console.log('Error:',e.message);p.end();});
