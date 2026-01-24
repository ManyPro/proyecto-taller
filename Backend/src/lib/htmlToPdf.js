import fs from 'fs';
import puppeteer from 'puppeteer-core';

function firstExistingPath(paths = []) {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function detectChromeExecutablePath() {
  const envPath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_PATH ||
    process.env.CHROMIUM_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const platform = process.platform;
  if (platform === 'win32') {
    return firstExistingPath([
      'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
      'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
      'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
      'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe'
    ]);
  }

  if (platform === 'darwin') {
    return firstExistingPath([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ]);
  }

  // linux/alpine
  return firstExistingPath([
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ]);
}

export async function htmlToPdfBuffer(
  htmlDocument,
  {
    format = 'A4',
    printBackground = true,
    margin = { top: '16mm', right: '12mm', bottom: '16mm', left: '12mm' },
    preferCSSPageSize = true,
    timeoutMs = 30000,
    displayHeaderFooter = true,
    headerTemplate,
    footerTemplate
  } = {}
) {
  const executablePath = detectChromeExecutablePath();
  if (!executablePath) {
    throw new Error(
      'No se encontró un navegador Chromium/Chrome para generar PDF. Configura PUPPETEER_EXECUTABLE_PATH o instala Chromium.'
    );
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--font-render-hinting=medium'
    ]
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);

    // Load HTML
    await page.setContent(String(htmlDocument || ''), { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format,
      printBackground,
      margin,
      preferCSSPageSize,
      displayHeaderFooter,
      headerTemplate:
        headerTemplate ??
        `<div style="width:100%;font-size:8px;color:#6b7280;padding:0 12mm;">
          <span></span>
        </div>`,
      footerTemplate:
        footerTemplate ??
        `<div style="width:100%;font-size:8px;color:#6b7280;padding:0 12mm;display:flex;justify-content:space-between;">
          <span></span>
          <span>Página <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`
    });

    return pdf;
  } finally {
    await browser.close().catch(() => {});
  }
}

