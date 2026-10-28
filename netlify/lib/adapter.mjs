// Netlify's Lambda-compatible handler contract; keep the shared Node APIs intact.
const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

function requestUrl(event) {
  if (event.rawUrl) return event.rawUrl;
  const url = new URL(event.path || '/', 'https://daily.invalid');
  const rawQuery = event.rawQuery || event.rawQueryString;
  if (rawQuery) url.search = rawQuery;
  else {
    const query = event.multiValueQueryStringParameters || event.queryStringParameters || {};
    for (const [key, values] of Object.entries(query)) {
      for (const value of Array.isArray(values) ? values : [values]) {
        if (value != null) url.searchParams.append(key, value);
      }
    }
  }
  return url.href;
}

export function netlifyHandler(apiHandler) {
  return async function handler(event) {
    const method = event.httpMethod || 'GET';
    const headers = { ...securityHeaders };
    if (method !== 'GET' && method !== 'HEAD') {
      return { statusCode: 405, headers: { ...headers, allow: 'GET, HEAD' }, body: '' };
    }
    let body;
    const response = {
      statusCode: 200,
      setHeader(name, value) { headers[name.toLowerCase()] = String(value); },
      end(value) { body = value; },
    };
    try {
      await apiHandler({ method, url: requestUrl(event), headers: event.headers || {} }, response);
      const binary = Buffer.isBuffer(body) || body instanceof Uint8Array;
      return {
        statusCode: response.statusCode,
        headers,
        body: method === 'HEAD' || body == null ? '' : binary ? Buffer.from(body).toString('base64') : String(body),
        isBase64Encoded: method !== 'HEAD' && binary,
      };
    } catch {
      return {
        statusCode: 503,
        headers: { ...securityHeaders, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        body: method === 'HEAD' ? '' : JSON.stringify({ error: '内容暂时没有送达，请稍后重试。' }),
        isBase64Encoded: false,
      };
    }
  };
}
