import { chromium, Browser, Page } from 'playwright';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }
interface VideoDataMatch { url: string; title?: string; author?: string; cover?: string; desc?: string; score?: number; }

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
    viewport: { width: 375, height: 812 },
  });
  const page = await context.newPage();

  try {
    const capturedResponses: any[] = [];
    
    // Listen for API responses BEFORE loading the page
    page.on('response', async (response) => {
      try {
        const reqUrl = response.url();
        if (reqUrl.includes('api/v4') || reqUrl.includes('graphql') || reqUrl.includes('get_video_detail') || reqUrl.includes('video_info') || reqUrl.includes('item/get')) {
          if ((response.headers()['content-type'] || '').includes('application/json')) {
            capturedResponses.push({ url: reqUrl, body: await response.json() });
          }
        }
      } catch (e) {}
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(4000);

    for (let i = 0; i < 3; i++) {
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      } catch (e) {}
    }

    let result = analyzeCapturedResponses(capturedResponses);
    if (!result) result = await extractFromDOM(page);
    if (!result) throw new Error('Could not extract video data from this Shopee link.');

    // Final safety check to strip watermark suffix
    result.videoUrl = cleanWatermarkUrl(result.videoUrl);
    return result;
  } finally {
    await context.close();
  }
}

function cleanWatermarkUrl(url: string): string {
  return url ? url.replace('.default.mp4', '.mp4') : url;
}

function analyzeCapturedResponses(responses: any[]): VideoResult | null {
  const allFoundVideos: VideoDataMatch[] = [];
  for (const res of responses) extractAllVideos(res.body, 0, allFoundVideos);

  if (allFoundVideos.length > 0) {
    allFoundVideos.forEach(v => {
      if (v.score === undefined) v.score = 0;
      if (v.url && !v.url.includes('.default.mp4') && !v.url.includes('watermark')) v.score += 50;
    });

    // Sort by highest score first
    allFoundVideos.sort((a, b) => (b.score || 0) - (a.score || 0));
    const bestVideo = allFoundVideos[0];

    return {
      videoUrl: bestVideo.url,
      title: allFoundVideos.find(v => v.title)?.title || 'Shopee Video',
      cover: allFoundVideos.find(v => v.cover)?.cover || '',
      author: allFoundVideos.find(v => v.author)?.author || 'Unknown',
      desc: allFoundVideos.find(v => v.desc)?.desc || '',
    };
  }
  return null;
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

function extractAllVideos(obj: any, depth = 0, results: VideoDataMatch[] = []) {
  if (depth > 15 || !obj || typeof obj !== 'object') return;

  let url = obj.video_url || obj.videoUrl || obj.play_url || obj.playUrl || obj.default_format_url;
  
  // 100 POINTS: Unwatermarked HD videos hidden in the formats array
  if (obj.formats && Array.isArray(obj.formats)) {
    for (const format of obj.formats) {
      if (format.url) {
        results.push({
          url: format.url, title: obj.title || obj.video_title || obj.desc,
          author: obj.author_name || obj.author?.nickname || obj.creator,
          cover: obj.cover || obj.thumbnail || obj.video_cover,
          desc: obj.description || obj.desc, score: 100
        });
      }
    }
  }

  if (!url && obj.url && typeof obj.url === 'string' && (obj.url.includes('.mp4') || obj.url.includes('.m3u8'))) url = obj.url;

  if (url) {
    results.push({
      url, title: obj.title || obj.video_title || obj.desc,
      author: obj.author_name || obj.author?.nickname || obj.creator,
      cover: obj.cover || obj.thumbnail || obj.video_cover,
      desc: obj.description || obj.desc,
      score: url.includes('.default.mp4') ? 10 : 50 // Penalize watermarked URLs
    });
  }

  if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 100)) extractAllVideos(item, depth + 1, results);
  } else {
    for (const key of Object.keys(obj).slice(0, 100)) extractAllVideos(obj[key], depth + 1, results);
  }
}
