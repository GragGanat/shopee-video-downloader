import axios from 'axios'; // Kept in case you use it elsewhere in your app

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  console.log(`\n========== SVXTRACT SCRAPER START ==========`);
  console.log(`[1] Target URL: ${url}`);

  try {
    console.log(`[2] Fetching session cookies and tokens from svxtract.com...`);
    
    // Use native fetch to get the homepage
    const homeRes = await fetch('https://svxtract.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 ) AppleWebKit/537.36'
      }
    });

    // Extract Cookies
    const cookies = homeRes.headers.getSetCookie ? homeRes.headers.getSetCookie() : [];
    const cookieString = cookies.map(c => c.split(';')[0]).join('; ');
    console.log(`[3] Got cookies: ${cookieString ? 'Yes' : 'No'}`);

    // Extract CSRF Tokens from the HTML form
    const homeHtml = await homeRes.text();
    const tokenMatch = homeHtml.match(/name=["']_?token["']\s+value=["']([^"']+)["']/i) || 
                       homeHtml.match(/value=["']([^"']+)["']\s+name=["']_?token["']/i) ||
                       homeHtml.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/i);
    const token = tokenMatch ? tokenMatch[1] : '';
    if (token) console.log(`[3b] Found CSRF Token: ${token.substring(0, 5)}...`);

    console.log(`[4] Sending URL to SVXtract API...`);
    
    // Manually construct the exact URL-encoded string so PHP is guaranteed to parse it
    let payload = `url=${encodeURIComponent(url)}&link=${encodeURIComponent(url)}`;
    if (token) {
      payload += `&token=${encodeURIComponent(token)}&_token=${encodeURIComponent(token)}&csrf_token=${encodeURIComponent(token)}`;
    }

    // Use native fetch to POST the data
    const apiRes = await fetch('https://svxtract.com/apiv3.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 ) AppleWebKit/537.36',
        'Origin': 'https://svxtract.com',
        'Referer': 'https://svxtract.com/',
        'Cookie': cookieString,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      body: payload
    } );

    const responseText = await apiRes.text();
    console.log(`[5] API Response Status: ${apiRes.status}`);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = responseText;
    }
    
    let videoUrl = '';
    let title = 'Shopee Video';
    let cover = '';
    let author = 'Shopee Creator';

    // Parse JSON response
    if (typeof data === 'object' && data !== null) {
      if (data.error) {
         console.log(`[!] API returned error: ${data.error}`);
         throw new Error(`SVXtract API Error: ${data.error}`);
      }
      videoUrl = data.video_url || data.url || data.download_url || data.src || data.hd_video;
      title = data.title || title;
      cover = data.thumbnail || data.cover || data.image || cover;
      author = data.author || data.username || author;
    } 
    
    // Parse HTML response (if they return a rendered card instead of JSON)
    if (!videoUrl && typeof data === 'string') {
      const match = data.match(/href=["']([^"']+\.mp4[^"']*)["']/i) || data.match(/src=["']([^"']+\.mp4[^"']*)["']/i);
      if (match && match[1]) videoUrl = match[1];
      
      const titleMatch = data.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i) || data.match(/<p[^>]*class=["'][^"']*title[^"']*["'][^>]*>(.*?)<\/p>/i);
      if (titleMatch && titleMatch[1]) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    if (!videoUrl) {
      console.log(`[6] FAILED: Could not find video URL in SVXtract response.`);
      console.log(`Response Data:`, typeof data === 'string' ? data.substring(0, 300) : JSON.stringify(data).substring(0, 300));
      throw new Error('SVXtract did not return a valid video URL.');
    }

    console.log(`[6] SUCCESS: Extracted unwatermarked URL!`);
    console.log(`========== SVXTRACT SCRAPER END ==========\n`);

    return { videoUrl, title, cover, author, desc: '' };

  } catch (error: any) {
    console.error('\n========== SVXTRACT SCRAPER ERROR ==========');
    console.error(error.message);
    console.error('============================================\n');
    throw new Error('Failed to extract video using SVXtract. The service might be down or the URL is invalid.');
  }
}
