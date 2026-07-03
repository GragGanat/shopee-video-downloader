import { chromium, Browser } from 'playwright';

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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    // 1. Load the page to bypass security and get cookies
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    const domain = new URL(finalUrl).hostname; // e.g., shopee.com.my or shopee.co.id

    let bestUrl = '';
    let title = 'Shopee Video';
    let cover = '';
    let desc = '';

    // 2. Try to extract Shop ID and Item ID for a Direct API Call (For Product Pages)
    const match = finalUrl.match(/-i\.(\d+)\.(\d+)/) || finalUrl.match(/shop\/(\d+)\/item\/(\d+)/);
    
    if (match && match.length === 3) {
      const shopId = match[1];
      const itemId = match[2];
      
      // Force an API call from inside the browser to bypass CORS
      const apiData = await page.evaluate(async ({ domain, shopId, itemId }) => {
        try {
          const res = await fetch(`https://${domain}/api/v4/item/get?itemid=${itemId}&shopid=${shopId}` );
          return await res.json();
        } catch (e) { return null; }
      }, { domain, shopId, itemId });

      if (apiData?.data?.video_info_list?.[0]) {
        const videoInfo = apiData.data.video_info_list[0];
        title = apiData.data.name || title;
        desc = apiData.data.description || desc;
        cover = apiData.data.image ? `https://cf.shopee.com/file/${apiData.data.image}` : cover;
        
        // Grab the unwatermarked video from the hidden formats array
        if (videoInfo.formats && videoInfo.formats.length > 0 ) {
          const cleanFormats = videoInfo.formats.filter((f: any) => f.url && !f.url.includes('.default.mp4'));
          bestUrl = cleanFormats.length > 0 ? cleanFormats[0].url : videoInfo.formats[0].url;
        } else {
          bestUrl = videoInfo.video_url;
        }
      }
    }

    // 3. If API failed or it's a Shopee Video link, scrape the raw HTML for hidden JSON state
    if (!bestUrl) {
      const html = await page.content();
      
      // Regex to find the hidden "formats" array in Shopee's injected SSR scripts
      const formatsMatch = html.match(/"formats":\s*\[\s*\{\s*"url":\s*"([^"]+)"/);
      if (formatsMatch && formatsMatch[1]) {
        // Clean up escaped slashes (e.g., https:\/\/... )
        bestUrl = formatsMatch[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
      } else {
        // Absolute Fallback: Grab whatever is in the video tag
        const domResult = await page.evaluate(() => {
          const videoEl = document.querySelector('video');
          return {
            url: videoEl ? (videoEl.src || videoEl.getAttribute('data-src') || videoEl.querySelector('source')?.getAttribute('src')) : null,
            title: (document.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content,
            cover: (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content
          };
        });
        bestUrl = domResult.url || '';
        title = domResult.title || title;
        cover = domResult.cover || cover;
      }
    }

    if (!bestUrl) {
      throw new Error('Could not extract video data from this Shopee link.');
    }

    return {
      videoUrl: bestUrl,
      title: title,
      cover: cover,
      author: 'Shopee',
      desc: desc
    };
  } finally {
    await context.close();
  }
}
