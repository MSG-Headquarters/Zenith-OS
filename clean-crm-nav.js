const fs = require('fs');
let c = fs.readFileSync('./views/crm.ejs', 'utf8');

// Remove Danimal Data nav link from CRM sidebar
c = c.replace(
    `                <% if (features.danimal !== false) { %>
                <a href="/danimal" class="nav-item"><span class="nav-icon"><i class="bi bi-database"></i></span> Danimal Data</a>
                <% } %>`,
    ''
);

// Remove the DATA SOURCES section label if it exists
c = c.replace(/\s*<div class="nav-section-label">Data Sources<\/div>\s*/g, '\n');

fs.writeFileSync('./views/crm.ejs', c);
console.log('Danimal Data removed from CRM sidebar!');
