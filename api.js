export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2023-06-01';
// Model IDs from https://platform.claude.com/docs/en/models/overview (checked 2026-11-24)
export const MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (fast, balanced)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (long tasks, coding)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2 (hardest reasoning)' },
];

/** Build the fetch request for either direct (BYOK) or proxy mode. */
export function buildRequest({ mode, apiKey, proxyUrl, model, system, messages, maxTokens }) {
  const body = { model, max_tokens: maxTokens, stream: true, messages };
  if (system && system.trim()) body.system = system.trim();
  if (mode === 'proxy') {
    if (!proxyUrl) throw new Error('Set the proxy URL in Settings.');
    return { url: proxyUrl, init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } };
  }
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings.');
  return {
    url: API_URL,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    },
  };
}

/** Parse an SSE byte stream; call onText for each text delta. Returns stop_reason if seen. */
export async function readStream(response, onText) {
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let stop = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data) continue;
      let ev;
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') onText(ev.delta.text);
      else if (ev.type === 'message_delta' && ev.delta?.stop_reason) stop = ev.delta.stop_reason;
      else if (ev.type === 'error') throw new Error(ev.error?.message || 'Stream error');
    }
  }
  return stop;
}

export async function explainHttpError(res) {
  let msg = '';
  try { const j = await res.json(); msg = j?.error?.message || ''; } catch { /* ignore */ }
  const hint = res.status === 401 ? ' (check your API key)' : res.status === 429 ? ' (rate limited, try again shortly)' : '';
  return `Error ${res.status}${hint}: ${msg}`;
}
