/**
 * Generates MarketSync-Technical-User-Manual.pdf from user-manual.html
 * using Puppeteer. Run with: node scripts/generate-manual-pdf.mjs
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function generate() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    try {
      puppeteer = require('puppeteer-core');
    } catch {
      console.error('Puppeteer not found. Installing...');
      const { execSync } = require('child_process');
      execSync('npm install --save-dev puppeteer', { stdio: 'inherit', cwd: join(__dirname, '..') });
      puppeteer = require('puppeteer');
    }
  }

  const htmlPath  = join(__dirname, 'user-manual.html');
  const outputPath = join(__dirname, '..', 'MarketSync-Technical-User-Manual.pdf');

  console.log('Launching headless browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

  console.log('Generating PDF...');
  await page.pdf({
    path:   outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  await browser.close();
  console.log(`\n✅  PDF saved to: ${outputPath}\n`);
}

generate().catch(err => {
  console.error('PDF generation failed:', err.message);
  process.exit(1);
});
