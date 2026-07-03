import axios from 'axios';
import { createHash } from 'crypto';

interface VideoResult { videoUrl: string; title: string; cover: string; author: string; desc: string; }
interface Account { email: string; password: string; index: number; }
interface AccountState extends Account { cookies: Record<string, string>; quotaRemaining: number; lastUsed: number; }

const SITE = 'https://shopeenowatermark.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Quality priority: highest resolution first, H264 preferred
const QUALITY_PRIORITY = ['V1280P', 'V1080P', 'V1080P_H265', 'V720P', 'V720P_H265', 'V540P', 'V540P_H265', 'V480P', 'V360P'];

// Read accounts from environment variables
function loadAccounts(): Account[] {
  const accounts: Account[] = [];
  for (let i = 1; i <= 10; i++) {
    const email = process.env[`ACCOUNT_EMAIL_${i}`];
    const pass = process.env[`ACCOUNT_PASS_${i}`];
    if (email && pass) {
      accounts.push({ email, password: pass, index: i });
    }
  }
  return accounts;
}

// In-memory account state manager
const accountStates = new Map<number, AccountState>();
const cache = new Map<string, { result: VideoResult; expiresAt: number }>();
const CACHE_TTL = 30 * 60 * 1000;

function getBestStream(streams: any[]): string {
  if (!streams || streams.length === 0) return '';
  const sorted = [...streams].sort((a, b) => {
    const aIdx = QUALITY_PRIORITY.indexOf(a.quality);
    const bIdx = QUALITY_PRIORITY.indexOf(b.quality);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });
  return sorted[0]?.stream_url || '';
}

function urlHash(url: string): string {
  return createHash('md5').update(url).digest('hex');
}

async function getCachedVideo(shopeeUrl: string): Promise<VideoResult | null> {
  const key = urlHash(shopeeUrl);
  const item = cache.get(key);
  if (item && Date.now() < item.expiresAt) {
    console.log(`[cache] HIT for ${shopeeUrl.substring(0, 60)}...`);
    return item.result;
  }
  return null;
}

function setCachedVideo(shopeeUrl: string, result: VideoResult) {
  const key = urlHash(shopeeUrl);
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL });
}

async function getCsrfToken(session: any): Promise<string> {
  const res = await axios.get(`${SITE}/`, { headers: { 'User-Agent': UA }, ...session.getDefaults() });
  const match = res.data.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
  return match ? match[1] : '';
}

