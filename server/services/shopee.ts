import axios from 'axios';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  let finalUrl = url;
  
  try {
    // 1. Follow redirects (e.g., if the user provides a short shp.ee link)
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    // Grab the final URL after redirects
    if (response.request?.res?.responseUrl) {
      finalUrl = response.request.res.responseUrl;
    }
  } catch (e: any) {
    if (e.response?.request?.res?.responseUrl) {
      finalUrl = e.response.request.res.responseUrl;
    }
  }

  const urlObj = new URL(finalUrl);
  const domain = urlObj.hostname; // e.g., shopee.com.my or shopee.co.id

  let bestUrl = '';
  let title = 'Shopee Video';
  let cover = '';
  let desc = '';

  // METHOD 1: Direct API Fetch for Product Pages
  const itemMatch = finalUrl.match(/-i\.(\d+)\.(\d+)/) || finalUrl.match(/shop\/(\d+)\/item\/(\d+)/);
  if (itemMatch && itemMatch.length === 3) {
    const shopId = itemMatch[1];
    const itemId = itemMatch[2];

    try {
      const apiUrl = `https://${domain}/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`;
      const apiRes = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 ) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });

      const data = apiRes.data?.data;
      if (data) {
        title = data.name || title;
        desc = data.description || desc;
        cover = data.image ? `https://cf.shopee.com/file/${data.image}` : cover;

        const vInfo = data.video_info_list?.[0];
        if (vInfo ) {
          // Hunt for the unwatermarked HD video in the formats array
          if (vInfo.formats && vInfo.formats.length > 0) {
            const clean = vInfo.formats.find((f: any) => f.url && !f.url.includes('.default.mp4'));
            bestUrl = clean ? clean.url : vInfo.formats[0].url;
          } else if (vInfo.video_url) {
            bestUrl = vInfo.video_url;
          }
        }
      }
    } catch (e) {
      console.log("Product API fetch failed");
    }
  }

  // METHOD 2: Direct API Fetch for Shopee Video Pages
  if (!bestUrl) {
    const videoIdMatch = finalUrl.match(/video_id=([^&]+)/) || finalUrl.match(/answers\/(\d+)/) || finalUrl.match(/share-video\/(\d+)/);
    if (videoIdMatch && videoIdMatch[1]) {
      const videoId = videoIdMatch[1];
      try {
        const apiUrl = `https://${domain}/api/v4/video/get_video_detail?video_id=${videoId}`;
        const apiRes = await axios.get(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 ) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          }
        });

        const data = apiRes.data?.data;
        if (data) {
          title = data.title || title;
          desc = data.description || desc;
          cover = data.cover ? data.cover : cover;

          if (data.formats && data.formats.length > 0) {
            const clean = data.formats.find((f: any) => f.url && !f.url.includes('.default.mp4'));
            bestUrl = clean ? clean.url : data.formats[0].url;
          } else if (data.video_url) {
            bestUrl = data.video_url;
          }
        }
      }
