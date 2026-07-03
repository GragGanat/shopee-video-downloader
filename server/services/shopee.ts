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
        '--single-process' // Extra memory saving flag
      ],
    });
  }
  return globalBrowser;
}

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  console.log(`\n========== PLAYWRIGHT SVXTRACT SCRAPER ==========`);
  console.log(`[1] Target URL: ${url}`);

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();

  // MEMORY SAVER: Block all images, CSS, and fonts from loading!
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  try {
    console.log(`[2] Navigating to SVXtract...`);
    await page.goto('https://svxtract.com/', { waitUntil: 'domcontentloaded', timeout: 15000 } );

    console.log(`[3] Typing URL into the input box...`);
    // Find the input box and type the URL
    await page.fill('input[type="text"], input[type="url"], input[name="url"]', url);

    console.log(`[4] Clicking Download and intercepting API...`);
    
    // Start listening for their backend API response BEFORE we click the button
    const responsePromise = page.waitForResponse(
      response => response.url().includes('apiv3.php') || response.url().includes('api'),
      { timeout: 15000 }
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
      console.log(`[5] Intercepted SVXtract API Response!`);
      const data = await apiResponse.json().catch(() => null);
      if (data) {
        videoUrl = data.video_url || data.url || data.download_url || data.src || data.hd_video;
        title = data.title || title;
        cover = data.thumbnail || data.cover || data.image || cover;
        author = data.author || data.username || author;
      }
    }

    // Fallback: If API interception fails, wait for the DOM to show the download button
    if (!videoUrl) {
      console.log(`[5] API interception failed. Waiting for DOM to update...`);
      await page.waitForSelector('a[href*=".mp4"], video source[src*=".mp4"]', { timeout: 15000 });
      
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

    console.log(`[6] SUCCESS: Extracted unwatermarked URL!`);
    console.log(`========== PLAYWRIGHT SCRAPER END ==========\n`);

    return { videoUrl, title, cover, author, desc: '' };

  } catch (error: any) {
    console.error('\n========== PLAYWRIGHT SCRAPER ERROR ==========');
    console.error(error.message);
    console.error('==============================================\n');
    throw new Error('Failed to extract video. The service might be down or the URL is invalid.');
  } finally {
    // ALWAYS close the tab to free up memory for the next user
    await context.close();
  }
}
