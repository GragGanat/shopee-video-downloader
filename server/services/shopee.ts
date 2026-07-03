import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }

// Quality priority order: highest resolution first, H264 preferred over H265 for compatibility
const QUALITY_PRIORITY = [
  'V1280P', 'V1080P', 'V1080P_H265', 'V720P', 'V720P_H265', 'V540P', 'V540P_H265', 'V480P', 'V360P'
];

// Simple in-memory cache to avoid hitting rate limits for duplicate requests
const cache = new Map<string, VideoResult>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCachedVideo(url: string): VideoResult | null {
  const item = cache.get(url);
  if (item && Date.now() - (item as any).cachedAt < CACHE_TTL) {
    return item;
  }
  return null;
}

function cacheVideo(url: string, result: VideoResult) {
  cache.set(url, { ...result, cachedAt: Date.now() } as any);
}

function getBestStream(streams: any[]): string {
  if (!streams || streams.length === 0) return '';
  const sorted = [...streams].sort((a, b) => {
    const aIndex = QUALITY_PRIORITY.indexOf(a.quality);
    const bIndex = QUALITY_PRIORITY.indexOf(b.quality);
    const aScore = aIndex === -1 ? 999 : aIndex;
    const bScore = bIndex === -1 ? 999 : bIndex;
    return aScore - bScore;
  });
  console.log(`[5] Selected best stream: ${sorted[0].quality} (${sorted[0].codec})`);
  return sorted[0].stream_url;
}

// Fetch fresh proxies from ProxyScrape API
async function getFreshProxies(): Promise<string[]> {
  try {
    const res = await axios.get(
      'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text&protocol=http&timeout=5000&anonymity=all',
      { timeout: 5000 }
    );
    // Filter only HTTP proxies and return array
    return res.data.split('\n').filter((p: string) => p.trim().startsWith('http://')).slice(0, 10);
  } catch (e) {
    console.warn('Failed to fetch proxy list');
    return [];
  }
}

async function requestWithProxy(url: string, method: string, proxyUrl: string, data?: any) {
  const agent = new HttpsProxyAgent(proxyUrl);
  const config: any = {
    httpsAgent: agent,
    httpAgent: agent,
    timeout: 10000, // 10s timeout for proxy
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };

  if (method === 'POST') {
    config.data = data;
    config.headers['Content-Type'] = 'application/json';
    return await axios.post(url, data, config);
  } else {
    return await axios.get(url, config);
  }
}

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  console.log(`\n========== SHOPEE PROXY EXTRACTOR ==========`);
  console.log(`[1] Original URL: ${url}`);

  // Check cache first
  const cached = getCachedVideo(url);
  if (cached) {
    console.log(`[1b] Returning cached result!`);
    return cached;
  }

  // Try Direct connection first
  try {
    console.log(`[2] Attempting direct connection...`);
    const result = await executeExtraction(url, null);
    return result;
  } catch (e: any) {
    if (e.response?.status !== 429) {
      throw e; // If it's a 400 or 500 error, proxies won't help, throw immediately
    }
    console.log(`[3] Direct connection rate limited (429). Rotating IPs...`);
  }

  // If direct failed with 429, try proxies
  const proxies = await getFreshProxies();
  if (proxies.length === 0) {
    throw new Error('Daily extraction limit reached. Unable to fetch fresh proxy IPs at this time.');
  }

  console.log(`[4] Fetched ${proxies.length} fresh proxies. Testing them...`);
  
  let lastError: any;
  for (let i = 0; i < proxies.length; i++) {
    const proxy = proxies[i];
    console.log(`[4.${i+1}] Trying proxy: ${proxy}`);
    
    try {
      const result = await executeExtraction(url, proxy);
      console.log(`[4.${i+1}] Proxy SUCCESS!`);
      return result;
    } catch (err: any) {
      lastError = err;
      if (err.response?.status === 429) {
        console.log(`[4.${i+1}] Proxy also rate limited. Trying next...`);
        continue; // Try next proxy
      }
      console.log(`[4.${i+1}] Proxy connection failed (Timeout/Error). Trying next...`);
    }
  }

  throw new Error('Failed to extract video. All available IPs have been rate limited or the service is down.');
}

async function executeExtraction(shopeeUrl: string, proxyUrl: string | null): Promise<VideoResult> {
  console.log(`[2] Fetching session cookies and CSRF token...`);
  
  const homeConfig: any = {
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
  };
  if (proxyUrl) {
    homeConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
    homeConfig.httpAgent = new HttpsProxyAgent(proxyUrl);
  }

  const homeRes = await axios.get('https://shopeenowatermark.com/', homeConfig);

  const cookies = homeRes.headers['set-cookie'] || [];
  const cookieString = cookies.map(c => c.split(';')[0]).join('; ');

  const html = homeRes.data;
  const tokenMatch = html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
  const csrfToken = tokenMatch ? tokenMatch[1] : '';

  if (!csrfToken) throw new Error('Failed to extract CSRF token');

  console.log(`[4] Sending URL to extraction API...`);

  const apiConfig: any = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://shopeenowatermark.com',
      'Referer': 'https://shopeenowatermark.com/',
      'Cookie': cookieString,
      'X-CSRF-TOKEN': csrfToken,
      'X-Requested-With': 'XMLHttpRequest'
    }
  };
  if (proxyUrl) {
    apiConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
    apiConfig.httpAgent = new HttpsProxyAgent(proxyUrl);
  }

  const apiRes = await axios.post('https://shopeenowatermark.com/api/extract',
    { url: shopeeUrl },
    apiConfig
  );

  const data = apiRes.data;
  if (!data || !data.success) {
    if (data?.error?.includes('Daily guest limit reached')) {
      throw { response: { status: 429 } }; // Special error to trigger proxy rotation
    }
    throw new Error(data?.message || 'API returned failure response');
  }

  let videoUrl = getBestStream(data.streams_array);
  if (!videoUrl && data.preview) videoUrl = data.preview;
  if (!videoUrl) throw new Error('No video streams found');

  console.log(`[6] SUCCESS: Extracted highest quality unwatermarked URL!`);

  const result: VideoResult = {
    videoUrl,
    title: data.title || 'Shopee Video',
    cover: data.thumbnail || '',
    author: data.username || 'Shopee Creator',
    desc: ''
  };

  cacheVideo(shopeeUrl, result);
  return result;
}

