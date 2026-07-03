import axios from 'axios';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  console.log(`\n========== SVXTRACT SCRAPER START ==========`);
  console.log(`[1] Target URL: ${url}`);

  try {
    console.log(`[2] Fetching session cookies from svxtract.com...`);
    const homeRes = await axios.get('https://svxtract.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 ) AppleWebKit/537.36'
      }
    });

    const cookies = homeRes.headers['set-cookie'] || [];
    const cookieString = cookies.map(c => c.split(';')[0]).join('; ');
    console.log(`[3] Got cookies: ${cookieString ? 'Yes' : 'No'}`);

    console.log(`[4] Sending URL to SVXtract API...`);
    
    // Using URLSearchParams directly forces Axios to send perfect application/x-www-form-urlencoded data
    const params = new URLSearchParams();
    params.append('url', url);

    const apiRes = await axios.post('https://svxtract.com/apiv3.php', params, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 ) AppleWebKit/537.36',
        'Origin': 'https://svxtract.com',
        'Referer': 'https://svxtract.com/',
        'Cookie': cookieString,
        'X-Requested-With': 'XMLHttpRequest'
      }
    } );

    const data = apiRes.data;
    console.log(`[5] API Response received!`);
    
    let videoUrl = '';
    let title = 'Shopee Video';
    let cover = '';
    let author = 'Shopee Creator';

    // Parse JSON response
    if (typeof data === 'object' && data !== null) {
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
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data:`, typeof error.response.data === 'string' ? error.response.data.substring(0, 200) : error.response.data);
    }
    console.error('============================================\n');
    throw new Error('Failed to extract video using SVXtract. The service might be down or the URL is invalid.');
  }
}
