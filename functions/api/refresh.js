const DOWNLOAD_URL = 'https://prodeboffice365-my.sharepoint.com/:x:/g/personal/valmir_ferreira_secti_ba_gov_br/IQDZbNB-DvGJTIGRveSkOzDZATYdKyDyClL0S6SsWABR4bw?download=1';

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

export async function onRequest(context) {
  console.log('[Refresh] Iniciando refresh agendado...');
  try {
    let url = DOWNLOAD_URL;
    let cookies = '';

    for (let attempt = 0; attempt < 4; attempt++) {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*',
      };
      if (cookies) headers.Cookie = cookies;

      const resp = await fetch(url, { headers, redirect: 'manual' });
      const setCookies = resp.headers.getSetCookie?.() || [];
      if (setCookies.length > 0) {
        cookies = setCookies.map(c => c.split(';')[0].trim()).join('; ');
      }

      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const location = resp.headers.get('location');
        if (location) {
          url = location.startsWith('http') ? location : `https://prodeboffice365-my.sharepoint.com${location}`;
          continue;
        }
      }

      const buffer = await resp.arrayBuffer();
      const data = new Uint8Array(buffer);

      if (resp.status === 200 && data.length >= 2 && data[0] === 0x50 && data[1] === 0x4B) {
        if (context.env?.SHAREPOINT_CACHE) {
          await context.env.SHAREPOINT_CACHE.put('conecta-excel', buffer, { metadata: { timestamp: Date.now() } });
        }
        console.log(`[Refresh] Excel salvo no KV (${buffer.byteLength} bytes)`);
        break;
      }

      if (resp.status === 200 && resp.headers.get('content-type')?.includes('text/html')) {
        const html = new TextDecoder().decode(data);
        const redirectUrl = extractRedirectUrl(html);
        if (redirectUrl) {
          url = redirectUrl;
          continue;
        }
      }
    }
  } catch (err) {
    console.error('[Refresh] Erro:', err.message);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
