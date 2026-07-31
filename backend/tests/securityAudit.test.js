const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Security Audit - Frontend Zero Database Credentials', (t) => {
  const frontendDir = path.join(__dirname, '../../frontend/src');
  if (!fs.existsSync(frontendDir)) return;

  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.json')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Assert no postgres connection string pattern exists
        assert.equal(
          /postgres(ql)?:\/\//i.test(content),
          false,
          `Security failure: Found postgresql connection string in frontend file ${file}`
        );

        // Assert no raw database passwords exist
        assert.equal(
          /DATABASE_URL/i.test(content),
          false,
          `Security failure: Found DATABASE_URL reference in frontend file ${file}`
        );
      }
    }
  }

  scanDir(frontendDir);
});
