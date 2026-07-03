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
    let bestUrl = '';
    let title = 'Shopee Video';
    let cover = '';
    let desc = '';

    // METHOD 1: Network Interception
    page.on('response', async (response) => {
      try {
        const reqUrl = response.url();
        if (reqUrl.includes('api/v4') && response.request().resourceType() === 'fetch') {
          const body = await response.json().catch(() => null);
          if (body) {
            const formats = body?.data?.video_info_list?.[0]?.formats || body?.data?.formats || body?.data?.video?.formats;
            if (formats && Array.isArray(formats)) {
              const clean = formats.find(f => f.url && !f.url.includes('.default.mp4'));
              if (clean) bestUrl = clean.url;
            }
            if (!bestUrl) {
              const vUrl = body?.data?.video_info_list?.[0]?.video_url || body?.data?.video_url || body?.data?.video?.video_url;
              if (vUrl) bestUrl = vUrl;
            }
            if (body?.data?.title || body?.data?.name) title = body.data.title || body.data.name;
          }
        }
      } catch (e) {}
    });

    // Load the page and wait for network to settle
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    const domain = new URL(finalUrl).hostname;

    // METHOD 2: Direct API Fetch (For Shopee Video Links)
    if (!bestUrl) {
      const videoIdMatch = finalUrl.match(/video_id=([^&]+)/) || finalUrl.match(/answers\/(\d+)/);
      if (videoIdMatch && videoIdMatch[1]) {
        const videoId = videoIdMatch[1];
        const apiData = await page.evaluate(async ({ domain, videoId }) => {
          try {
            const res = await fetch(`https://${domain}/api/v4/video/get_video_detail?video_id=${videoId}` );
            return await res.json();
          } catch (e) { return null; }
        }, { domain, videoId });

        if (apiData?.data?.formats) {
          const clean = apiData.data.formats.find((f: any) => f.url && !f.url.includes('.default.mp4'));
          bestUrl = clean ? clean.url : apiData.data.formats[0].url;
        } else if (apiData?.data?.video_url) {
          bestUrl = apiData.data.video_url;
        }
      }
    }

    // METHOD 3: Direct API Fetch (For Product Links)
    if (!bestUrl) {
      const itemMatch = finalUrl.match(/-i\.(\d+)\.(\d+)/) || finalUrl.match(/shop\/(\d+)\/item\/(\d+)/);
      if (itemMatch && itemMatch.length === 3) {
        const shopId = itemMatch[1];
        const itemId = itemMatch[2];
        const apiData = await page.evaluate(async ({ domain, shopId, itemId }) => {
          try {
            const res = await fetch(`https://${domain}/api/v4/item/get?itemid=${itemId}&shopid=${shopId}` );
            return await res.json();
          } catch (e) { return null; }
        }, { domain, shopId, itemId });

        const vInfo = apiData?.data?.video_info_list?.[0];
        if (vInfo?.formats) {
          const clean = vInfo.formats.find((f: any) => f.url && !f.url.includes('.default.mp4'));
          bestUrl = clean ? clean.url : vInfo.formats[0].url;
        } else if (vInfo?.video_url) {
          bestUrl = vInfo.video_url;
        }
      }
    }

    // METHOD 4: HTML Regex Scrape
    if (!bestUrl) {
      const html = await page.content();
      const formatsMatch = html.match(/"formats":\s*\[(.*?)\]/);
      if (formatsMatch) {
        const urls = formatsMatch[1].match(/"url":\s*"([^"]+)"/g);
        if (urls) {
          const cleanUrls = urls.map(u => u.replace(/"url":\s*"/, '').replace('"', '').replace(/\\u002F/g, '/').replace(/\\/g, ''));
          const unwatermarked = cleanUrls.find(u => !u.includes('.default.mp4'));
          bestUrl = unwatermarked || cleanUrls[0];
        }
      }
    }

    // METHOD 5: Fallback to DOM
    if (!bestUrl) {
      bestUrl = await page.evaluate(() => {
        const videoEl = document.querySelector('video');
        return videoEl ? (videoEl.src || videoEl.getAttribute('data-src') || videoEl.querySelector('source')?.getAttribute('src') || '') : '';
      });
    }

    if (!bestUrl) {
      throw new Error('Could not extract video data from this Shopee link. The video may be private or unavailable.');
    }

    // Final Watermark Scrub
    bestUrl = bestUrl.replace('.default.mp4', '.mp4');

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
