const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'web/assets/screenshots');
const width = 1280;
const height = 720;

const screenshots = [
  { name: 'home.png', title: 'BirdScope Home' },
  { name: 'explore.png', title: 'Explore Birds' },
  { name: 'species.png', title: 'Species Detail' }
];

async function generateScreenshots() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const shot of screenshots) {
    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#F6F1E7"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" 
              font-family="system-ui, sans-serif" font-size="48" font-weight="600" fill="#1F5E4B">
          ${shot.title}
        </text>
        <text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" 
              font-family="system-ui, sans-serif" font-size="24" fill="#5C6B62">
          BirdScope Screenshot Placeholder
        </text>
      </svg>
    `;

    const outputPath = path.join(outputDir, shot.name);
    await sharp(Buffer.from(svg))
      .resize(width, height)
      .png()
      .toFile(outputPath);
    console.log(`Generated ${outputPath}`);
  }

  console.log('\nAll screenshots generated!');
}

generateScreenshots().catch(console.error);