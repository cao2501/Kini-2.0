const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const srcDir = path.join(__dirname, '../src/modules/dashboard/public');
const destDir = path.join(__dirname, '../dist/modules/dashboard/public');

if (fs.existsSync(srcDir)) {
  copyDir(srcDir, destDir);
  console.log('Static assets copied successfully.');
} else {
  console.error('Source directory not found:', srcDir);
}
