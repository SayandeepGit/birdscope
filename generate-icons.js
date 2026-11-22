const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputSvg = path.join(__dirname, 'web/assets/logo.svg');
const outputDir = path.join(__dirname, 'web/assets/icons');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const svgBuffer = fs.readFileSync(inputSvg);

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 253, b: 248, alpha: 0 } })
      .png()
      .toFile(outputPath);
    console.log(`Generated ${outputPath}`);
  }

  // Also generate a maskable version for 512 (with safe zone)
  await sharp(svgBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 31, g: 94, b: 75, alpha: 1 } })
    .png()
    .toFile(path.join(outputDir, 'icon-512-maskable.png'));
  console.log('Generated maskable icon');

  console.log('\nAll icons generated!');
  console.log('Update manifest.json if you want to use the maskable icon separately.');
}

generateIcons().catch(console.error);