async function loginAccount(account: Account): Promise<AccountState | null> {
  try {
    // Step 1: Get CSRF for login page
    const loginPageRes = await axios.get(`${SITE}/login`, { headers: { 'User-Agent': UA } });
    const loginCookies = loginPageRes.headers['set-cookie'] || [];
    const cookieObj: Record<string, string> = {};
    loginCookies.forEach((c: string) => {
      const parts = c.split(';')[0].split('=');
      if (parts.length === 2) cookieObj[parts[0].trim()] = parts[1].trim();
    });

    const loginCsrf = loginPageRes.data.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
    if (!loginCsrf) return null;

    // Step 2: Login
    const loginRes = await axios.post(`${SITE}/login`,
      new URLSearchParams({
        _token: loginCsrf[1],
        email: account.email,
        password: account.password
      }).toString(),
      {
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${SITE}/login`,
          'Cookie': loginCookies.join('; ')
        },
        maxRedirects: 5,
        timeout: 10000
      }
    );

    // Collect session cookies from login response
    const sessionCookies = loginRes.headers['set-cookie'] || loginCookies;
    const sessionCookieObj: Record<string, string> = {};
    sessionCookies.forEach((c: string) => {
      const parts = c.split(';')[0].split('=');
      if (parts.length === 2) sessionCookieObj[parts[0].trim()] = parts[1].trim();
    });

    // Step 3: Verify login by getting CSRF from home page
    const homeRes = await axios.get(`${SITE}/`, {
      headers: { 'User-Agent': UA, 'Cookie': sessionCookies.join('; ') }
    });
    const homeCsrf = homeRes.cookies['XSRF-TOKEN'] || '';

    if (!homeCsrf) {
      console.warn(`[auth] Failed to verify session for ${account.email}`);
      return null;
    }

    console.log(`[auth] Logged in successfully: ${account.email}`);
    return {
      ...account,
      cookies: sessionCookieObj,
      quotaRemaining: 10,
      lastUsed: Date.now()
    };
  } catch (e: any) {
    console.error(`[auth] Login failed for ${account.email}: ${e.message}`);
    return null;
  }
}

async function extractVideoWithAccount(state: AccountState, shopeeUrl: string): Promise<VideoResult> {
  // Get fresh CSRF token
  const csrfRes = await axios.get(`${SITE}/`, {
    headers: { 'User-Agent': UA, 'Cookie': Object.entries(state.cookies).map(([k, v]) => `${k}=${v}`).join('; ') }
  });
  const csrfToken = csrfRes.cookies['XSRF-TOKEN'] || '';

  const cookieHeader = Object.entries(csrfRes.cookies).map(([k, v]) => `${k}=${v}`).join('; ');

  // Call the extraction API
  const res = await axios.post(`${SITE}/api/extract`,
    { url: shopeeUrl },
    {
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': SITE,
        'Referer': `${SITE}/`,
        'Cookie': cookieHeader
      },
      timeout: 15000
    }
  );

  const data = res.data;

  // Check for quota exceeded
  if (data?.quota?.allowed === false || data?.error?.includes('Daily guest limit') || data?.error?.includes('limit reached')) {
    console.log(`[quota] Account ${state.email} exceeded daily limit!`);
    state.quotaRemaining = 0;
    throw new Error('QUOTA_EXCEEDED');
  }

  if (!data?.success) {
    throw new Error(data?.message || 'API returned failure');
  }

  let videoUrl = getBestStream(data.streams_array);
  if (!videoUrl && data.preview) videoUrl = data.preview;
  if (!videoUrl) throw new Error('No video streams found');

  console.log(`[success] Extracted video from account ${state.email}`);
  return {
    videoUrl,
    title: data.title || 'Shopee Video',
    cover: data.thumbnail || '',
    author: data.username || 'Shopee Creator',
    desc: ''
  };
}

export async function extractShopeeVideo(url: string): Promise<VideoResult> {
  console.log(`\n========== SHOPEE EXTRACTOR ==========`);
  console.log(`[1] URL: ${url}`);

  // Check cache first
  const cached = await getCachedVideo(url);
  if (cached) return cached;

  // Load accounts
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    throw new Error('No accounts configured. Set ACCOUNT_EMAIL_1 through ACCOUNT_PASS_5 in environment variables.');
  }

  console.log(`[2] Loaded ${accounts.length} accounts`);

  // Try each account in order
  for (const account of accounts) {
    // Check if this account is already exhausted
    const existingState = accountStates.get(account.index);
    if (existingState && existingState.quotaRemaining === 0) {
      console.log(`[skip] Account ${account.email} exhausted, skipping...`);
      continue;
    }

    let state = accountStates.get(account.index);

    // If no existing state or session might be stale (older than 5 minutes), re-login
    if (!state || Date.now() - state.lastUsed > 5 * 60 * 1000) {
      console.log(`[auth] Logging in as ${account.email}...`);
      state = await loginAccount(account);
      if (!state) {
        console.warn(`[auth] Login failed for ${account.email}, trying next account...`);
        continue;
      }
      accountStates.set(account.index, state);
    }

    try {
      console.log(`[extract] Using account: ${state.email}`);
      const result = await extractVideoWithAccount(state, url);
      state.quotaRemaining--;
      state.lastUsed = Date.now();
      setCachedVideo(url, result);
      return result;
    } catch (e: any) {
      if (e.message === 'QUOTA_EXCEEDED') {
        state.quotaRemaining = 0;
        state.lastUsed = Date.now();
        console.log(`[rotate] Quota hit for ${state.email}, rotating to next account...`);
        continue;
      }
      // For other errors, throw immediately
      console.error(`[error] Extraction failed: ${e.message}`);
      throw e;
    }
  }

  throw new Error('All accounts have exceeded their daily download limit. Please wait until midnight UTC for quota reset.');
}
