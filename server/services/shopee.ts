import { chromium, Browser, Page } from 'playwright';

interface VideoResult {
  videoUrl: string;
  title: string;
  cover: string;
  author: string;
  desc: string;
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
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 375, height: 812 },
  });

  const page = await context.newPage();

  try {
    const capturedResponses: any[] = [];

    // Listen for API responses
    page.on('response', async (response) => {
      try {
        const reqUrl = response.url();
        if (reqUrl.includes('api/v4') || reqUrl.includes('graphql') || reqUrl.includes('get_video_detail') || reqUrl.includes('video_info') || reqUrl.includes('item/get')) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const body = await response.json();
            capturedResponses.push({ url: reqUrl, body });
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    await page.waitForTimeout(4000);

    for (let i = 0; i < 3; i++) {
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      } catch (e) {}
    }

    let result = analyzeCapturedResponses(capturedResponses);

    if (!result) {
      result = await extractFromDOM(page);
    }

    if (!result) {
      throw new Error('Could not extract video data from this Shopee link. The video may be private or unavailable.');
    }

    result.videoUrl = cleanWatermarkUrl(result.videoUrl);

    return result;
  } finally {
    await context.close();
  }
}

function cleanWatermarkUrl(url: string): string {
  if (!url) return url;
  if (url.includes('.default.mp4')) {
    return url.replace('.default.mp4', '.mp4');
  }
  return url;
}

function analyzeCapturedResponses(responses: any[]): VideoResult | null {
  let bestUrl = '';
  let title = 'Shopee Video';
  let author = 'Unknown';
  let cover = '';
  let desc = '';

  const potentialUrls: { url: string, score: number }[] = [];

  function
