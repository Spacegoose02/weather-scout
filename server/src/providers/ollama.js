// Ollama (self-hosted models) for the AI helper. Talks to Ollama's own
// /api/chat endpoint, and optionally to Ollama's hosted web search API
// (needs a free ollama.com key) so "Search the web" works with local models.
const SEARCH_URL = 'https://ollama.com/api/web_search';

export class OllamaError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class OllamaClient {
  constructor({ url, apiKey = '', timeoutMs = 180_000 }, fetchImpl = fetch) {
    this.url = url.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  // One non-streaming chat turn. `format` is a JSON schema for structured output.
  async chat({ model, system, messages, format }) {
    let res;
    try {
      res = await this.fetch(`${this.url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: 'system', content: system }, ...messages],
          ...(format ? { format } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new OllamaError(502, err.name === 'TimeoutError'
        ? 'Ollama took too long to answer. A smaller model may be faster.'
        : `Could not reach Ollama at ${this.url}. Is it running?`);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(body.error || `status ${res.status}`);
      if (res.status === 404 || /not found/i.test(msg)) {
        throw new OllamaError(503, `Ollama doesn't have the model "${model}" yet. Run "ollama pull ${model}" on the Ollama server.`);
      }
      if (/image|vision|multimodal/i.test(msg)) {
        throw new OllamaError(503, `The Ollama model "${model}" can't look at photos. Set OLLAMA_VISION_MODEL to a vision model such as gemma3 or qwen2.5vl.`);
      }
      throw new OllamaError(502, `Ollama could not answer (${msg.slice(0, 160)}).`);
    }
    return String(body.message?.content || '').trim();
  }

  get canSearch() {
    return !!this.apiKey;
  }

  async search(query, maxResults = 5) {
    const res = await this.fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query: query.slice(0, 300), max_results: maxResults }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new OllamaError(502, `web search responded ${res.status}`);
    const body = await res.json();
    return (body.results || []).filter((r) => r?.url).map((r) => ({ url: r.url, title: r.title || r.url, content: String(r.content || '') }));
  }
}

// Keep only results from the listed domains (and their subdomains).
export function onDomains(results, domains) {
  return results.filter((r) => {
    try {
      const host = new URL(r.url).hostname.toLowerCase();
      return domains.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  });
}
