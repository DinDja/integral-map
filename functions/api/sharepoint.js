const DOWNLOAD_URL = 'https://prodeboffice365-my.sharepoint.com/:x:/g/personal/valmir_ferreira_secti_ba_gov_br/IQDZbNB-DvGJTIGRveSkOzDZATYdKyDyClL0S6SsWABR4bw?download=1';
const KV_MAX_AGE = 90 * 60 * 1000;

function extractRedirectUrl(html) {
  const patterns = [
    /<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^;"]*;\s*url=([^"']+)["']/i,
    /window\.location\s*=\s*["']([^"']+)["']/i,
    /window\.location\.href\s*=\s*["']([^"']+)["']/i,
    /location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i,
    /document\.location\s*=\s*["']([^"']+)["']/i,
    /document\.location\.href\s*=\s*["']([^"']+)["']/i,
    /(https:\/\/[^"'\s<>]+sharepoint[^"'\s<>]*download[^"'\s<>]*)/i,
    /(https:\/\/[^"'\s<>]+sharepoint\.com[^"'\s<>]+)/i,
    /url=([^"'\s&<>]+)/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try { return decodeURIComponent(match[1]); } catch { return match[1]; }
    }
  }
  return null;
}

async function fetchExcel(url, cookies) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9',
  };
  if (cookies) headers.Cookie = cookies;

  const resp = await fetch(url, { headers, redirect: 'manual' });
  const rawData = new Uint8Array(await resp.arrayBuffer());
  const setCookies = resp.headers.getSetCookie?.() || [];
  const newCookies = setCookies.length > 0 ? setCookies.map(c => c.split(';')[0].trim()).join('; ') : cookies;
  const contentType = resp.headers.get('content-type') || '';

  return { status: resp.status, data: rawData, cookies: newCookies, contentType, location: resp.headers.get('location') };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const nocache = url.searchParams.get('nocache') === 'true';

  let staleFallback = null;

  if (!nocache && env?.SHAREPOINT_CACHE) {
    try {
      const cached = await env.SHAREPOINT_CACHE.getWithMetadata('conecta-excel', { type: 'arrayBuffer' });
      if (cached?.value && cached?.metadata?.timestamp) {
        const ageMs = Date.now() - cached.metadata.timestamp;
        if (ageMs < KV_MAX_AGE) {
          return new Response(cached.value, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'X-Content-Source': 'kv',
              'X-Cache-Age': String(Math.round(ageMs / 1000)),
              'X-Geracao': String(cached.metadata.timestamp),
            },
          });
        }
        staleFallback = { value: cached.value, timestamp: cached.metadata.timestamp, ageSec: Math.round(ageMs / 1000) };
      }
    } catch (e) { console.error('[CF] KV read error:', e.message); }
  }

  async function staleResponse(reason) {
    if (!staleFallback) return null;
    return new Response(staleFallback.value, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Source': 'kv-stale',
        'X-Cache-Age': String(staleFallback.ageSec),
        'X-Geracao': String(staleFallback.timestamp),
        'X-Fallback-Reason': reason,
      },
    });
  }

  try {
    let currentUrl = DOWNLOAD_URL;
    let cookies = '';
    let attempts = 0;

    while (attempts < 4) {
      attempts++;
      const result = await fetchExcel(currentUrl, cookies);
      cookies = result.cookies;

      if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
        currentUrl = result.location.startsWith('http') ? result.location : `https://prodeboffice365-my.sharepoint.com${result.location}`;
        continue;
      }

      if (result.status === 200) {
        const isExcel = result.data.length >= 2 && result.data[0] === 0x50 && result.data[1] === 0x4B;

        if (isExcel) {
          if (env?.SHAREPOINT_CACHE) {
            try {
              await env.SHAREPOINT_CACHE.put('conecta-excel', result.data.buffer, { metadata: { timestamp: Date.now() } });
            } catch (e) { console.error('[CF] KV save error:', e.message); }
          }
          return new Response(result.data, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'X-Content-Source': 'sharepoint-download',
              'Content-Length': String(result.data.length),
            },
          });
        }

        if (result.contentType.includes('text/html')) {
          const html = new TextDecoder().decode(result.data);
          const redirectUrl = extractRedirectUrl(html);
          if (redirectUrl) {
            currentUrl = redirectUrl;
            continue;
          }
          const stale = await staleResponse('html-no-redirect');
          if (stale) return stale;
          return new Response('SharePoint retornou HTML sem redirect', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
        }
      }

      const stale = await staleResponse('no-excel');
      if (stale) return stale;
    }

    const stale = await staleResponse('max-attempts');
    if (stale) return stale;
    return new Response('Falha ao baixar planilha', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch (error) {
    console.error('[CF] Erro:', error.message);
    const stale = await staleResponse('fatal');
    if (stale) return stale;
    return new Response('Erro no servidor', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
