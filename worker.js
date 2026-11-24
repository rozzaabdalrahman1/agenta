// Cloudflare Worker: forwards chat requests to Anthropic. The API key lives ONLY in the
// Worker secret ANTHROPIC_API_KEY. Set ALLOWED_ORIGIN (e.g. https://YOURNAME.github.io) so
// other websites cannot use your proxy.
const ALLOWED_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-2']);
const MAX_TOKENS_CAP = 8192;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed || origin !== allowed) return new Response('Forbidden origin', { status: 403 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
    if (!env.ANTHROPIC_API_KEY) return new Response('Server is missing ANTHROPIC_API_KEY', { status: 500, headers: cors });

    let body;
    try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400, headers: cors }); }
    if (!ALLOWED_MODELS.has(body.model) || !Array.isArray(body.messages)) return new Response('Bad request', { status: 400, headers: cors });
    const payload = {
      model: body.model,
      max_tokens: Math.min(Number(body.max_tokens) || 4096, MAX_TOKENS_CAP),
      stream: true,
      messages: body.messages,
      ...(typeof body.system === 'string' && body.system ? { system: body.system } : {}),
    };
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'content-type': upstream.headers.get('content-type') || 'text/event-stream', 'cache-control': 'no-store' },
    });
  },
};
