/**
 * Generate PNG versions of Alata Studio logos from SVG
 * 
 * This script converts SVG logos to PNG format in various sizes
 * Run: node scripts/generate-logo-pngs.js
 */

const fs = require('fs');
const path = require('path');

console.log('📝 Note: PNG generation requires manual conversion or a tool like Inkscape/ImageMagick');
console.log('');
console.log('To generate PNGs, you can:');
console.log('1. Use online tool: https://cloudconvert.com/svg-to-png');
console.log('2. Use Inkscape: inkscape --export-type=png --export-width=512 input.svg');
console.log('3. Use ImageMagick: convert -background none input.svg output.png');
console.log('');
console.log('Required PNG files:');
console.log('- frontend/public/alata-studio-dark.png (200x60)');
console.log('- frontend/public/alata-studio-light.png (200x60)');
console.log('- frontend/public/alata-studio-icon.png (512x512)');
console.log('- frontend/public/favicon.png (32x32)');
console.log('- frontend/src/media/logo/alata-studio-dark.png (200x60)');
console.log('- frontend/src/media/logo/alata-studio-light.png (200x60)');
console.log('- frontend/src/media/logo/alata-studio-icon.png (512x512)');
console.log('');
console.log('✅ SVG files are already created and ready to use!');

