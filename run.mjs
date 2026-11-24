import assert from 'node:assert/strict';
import { renderMarkdown, escapeHtml } from '../markdown.js';
import { buildRequest, readStream, MODELS } from '../api.js';
import worker from '../worker/worker.js';

// markdown: XSS safety + features
assert.ok(!renderMarkdown('<script>alert(1)</script>').includes('<script'));
assert.ok(!renderMarkdown('[x](javascript:alert(1))').includes('<a '));
assert.match(renderMarkdown('**hi** `c`'), /<strong>hi<\/strong> <code>c<\/code>/);
assert.match(renderMarkdown('```js\n<b>x</b>\n```'), /<pre><code>&lt;b&gt;x&lt;\/b&gt;<\/code><\/pre>/);
assert.match(renderMarkdown('- a\n- b'), /<ul><li>a<\/li><li>b<\/li><\/ul>/);
assert.match(renderMarkdown('# T'), /<h2>T<\/h2>/);
assert.equal(escapeHtml('<&>'), '&lt;&amp;&gt;');

// request building
const r = buildRequest({ mode: 'byok', apiKey: 'k', model: 'claude-sonnet-5-5', system: ' s ', messages: [{ role: 'user', content: 'x' }], maxTokens: 10 });
assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
assert.equal(r.init.headers['anthropic-version'], '2023-06-01');
assert.equal(JSON.parse(r.init.body).system, 's');
assert.throws(() => buildRequest({ mode: 'byok', apiKey: '', model: 'm', messages: [], maxTokens: 1 }));
const p = buildRequest({ mode: 'proxy', proxyUrl: 'https://p.example', apiKey: 'SECRET', model: 'm', messages: [], maxTokens: 1 });
assert.ok(!JSON.stringify(p).includes('SECRET'), 'proxy mode must not send the key');
assert.ok(MODELS.length >= 4);

// SSE parsing, split across chunks
const enc = new TextEncoder();
const sse = 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n';
const parts = [sse.slice(0, 50), sse.slice(50, 140), sse.slice(140)];
const res = new Response(new ReadableStream({ start(c) { parts.forEach((x) => c.enqueue(enc.encode(x))); c.close(); } }));
let got = ''; const stop = await readStream(res, (t) => (got += t));
assert.equal(got, 'Hello'); assert.equal(stop, 'end_turn');

// worker: origin lock, key injection, model allowlist, token cap
const env = { ALLOWED_ORIGIN: 'https://me.github.io', ANTHROPIC_API_KEY: 'sk-test' };
const mk = (o, b) => new Request('https://w.example', { method: 'POST', headers: { Origin: o, 'content-type': 'application/json' }, body: JSON.stringify(b) });
assert.equal((await worker.fetch(mk('https://evil.example', { model: 'claude-sonnet-5-5', messages: [] }), env)).status, 403);
assert.equal((await worker.fetch(mk('https://me.github.io', { model: 'gpt-x', messages: [] }), env)).status, 400);
let seen;
globalThis.fetch = async (u, init) => { seen = { u, init }; return new Response('data: {}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }); };
const ok = await worker.fetch(mk('https://me.github.io', { model: 'claude-sonnet-5-5', max_tokens: 999999, messages: [{ role: 'user', content: 'hi' }] }), env);
assert.equal(ok.status, 200);
assert.equal(ok.headers.get('access-control-allow-origin'), 'https://me.github.io');
assert.equal(seen.init.headers['x-api-key'], 'sk-test');
assert.equal(JSON.parse(seen.init.body).max_tokens, 8192);
console.log('all tests passed');
