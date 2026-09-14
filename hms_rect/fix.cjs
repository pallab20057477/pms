const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory && !dirPath.includes("node_modules")) {
        walk(dirPath, callback)
    } else if (!isDirectory) {
        callback(path.join(dir, f));
    }
  });
}

walk('d:/GO/all/project1/hms_rect/src', function(filePath) {
  if (filePath.endsWith('.jsx') || filePath.endsWith('.js')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    // Replace toLocaleDateString(..., { ... }) with toLocaleDateString('en-GB')
    content = content.replace(/\.toLocaleDateString\([^)]*\)/g, ".toLocaleDateString('en-GB')");
    
    content = content.replace(/new Date\(([^)]*)\)\.toLocaleString\([^)]*\)/g, "new Date($1).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })");
    content = content.replace(/date\.toLocaleString\([^\)]*\)/g, "date.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })");
    content = content.replace(/dt\.toLocaleString\([^\)]*\)/g, "dt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })");
    content = content.replace(/d\.toLocaleString\([^\)]*\)/g, "d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })");

    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log('Updated ' + filePath);
    }
  }
});
