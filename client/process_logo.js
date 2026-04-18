const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Please provide the path to your new logo image.");
  console.error("Usage: node process_logo.js <path-to-image>");
  process.exit(1);
}

const inputPath = path.resolve(args[0]);

if (!fs.existsSync(inputPath)) {
  console.error(`Error: File not found at ${inputPath}`);
  process.exit(1);
}

const publicImagesDir = path.resolve(__dirname, 'public', 'images');
const publicIconsDir = path.resolve(__dirname, 'public', 'icons');

// Ensure directories exist
if (!fs.existsSync(publicImagesDir)) fs.mkdirSync(publicImagesDir, { recursive: true });
if (!fs.existsSync(publicIconsDir)) fs.mkdirSync(publicIconsDir, { recursive: true });

async function processLogo() {
  try {
    console.log(`Processing logo from ${inputPath}...`);
    
    // 1. Replace the main in-app logo
    await sharp(inputPath)
      .resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(path.join(publicImagesDir, 'logo.png'));
    console.log("✅ Updated main logo (client/public/images/logo.png)");

    // 2. Generate PWA Icons
    await sharp(inputPath)
      .resize({ width: 192, height: 192, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(path.join(publicIconsDir, 'icon-192.png'));
    console.log("✅ Updated PWA Icon 192x192 (client/public/icons/icon-192.png)");

    await sharp(inputPath)
      .resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(path.join(publicIconsDir, 'icon-512.png'));
    console.log("✅ Updated PWA Icon 512x512 (client/public/icons/icon-512.png)");

    await sharp(inputPath)
      .resize({ width: 180, height: 180, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(path.join(publicIconsDir, 'apple-touch-icon.png'));
    console.log("✅ Updated Apple Touch Icon (client/public/icons/apple-touch-icon.png)");

    // 3. Generate Favicon
    await sharp(inputPath)
      .resize({ width: 32, height: 32, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(path.join(__dirname, 'public', 'favicon.png'));
    console.log("✅ Updated Favicon (client/public/favicon.png)");

    console.log("\n🎉 All logos and PWA icons have been updated successfully!");
  } catch (error) {
    console.error("❌ Error processing logo:", error);
  }
}

processLogo();
