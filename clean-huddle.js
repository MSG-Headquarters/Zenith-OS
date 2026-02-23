const{Pool}=require('pg');
const p=new Pool({connectionString:'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',ssl:{rejectUnauthorized:false}});
async function run(){
    // Clear in order respecting foreign keys
    const tables = [
        'huddle_reactions', 'huddle_mentions', 'huddle_attachments',
        'huddle_notifications', 'huddle_activity_feed',
        'huddle_direct_messages', 'huddle_direct_participants', 'huddle_direct_conversations',
        'huddle_messages', 'huddle_channel_members', 'huddle_channels',
        'huddle_workspace_members', 'huddle_workspaces',
        'huddle_portal_properties', 'huddle_portal_users'
    ];
    for (const t of tables) {
        try {
            const r = await p.query(`DELETE FROM ${t} RETURNING *`);
            if (r.rowCount > 0) console.log('Deleted', r.rowCount, 'from', t);
        } catch(e) { 
            // Try truncate cascade if FK issues
            try {
                await p.query(`TRUNCATE ${t} CASCADE`);
                console.log('Truncated', t);
            } catch(e2) { console.log(t + ':', e2.message); }
        }
    }
    
    // Verify
    const msgs = await p.query("SELECT COUNT(*) as c FROM huddle_messages");
    const dms = await p.query("SELECT COUNT(*) as c FROM huddle_direct_messages");
    const ch = await p.query("SELECT COUNT(*) as c FROM huddle_channels");
    console.log('\nRemaining: messages:', msgs.rows[0].c, 'DMs:', dms.rows[0].c, 'channels:', ch.rows[0].c);
    console.log('Huddle clean!');
    p.end();
}
run();
