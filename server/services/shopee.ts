import { chromium, Browser } from 'playwright';

interface VideoResult {
  videoUrl: string;
  title: string;
  cover: string;
  author: string;
  desc: string;
}

interface VideoDataMatch {
  url: string;
  title?: string;
  author?: string;
  cover?: string;
  desc?: string;
}

// Global browser instance
let globalBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!globalBrowser) {
    globalBrowser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
  return globalBrowser;
}

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  const browser = await getBrowser();
  
  // Open a new isolated context (like an incognito window) for this specific request
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 375, height: 812 },
  });

  const page = await context.newPage();

  try {
    let finalUrl = url;
    if (url.includes('shp.ee') || url.includes('x.shp.ee')) {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      finalUrl = response?.url() || url;
    } else {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      finalUrl = page.url();
    }

    await page.waitForTimeout(5000);

    let result = await tryExtractFromAPIInterception(page, url);
    if (!result) {
      result = await tryExtractFromDOM(page);
    }

    if (!result) {
      throw new Error('Could not extract video data from this Shopee link. The video may be private or unavailable.');
    }

    return result;
  } finally {
    // ONLY close the context (tab), keep the main browser running for the next user!
    await context.close();
  }
}

// ... (Keep your existing tryExtractFromAPIInterception, tryExtractFromDOM, parseShopeeApiResponse, and findVideoInObject functions exactly as they are below this line) ...
