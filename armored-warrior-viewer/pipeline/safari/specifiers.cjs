// Lists every static/dynamic import specifier in the given JS files and flags bare ones.
const fs = require('fs');
let bare = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const re = /(?:\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bexport\s*[\w*{}\s,$]+\s*from\s*|\bimport\s*\(\s*)(['"])([^'"]+)\1/g;
  const specs = new Set(); let m;
  while ((m = re.exec(src))) specs.add(m[2]);
  for (const s of specs) { const isBare = !/^(\.{1,2}\/|\/|https?:)/.test(s); if (isBare) bare++; console.log(`${isBare ? 'BARE ' : '     '}${file}: ${s}`); }
}
console.log(bare ? `${bare} bare specifier(s)` : 'no bare specifiers');
process.exit(bare ? 1 : 0);
