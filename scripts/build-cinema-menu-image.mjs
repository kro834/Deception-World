// Preserve the poster's native resolution; never enlarge the old 192px tile.
import sharp from "sharp";

const source = new URL("../public/saga-cinema-assets/chapter-4.jpg", import.meta.url);
const output = new URL("../public/saga-cinema-assets/menu-thumbnail-20261012.webp", import.meta.url);
const result = await sharp(source.pathname)
  .webp({ quality: 88, effort: 6 })
  .toFile(output.pathname);
console.log(JSON.stringify({ width: result.width, height: result.height, bytes: result.size }));
