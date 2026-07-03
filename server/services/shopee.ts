import axios from 'axios';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  console.log(`\n========== SHOPEE DIRECT API SCRAPER ==========`);
  console.log(`[1] Original URL: ${url}`);

  let finalUrl = url;
  let html = '';

  try {
    // 1. Follow HTTP Redirects (Crucial for shp.ee links)
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    finalUrl = res.request?.res?.responseUrl || finalUrl;
    html = typeof res.data === 'string' ? res.data : '';
    console.log(`[2] Redirected URL: ${finalUrl}`);
  } catch (e: any) {
    finalUrl = e.response?.request?.res?.responseUrl || finalUrl;
    html = typeof e.response?.data === 'string' ? e.response.data : '';
    console.log(`[2] Redirected URL (via catch): ${finalUrl}`);
  }

  // 2. Follow JS/Meta Redirects (Shopee often hides the real URL inside the HTML)
  const metaMatch = html.match(/URL='?([^'"]+)'?/i) || html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i);
  if (metaMatch && metaMatch[1]) {
    finalUrl = metaMatch[1];
    console.log(`[3] Followed JS/Meta Redirect to: ${finalUrl}`);
  }

  // 3. Extract IDs using comprehensive Regex patterns
  let shopId = null, itemId = null, videoId = null;

  const p1 = finalUrl.match(/-i\.(\d+)\.(\d+)/);
  const p2 = finalUrl.match(/shop\/(\d+)\/item\/(\d+)/);
  const p3 = finalUrl.match(/product\/(\d+)\/(\d+)/);
  const p4 = finalUrl.match(/itemid=(\d+)&shopid=(\d+)/);
  const p5 = finalUrl.match(/shopid=(\d+)&itemid=(\d+)/);

  if (p1) { shopId = p1[1]; itemId = p1[2]; }
  else if (p2) { shopId = p2[1]; itemId = p2[2]; }
  else if (p3) { shopId = p3[1]; itemId = p3[2]; }
  else if (p4) { itemId = p4[1]; shopId = p4[2]; }
  else if (p5) { shopId = p5[1]; itemId = p5[2]; }

  const v1 = finalUrl.match(/video_id=([^&]+)/);
  const v2 = finalUrl.match(/answers\/(\d+)/);
  const v3 = finalUrl.match(/share-video\/(\d+)/);
  const v4 = finalUrl.match(/\/v\/(\d+)/);

  if (v1) videoId = v1[1];
  else if (v2) videoId = v2[1];
  else if (v3) videoId = v3[1];
  else if (v4) videoId = v4[1];

  console.log(`[4] Extracted IDs -> Shop: ${shopId}, Item: ${itemId}, Video: ${videoId}`);

  const domainMatch = finalUrl.match(/https?:\/\/([^/]+ )/);
  const domain = domainMatch ? domainMatch[1] : 'shopee.co.id';

  let bestUrl = '';
  let title = 'Shopee Video';
  let cover = '';
  let desc = '';

  // 4. Fetch Product API
  if (shopId && itemId) {
    const apiUrl = `https://${domain}/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`;
    console.log(`[5] Pinging Product API: ${apiUrl}` );
    try {
      const apiRes = await axios.get(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      const data = apiRes.data?.data;
      if (data) {
        title = data.name || title;
        desc = data.description || desc;
        cover = data.image ? `https://cf.shopee.com/file/${data.image}` : cover;
        const vInfo = data.video_info_list?.[0];
        if (vInfo?.formats?.length > 0 ) {
          const clean = vInfo.formats.find((f: any) => f.url && !f.url.includes('.default.mp4'));
          bestUrl = clean ? clean.url : vInfo.formats[0].url;
        } else if (vInfo?.video_url) {
          bestUrl = vInfo.video_url;
        }
      }
    } catch (e: any) { console.log(`[!] Product API Error: ${e.message}`);
