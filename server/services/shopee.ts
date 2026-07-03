import { chromium, Browser, Page } from 'playwright';

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
    const capturedResponses: any[] = [];

    // CRITICAL FIX: Attach the network listener BEFORE navigating to the page!
    // This ensures we catch the initial API calls that contain the unwatermarked video data.
    page.on('response', async (response) => {
      try {
        const reqUrl = response.url();
        // Only intercept API calls to avoid downloading heavy assets
        if (reqUrl.includes('api/v4') || reqUrl.includes('graphql') || reqUrl.includes('get_video_detail') || reqUrl.includes('video_info')) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const body = await response.json();
            capturedResponses.push({ url: reqUrl, body });
          }
        }
      } catch (e) {
        // Ignore parsing errors for non-JSON responses
      }
    });

    // Navigate to the URL
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Wait for the page to fully load and API calls to finish
    await page.waitForTimeout(4000);

    // Scroll down a few times to trigger any lazy-loaded video APIs
    for (let i = 0; i < 3; i++) {
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      } catch (e) {}
    }

    // 1. Try to extract from the captured API responses
    let result = analyzeCapturedResponses(capturedResponses);

    // 2. If API extraction fails, fallback to DOM extraction
    if (!result) {
      result = await extractFromDOM(page);
    }

    if (!result) {
      throw new Error('Could not extract video data from this Shopee link. The video may be private or unavailable.');
    }

    // 3. Final Watermark Cleaning
    // Even if we found a URL, we force-clean it to ensure no watermark remains
    result.videoUrl = cleanWatermarkUrl(result.videoUrl);

    return result;
  } finally {
    await context.close();
  }
}

function cleanWatermarkUrl(url: string): string {
  if (!url) return url;
  
  // Shopee's watermarked videos usually end with .default.mp4
  // The raw, unwatermarked video is at the exact same URL but ending in .mp4
  if (url.includes('.default.mp4')) {
    return url.replace('.default.mp4', '.mp4');
  }
  
  return url;
}

function analyzeCapturedResponses(responses: any[]): VideoResult | null {
  const allFoundVideos: VideoDataMatch[] = [];

  // Scan every single JSON response we captured
  for (const res of responses) {
    extractAllVideos(res.body, 0, allFoundVideos);
  }

  if (allFoundVideos.length > 0) {
    // Filter out watermarked videos
    const unwatermarkedVideos = allFoundVideos.filter(v => 
      v.url && !v.url.includes('.default.mp4') && !v.url.includes('watermark')
    );

    // Pick the best video (prefer unwatermarked, fallback to whatever we found)
    const bestVideo = unwatermarkedVideos.length > 0 ? unwatermarkedVideos[0] : allFoundVideos[0];

    // Aggregate metadata (sometimes title is in one object, but the HD video URL is in another)
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

async function extractFromDOM(page: Page): Promise<VideoResult | null> {
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
      return {
        videoUrl: result.videoUrl,
        title: result.title || 'Shopee Video',
        cover: result.cover || '',
        author: result.author || 'Unknown',
        desc: result.desc || '',
      };
    }
  } catch (e) {}

  return null;
}

// Recursive function to find ALL video URLs in the massive Shopee JSON response
function extractAllVideos(obj: any, depth = 0, results: VideoDataMatch[] = []) {
  if (depth > 15 || !obj || typeof obj !== 'object') return;

  // Check if this specific object contains a video URL
  let url = obj.video_url || obj.videoUrl || obj.play_url || obj.playUrl || obj.default_format_url;
  
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
