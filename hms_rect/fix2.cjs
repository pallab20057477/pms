const fs = require('fs');
let file = 'src/SuperAdmin/SuperAdminDashboard.jsx';
let code = fs.readFileSync(file, 'utf8');

// Replace empty fallbacks
code = code.replace(/\|\|\s*'- '/g, "|| 'N/A'");
code = code.replace(/\|\|\s*'-'/g, "|| 'N/A'");

// Fix description separators if they look weird
code = code.replace(/ - returns /g, " - returns ");
code = code.replace(/ - validates /g, " - validates ");
code = code.replace(/ - daily, /g, " - daily, ");
code = code.replace(/ - links /g, " - links ");

fs.writeFileSync(file, code);
