const sharp = require("sharp");
const fs = require("fs");
const dir = "web/assets/screenshots";
const screenshots = [
  { name: "home-narrow.png", title: "BirdScope Home" },
  { name: "explore-narrow.png", title: "Explore Birds" },
  { name: "species-narrow.png", title: "Species Detail" },
];

async function gen() {
  for (const s of screenshots) {
    const svg =
      '<svg width="750" height="1334" viewBox="0 0 750 1334" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="100%" height="100%" fill="#F6F1E7"/>' +
      '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" ' +
      'font-family="system-ui,sans-serif" font-size="48" font-weight="600" fill="#1F5E4B">' +
      s.title +
      '</text>' +
      '<text x="50%" y="62%" dominant-baseline="middle" text-anchor="middle" ' +
      'font-family="system-ui,sans-serif" font-size="24" fill="#5C6B62">BirdScope Mobile Screenshot</text>' +
      "</svg>";
    await sharp(Buffer.from(svg)).resize(750, 1334).png().toFile(dir + "/" + s.name);
    console.log("Generated", s.name);
  }
}

gen().catch(console.error);
