import { chromium, Browser } from 'playwright';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }

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
        '--single-process'
      ],
    });
  }
  return globalBrowser;
}

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  console.log(`\n========== SHOPEE DIRECT BROWSER API ==========`);
  console.log(`[1] Original URL: ${url}`);

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();

  // Block heavy media and images to save RAM, making it lightning fast
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['font', 'media', 'image'].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  try {
    console.log(`[2] Resolving Shopee link...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000); // Wait for shp.ee to redirect
    
    const resolvedUrl = page.url();
    console.log(`[3] Resolved URL: ${resolvedUrl}`);

    const urlObj = new URL(resolvedUrl);
    const domain = urlObj.hostname;

    let bestUrl = '';
    let title = 'Shopee Video';
    let cover = '';
    let desc = '';

    // Extract IDs using FIXED regex (matches alphanumeric base64 IDs like AsWxY3sOCAARIY9RAAAAAA==)
    let shopId = null, itemId = null, videoId = null;

    const p1 = resolvedUrl.match(/-i\.(\d+)\.(\d+)/);
    const p2 = resolvedUrl.match(/shop\/(\d+)\/item\/(\d+)/);
    if (p1) { shopId = p1[1]; itemId = p1[2]; }
    else if (p2) { shopId = p2[1]; itemId = p2[2]; }

    const v1 = resolvedUrl.match(/video_id=([^&]+)/);
    const v2 = resolvedUrl.match(/answers\/([^/?]+)/);
    const v3 = resolvedUrl.match(/share-video\/([^/?]+)/);
    const v4 = resolvedUrl.match(/\/v\/([^/?]+)/);

    if (v1) videoId = v1[1];
    else if (v2) videoId = v2[1];
    else if (v3) videoId = v3[1];
    else if (v4) videoId = v4[1];

    console.log(`[4] Extracted IDs -> Shop: ${shopId}, Item: ${itemId}, Video: ${videoId}`);

    if (videoId) {
      console.log(`[5] Pinging Video API internally...`);
      // Run fetch INSIDE the browser to bypass CORS and Cloudflare
      const apiData = await page.evaluate(async ({ domain, videoId }) => {
        try {
          const res = await fetch(`https://${domain}/api/v4/video/get_video_detail?video_id=${videoId}` );
          return await res.json();
        } catch (e) { return null; }
      }, { domain, videoId });

      if (apiData?.data) {
        title = apiData.data.title || title;
        desc = apiData.data.description || desc;
        cover = apiData.data.cover || cover;
        
        if (apiData.data.formats && apiData.data.formats.length > 0) {
          const clean = apiData.data.formats.find((f: any) => f.url && !f.url.includes('.default.mp4'));
          bestUrl = clean ? clean.url : apiData.data.formats[0].url;
          console.log(`[6] SUCCESS: Found unwatermarked video in formats array!`);
        } else if (apiData.data.video_url) {
          bestUrl = apiData.data.video_url;
        }
      }
    } else if (shopId && itemId) {
      console.log(`[5] Pinging Product API internally...`);
      const apiData = await page.evaluate(async ({ domain, shopId, itemId }) => {
        try {
          const res = await fetch(`https://${domain}/api/v4/item/get?itemid=${itemId}&shopid=${shopId}` );
          return await res.json();
        } catch (e) { return null; }
      }, { domain, shopId, itemId });

      if (apiData?.data) {
        title = apiData.data.name || title;
        desc = apiData.data.description || desc;
        cover = apiData.data.image ? `https://cf.shopee.com/file/${apiData.data.image}` : cover;
        
        const vInfo = apiData.data.video_info_list?.[0];
        if (vInfo ) {
          if (vInfo.formats && vInfo.formats.length > 0) {
            const clean = vInfo.formats.find((f: any) => f.url && !f.url.includes('.default.mp4'));
            bestUrl = clean ? clean.url : vInfo.formats[0].url;
            console.log(`[6] SUCCESS: Found unwatermarked video in formats array!`);
          } else if (vInfo.video_url) {
            bestUrl = vInfo.video_url;
          }
        }
      }
    }

    // Fallback to DOM if API fails
    if (!bestUrl) {
      console.log(`[5] API failed. Falling back to DOM extraction...`);
      bestUrl = await page.evaluate(() => {
        const v = document.querySelector('video source[src*=".mp4"], video');
        return v ? (v as any).src || v.getAttribute('data-src') : '';
      }) || '';
    }

    if (!bestUrl) {
      throw new Error('Could not extract video data from this Shopee link.');
    }

    // Final safety scrub
    bestUrl = bestUrl.replace('.default.mp4', '.mp4');
    console.log(`[7] FINAL URL: ${bestUrl}`);
    console.log(`========== SHOPEE DIRECT BROWSER API END ==========\n`);

    return { videoUrl: bestUrl, title, cover, author: 'Shopee', desc };

  } catch (error: any) {
    console.error('\n========== SCRAPER ERROR ==========');
    console.error(error.message);
    console.error('===================================\n');
    throw new Error('Failed to extract video. The link might be invalid or private.');
  } finally {
    await context.close();
  }
}
