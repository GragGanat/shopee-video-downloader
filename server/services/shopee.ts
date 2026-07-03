import { chromium, Browser, Page } from 'playwright';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }

let globalBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!globalBrowser) {
    globalBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }
  return globalBrowser;
}

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  const browser = await getBrowser();
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    viewport: { width: 375, height: 812 },
  });
  
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(4000);

    for (let i = 0; i < 3; i++) {
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      } catch (e) {}
    }

    // 1. Get the watermarked URL from the DOM (so we know what to avoid)
    const domResult = await extractFromDOM(page);
    const watermarkedUrl = domResult?.videoUrl || '';

    // 2. Extract ALL raw HTML from the page
    const html = await page.content();

    // 3. Use Regex to find EVERY single .mp4 link hidden in the source code
    // This catches URLs inside inline JSON, state objects, and script tags
    const rawUrls = html.match(/https:\/\/[^"'\s\\>]+?\.mp4/g ) || [];
    
    // Clean up any escaped characters (like https:\/\/... )
    const cleanUrls = rawUrls.map(u => u.replace(/\\/g, ''));
    const uniqueUrls = [...new Set(cleanUrls)];

    console.log("\n========== DEEP HTML SCRAPE RESULTS ==========");
    console.log(`DOM (Watermarked) URL: ${watermarkedUrl}`);
    console.log(`Found ${uniqueUrls.length} unique .mp4 URLs in HTML:`);
    uniqueUrls.forEach((u, i) => console.log(`[${i + 1}] ${u}`));
    console.log("==============================================\n");

    // 4. Filter and Pick the Unwatermarked URL
    let bestUrl = watermarkedUrl;
    
    if (uniqueUrls.length > 0) {
      // Find URLs that are DIFFERENT from the watermarked one
      const alternativeUrls = uniqueUrls.filter(u => u !== watermarkedUrl && !u.includes('.default.mp4'));
      
      if (alternativeUrls.length > 0) {
        // The alternative URL is almost always the raw, unwatermarked HD video!
        bestUrl = alternativeUrls[0];
      } else {
        bestUrl = uniqueUrls[0];
      }
    }

    if (!bestUrl) {
      throw new Error('Could not extract video data from this Shopee link.');
    }

    return {
      videoUrl: bestUrl,
      title: domResult?.title || 'Shopee Video',
      cover: domResult?.cover || '',
      author: domResult?.author || 'Unknown',
      desc: domResult?.desc || '',
    };
  } finally {
    await context.close();
  }
}

async function extractFromDOM(page: Page): Promise<VideoResult | null> {
  try {
    await page.waitForSelector('video, source[src*="mp4"]', { timeout: 5000 }).catch(() => {});
    const result = await page.evaluate(() => {
      const videoEl = document.querySelector('video');
      const src = videoEl ? (videoEl.src || videoEl.getAttribute('data-src') || (videoEl.querySelector('source')?.getAttribute('src')) || '') : null;
      return {
        videoUrl: src,
        title: (document.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content || 'Shopee Video',
        cover: (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content || '',
      };
    });

    if (result.videoUrl) {
      return { videoUrl: result.videoUrl, title: result.title, cover: result.cover, author: 'Unknown', desc: '' };
    }
  } catch (e) {}
  return null;
}
