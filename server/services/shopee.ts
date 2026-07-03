import axios from 'axios';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  let finalUrl = url;
  
  try {
    // 1. Follow redirects (e.g., if the user provides a short shp.ee link)
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (response.request?.res?.responseUrl) finalUrl = response.request.res.responseUrl;
  } catch (e: any) {
    if (e.response?.request?.res?.responseUrl) finalUrl = e.response.request.res.responseUrl;
  }

  const urlObj = new URL(finalUrl);
  const domain = urlObj.hostname;

  let bestUrl = '';
  let title = 'Shopee Video';
  let cover = '';
  let desc = '';

  // METHOD 1: Direct API Fetch for Product Pages
  const itemMatch = finalUrl.match(/-i\.(\d+)\.(\d+)/) || finalUrl.match(/shop\/(\d+)\/item\/(\d+)/);
  if (itemMatch && itemMatch.length === 3) {
    try {
      const apiRes = await axios.get(`https://${domain}/api/v4/item/get?itemid=${itemMatch[2]}&shopid=${itemMatch[1]}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 ) AppleWebKit/537.36' }
      });
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
    } catch (e) {}
  }

  // METHOD 2: Direct API Fetch for Shopee Video Pages
  if (!bestUrl) {
    const videoIdMatch = finalUrl.match(/video_id=([^&]+)/) || finalUrl.match(/answers\/(\d+)/) || finalUrl.match(/share-video\/(\d+)/);
    if (videoIdMatch && videoIdMatch[1]) {
      try {
        const apiRes = await axios.get(`https://${domain}/api/v4/video/get_video_detail?video_id=${videoIdMatch[1]}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 ) AppleWebKit/537.36' }
        });
        const data = apiRes.data?.data;
        if (data) {
          title = data.title || title;
          desc = data.description || desc;
          cover = data.cover || cover;
          if (data.formats?.length > 0) {
            const clean = data.formats.find((f: any) => f.url && !f.url.includes('.default.mp4'));
            bestUrl = clean ? clean.url : data.formats[0].url;
          } else if (data.video_url) {
            bestUrl = data.video_url;
          }
        }
      } catch (e) {}
    }
  }

  // METHOD 3: Fallback HTML Regex (If API fails)
  if (!bestUrl) {
    try {
      const htmlRes = await axios.get(finalUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const formatsMatch = htmlRes.data.match(/"formats":\s*\[(.*?)\]/);
      if (formatsMatch) {
        const urls = formatsMatch[1].match(/"url":\s*"([^"]+)"/g);
        if (urls) {
          const cleanUrls = urls.map((u: string) => u.replace(/"url":\s*"/, '').replace('"', '').replace(/\\u002F/g, '/').replace(/\\/g, ''));
          const unwatermarked = cleanUrls.find((u: string) => !u.includes('.default.mp4'));
          bestUrl = unwatermarked || cleanUrls[0];
        }
      }
    } catch (e) {}
  }

  if (!bestUrl) {
    throw new Error('Could not extract video data from this Shopee link. The video may be private or unavailable.');
  }

  // Final Watermark Scrub
  bestUrl = bestUrl.replace('.default.mp4', '.mp4');

  return {
    videoUrl: bestUrl,
    title,
    cover,
    author: 'Shopee',
    desc
  };
}
