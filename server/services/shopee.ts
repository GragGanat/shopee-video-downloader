import axios from 'axios';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  console.log(`\n========== SHOPEE NO WATERMARK SCRAPER ==========`);
  console.log(`[1] Original URL: ${url}`);

  try {
    // Step 1: Get CSRF token and session cookies from shopeenowatermark.com
    console.log(`[2] Fetching session cookies and CSRF token...`);
    const homeRes = await axios.get('https://shopeenowatermark.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const cookies = homeRes.headers['set-cookie'] || [];
    const cookieString = cookies.map(c => c.split(';')[0]).join('; ');
    
    // Extract CSRF token from meta tag
    const html = homeRes.data;
    const tokenMatch = html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
    const csrfToken = tokenMatch ? tokenMatch[1] : '';
    
    console.log(`[3] Got cookies: ${cookieString ? 'Yes' : 'No'}`);
    console.log(`[3] Got CSRF token: ${csrfToken ? 'Yes' : 'No'}`);

    if (!csrfToken) {
      throw new Error('Failed to extract CSRF token from shopeenowatermark.com');
    }

    // Step 2: Call their internal API
    console.log(`[4] Sending URL to extraction API...`);
    
    const apiRes = await axios.post('https://shopeenowatermark.com/api/extract', 
      { url: url },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://shopeenowatermark.com',
          'Referer': 'https://shopeenowatermark.com/',
          'Cookie': cookieString,
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );

    const data = apiRes.data;
    console.log(`[5] API Response received!`);
    
    if (!data || !data.success) {
      throw new Error(data?.message || 'API returned failure response');
    }

    // Step 3: Extract the best quality stream
    let videoUrl = '';
    
    if (data.streams_array && data.streams_array.length > 0) {
      // Prefer H264 for better compatibility if available, otherwise just take the first one
      const h264Stream = data.streams_array.find((s: any) => s.codec === 'MP4');
      videoUrl = h264Stream ? h264Stream.stream_url : data.streams_array[0].stream_url;
    } else if (data.preview) {
      videoUrl = data.preview;
    }

    if (!videoUrl) {
      throw new Error('No video streams found in the response');
    }

    console.log(`[6] SUCCESS: Extracted unwatermarked URL!`);
    console.log(`========== SHOPEE NO WATERMARK SCRAPER END ==========\n`);

    return { 
      videoUrl, 
      title: data.title || 'Shopee Video', 
      cover: data.thumbnail || '', 
      author: data.username || 'Shopee Creator', 
      desc: '' 
    };

  } catch (error: any) {
    console.error('\n========== SCRAPER ERROR ==========');
    console.error(error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data:`, typeof error.response.data === 'string' ? error.response.data.substring(0, 200) : error.response.data);
    }
    console.error('===================================\n');
    throw new Error('Failed to extract video. The service might be down or the URL is invalid.');
  }
}
