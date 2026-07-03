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
  console.log(`\n========== PLAYWRIGHT SVXTRACT SCRAPER ==========`);
  console.log(`[1] Original URL: ${url}`);

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();

  // Block heavy media to save RAM, but allow scripts/CSS so SVXtract works properly
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['font', 'media'].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  try {
    // STEP 1: Resolve the Shopee shortlink
    console.log(`[2] Resolving Shopee shortlink...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000); // Give it a moment to redirect
    
    const resolvedUrl = page.url();
    console.log(`[3] Resolved URL: ${resolvedUrl}`);

    // STEP 2: Go to SVXtract
    console.log(`[4] Navigating to SVXtract...`);
    // INCREASED TIMEOUT TO 60 SECONDS
    await page.goto('https://svxtract.com/', { waitUntil: 'domcontentloaded', timeout: 60000 } );

    console.log(`[5] Typing URL into the input box...`);
    await page.fill('input[type="text"], input[type="url"], input[name="url"]', resolvedUrl);

    console.log(`[6] Clicking Download and intercepting API...`);
    
    // Start listening for their backend API response
    const responsePromise = page.waitForResponse(
      response => response.url().includes('apiv3.php') || response.url().includes('api'),
      { timeout: 60000 }
    ).catch(() => null);

    // Click the download button
    await page.click('button[type="submit"], button:has-text("Download"), button:has-text("Extract")');

    // Wait for their API to respond
    const apiResponse = await responsePromise;
    
    let videoUrl = '';
    let title = 'Shopee Video';
    let cover = '';
    let author = 'Shopee Creator';

    if (apiResponse) {
      console.log(`[7] Intercepted SVXtract API Response!`);
      const data = await apiResponse.json().catch(() => null);
      
      console.log(`[7] API Data:`, data ? JSON.stringify(data).substring(0, 300) : 'null');
      
      if (data) {
        videoUrl = data.video_url || data.url || data.download_url || data.src || data.hd_video;
        title = data.title || title;
        cover = data.thumbnail || data.cover || data.image || cover;
        author = data.author || data.username || author;
      }
    }

    // Fallback: If API interception fails, wait for the DOM to show the download button
    if (!videoUrl) {
      console.log(`[8] API interception failed or empty. Waiting for DOM to update...`);
      await page.waitForSelector('a[href*=".mp4"], video source[src*=".mp4"]', { timeout: 60000 });
      
      videoUrl = await page.evaluate(() => {
        const a = document.querySelector('a[href*=".mp4"]');
        if (a) return (a as HTMLAnchorElement).href;
        const v = document.querySelector('video source[src*=".mp4"]');
        if (v) return (v as HTMLSourceElement).src;
        return '';
      }) || '';
    }

    if (!videoUrl) {
      throw new Error('Failed to extract video from SVXtract.');
    }

    console.log(`[9] SUCCESS: Extracted unwatermarked URL!`);
    console.log(`========== PLAYWRIGHT SCRAPER END ==========\n`);

    return { videoUrl, title, cover, author, desc: '' };

  } catch (error: any) {
    console.error('\n========== PLAYWRIGHT SCRAPER ERROR ==========');
    console.error(error.message);
    console.error('==============================================\n');
    throw new Error('Failed to extract video. The service might be down or the URL is invalid.');
  } finally {
    await context.close();
  }
}
