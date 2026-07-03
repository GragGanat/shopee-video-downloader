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
    await context.close();
  }
}

async function tryExtractFromAPIInterception(page: any, url: string): Promise<VideoResult | null> {
  const capturedData: any = {};

  page.on('response', async (response: any) => {
    try {
      const body = await response.text();
      if (body.includes('video') || body.includes('mp4') || body.includes('m3u8')) {
        try {
          const json = JSON.parse(body);
          capturedData.apiResponse = json;
          capturedData.apiUrl = response.url();
        } catch (e) {
          capturedData.rawBody = body.substring(0, 200);
          capturedData.apiUrl = response.url();
        }
      }
    } catch (e) {}
  });

  await page.waitForTimeout(5000);

  for (let i = 0; i < 5; i++) {
    try {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    } catch (e) {}
  }

  await page.waitForTimeout(3000);

  if (capturedData.apiResponse) {
    return parseShopeeApiResponse(capturedData.apiResponse, capturedData.apiUrl);
  }

  return null;
}

async function tryExtractFromDOM(page: any): Promise<VideoResult | null> {
  try {
    try {
      await page.waitForSelector('video, source[src*="mp4"], source[src*="m3u8"]', { timeout: 5000 });
    } catch (e) {}

    const result = await page.evaluate((): { videoUrl: string | null; title: string; author: string; desc: string; cover: string | null } => {
      const data: { videoUrl: string | null; title: string; author: string; desc: string; cover: string | null } = {
        videoUrl: null,
        title: 'Shopee Video',
        author: 'Unknown',
        desc: '',
        cover: null,
      };

      const videoEl = document.querySelector('video');
      if (videoEl) {
        const src = videoEl.src || videoEl.getAttribute('data-src') || '';
        const sources = videoEl.querySelectorAll('source');
        const sourceSrc = sources.length > 0 ? (sources[0].getAttribute('src') || '') : '';
        data.videoUrl = src || sourceSrc;
      }

      const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement;
      if (ogTitle) data.title = ogTitle.content || data.title;

      const ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement;
      if (ogImage) data.cover = ogImage.content || data.cover;

      return data;
    });

    if (result.videoUrl) {
      // If we only have DOM extraction, we try to clean the URL if it has a default watermark suffix
      let cleanUrl = result.videoUrl;
      if (cleanUrl.includes('.default.mp4')) {
        cleanUrl = cleanUrl.replace('.default.mp4', '.mp4');
      }

      return {
        videoUrl: cleanUrl,
        title: result.title || 'Shopee Video',
        cover: result.cover || '',
        author: result.author || 'Unknown',
        desc: result.desc || '',
      };
    }
  } catch (e) {}

  return null;
}

function parseShopeeApiResponse(data: any, url: string): VideoResult | null {
  if (!data || typeof data !== 'object') return null;

  const allFoundVideos: VideoDataMatch[] = [];
  extractAllVideos(data, 0, allFoundVideos);

  if (allFoundVideos.length > 0) {
    // 1. Filter out watermarked videos (usually end in .default.mp4)
    const unwatermarkedVideos = allFoundVideos.filter(v => 
      v.url && !v.url.includes('.default.mp4') && !v.url.includes('watermark')
    );

    // 2. Pick the best video (prefer unwatermarked, fallback to whatever we found)
    const bestVideo = unwatermarkedVideos.length > 0 ? unwatermarkedVideos[0] : allFoundVideos[0];

    // 3. Aggregate metadata (sometimes title is in one object, but the HD video URL is in another)
    const title = allFoundVideos.find(v => v.title)?.title || 'Shopee Video';
    const author = allFoundVideos.find(v => v.author)?.author || 'Unknown';
    const cover = allFoundVideos.find(v => v.cover)?.cover || '';
    const desc = allFoundVideos.find(v => v.desc)?.desc || '';

    return {
      videoUrl: bestVideo.url,
      title,
      cover,
      author,
      desc,
    };
  }

  return null;
}

// Recursive function to find ALL video URLs in the massive Shopee JSON response
function extractAllVideos(obj: any, depth = 0, results: VideoDataMatch[] = []) {
  if (depth > 15 || !obj || typeof obj !== 'object') return;

  // Check if this specific object contains a video URL
  let url = obj.video_url || obj.videoUrl || obj.play_url || obj.playUrl;
  
  if (!url && obj.url && typeof obj.url === 'string' && (obj.url.includes('.mp4') || obj.url.includes('.m3u8') || obj.url.includes('/video/'))) {
    url = obj.url;
  }

  if (url) {
    results.push({
      url,
      title: obj.title || obj.video_title || obj.name || obj.desc,
      author: obj.author_name || obj.author?.nickname || obj.user?.nickname || obj.creator,
      cover: obj.cover || obj.thumbnail || obj.thumb || obj.video_cover,
      desc: obj.description || obj.desc || obj.video_desc,
    });
  }

  // Continue searching deeper into the JSON
  if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 100)) {
      extractAllVideos(item, depth + 1, results);
    }
  } else {
    for (const key of Object.keys(obj).slice(0, 100)) {
      extractAllVideos(obj[key], depth + 1, results);
    }
  }
}
