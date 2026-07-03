import axios from 'axios';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  console.log(`\n========== SHOPEE EXTRACTION START ==========`);
  console.log(`[1] Original URL: ${url}`);
  
  let finalUrl = url;
  let html = '';
  
  try {
    // 1. Fetch the initial page
    const response = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 5
    });
    if (response.request?.res?.responseUrl) {
      finalUrl = response.request.res.responseUrl;
    }
    html = response.data;
    console.log(`[2] Fetched successfully. URL is now: ${finalUrl}`);
  } catch (e: any) {
    console.log(`[2] Fetch error: ${e.message}`);
    if (e.response?.request?.res?.responseUrl) {
      finalUrl = e.response.request.res.responseUrl;
      html = e.response.data;
    }
  }

  // 2. Handle JavaScript/Meta Redirects (Crucial for shp.ee links!)
  if (html && (finalUrl.includes('shp.ee') || finalUrl.includes('s.shopee.'))) {
    const metaMatch = html.match(/URL='?([^'"]+)'?/i) || html.match(/href\s*=\s*["']([^"']+)["']/i);
    if (metaMatch && metaMatch[1]) {
      finalUrl = metaMatch[1];
      console.log(`[3] Followed hidden JS/Meta redirect to: ${finalUrl}`);
      
      // Fetch the actual destination page
      try {
        const res2 = await axios.get(finalUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
        html = res2.data;
      } catch (e) {}
    }
  }

  const urlObj = new URL(finalUrl.startsWith('http' ) ? finalUrl : `https://${finalUrl}` );
  const domain = urlObj.hostname;

  let bestUrl = '';
  let title = 'Shopee Video';
  let cover = '';
  let desc = '';

  // METHOD 1: Deep HTML Regex Scrape
  console.log(`[4] Scanning HTML source code...`);
  if (html) {
    const formatsMatch = html.match(/"formats":\s*\[(.*?)\]/);
    if (formatsMatch) {
      const urls = formatsMatch[1].match(/"url":\s*"([^"]+)"/g);
      if (urls) {
        const cleanUrls = urls.map((u: string) => u.replace(/"url":\s*"/, '').replace('"', '').replace(/\\u002F/g, '/').replace(/\\/g, ''));
        const unwatermarked = cleanUrls.find((u: string) => !u.includes('.default.mp4'));
        bestUrl = unwatermarked || cleanUrls[0];
        console.log(`[4] SUCCESS: Found video in HTML formats array!`);
      }
    }
    if (!bestUrl) {
      const videoInfoMatch = html.match(/"video_url":\s*"([^"]+)"/);
      if (videoInfoMatch && videoInfoMatch[1]) {
        bestUrl = videoInfoMatch[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
        console.log(`[4] SUCCESS: Found video in HTML video_url!`);
      }
    }
  }

  // METHOD 2: Direct API Fetch
  if (!bestUrl) {
    console.log(`[5] HTML scan failed. Attempting Direct API Fetch...`);
    const itemMatch = finalUrl.match(/-i\.(\d+)\.(\d+)/) || finalUrl.match(/shop\/(\d+)\/item\/(\d+)/);
    const videoIdMatch = finalUrl.match(/video_id=([^&]+)/) || finalUrl.match(/answers\/(\d+)/) || finalUrl.match(/share-video\/(\d+)/);
    
    let apiUrl = '';
    if (itemMatch) {
      apiUrl = `https://${domain}/api/v4/item/get?itemid=${itemMatch[2]}&shopid=${itemMatch[1]}`;
    } else if (videoIdMatch ) {
      apiUrl = `https://${domain}/api/v4/video/get_video_detail?video_id=${videoIdMatch[1]}`;
    }

    if (apiUrl ) {
      console.log(`[5] Pinging API: ${apiUrl}`);
      try {
        const apiRes = await axios.get(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
        const data = apiRes.data?.data;
        if (data) {
          title = data.name || data.title || title;
          desc = data.description || desc;
          cover = data.image ? `https://cf.shopee.com/file/${data.image}` : (data.cover || cover );
          
          const vInfo = data.video_info_list?.[0] || data;
          if (vInfo?.formats?.length > 0) {
            const clean = vInfo.formats.find((f: any) => f.url && !f.url.includes('.default.mp4'));
            bestUrl = clean ? clean.url : vInfo.formats[0].url;
            console.log(`[5] SUCCESS: Found video via API formats array!`);
          } else if (vInfo?.video_url) {
            bestUrl = vInfo.video_url;
            console.log(`[5] SUCCESS: Found video via API video_url!`);
          }
        }
      } catch (e: any) {
        console.log(`[5] API Error: ${e.message}`);
      }
    } else {
      console.log(`[5] Could not find Shop ID or Video ID in the URL.`);
    }
  }

  if (!bestUrl) {
    console.log(`[6] FAILED. No video URL could be extracted.`);
    console.log(`=============================================\n`);
    throw new Error('Could not extract video data from this Shopee link. The video may be private or unavailable.');
  }

  bestUrl = bestUrl.replace('.default.mp4', '.mp4');
  console.log(`[6] FINAL URL: ${bestUrl}`);
  console.log(`=============================================\n`);

  return { videoUrl: bestUrl, title, cover, author: 'Shopee', desc };
}
