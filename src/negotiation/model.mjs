import { objectSchema } from './contracts.mjs';

export const buyerOutput = objectSchema({
  action: { type: 'string', enum: ['negotiate', 'stop'] },
  target_option_index: { type: 'integer' },
});
export const sellerOutput = objectSchema({
  outcome: { type: 'string', enum: ['offered', 'refused'] },
  product_id: { type: ['string', 'null'] },
  total_price_twd: { type: ['integer', 'null'] },
  include_bundle: { type: 'boolean' },
  is_final: { type: 'boolean' },
  message: { type: 'string' },
});

export class LimitReached extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

// Reservations use a conservative byte bound for input tokens (including schemas)
// plus max_output_tokens. Failed/timed-out calls retain their reservation because
// the server may already have generated billable output. No automatic retries.
export class ModelGateway {
  constructor({ apiKey = '', model = 'gpt-4.1-mini-2025-04-14', fetchImpl = fetch,
    maxCalls = 50, maxTokens = 250000, maxOutputTokens = 1200, timeoutMs = 12000 } = {}) {
    Object.assign(this, { apiKey, model, fetchImpl, maxCalls, maxTokens, maxOutputTokens, timeoutMs });
    this.calls = 0;
    this.reservedTokens = 0;
    this.actualTokens = 0;
  }

  async decide({ role, input, schema, format, instructions, signal, audit, promptVersion = 'negotiation-1' }) {
    signal.throwIfAborted();
    if (!this.apiKey.trim()) throw new Error('model_unconfigured');
    const body = { model: this.model, store: false, instructions,
      input: [{ role: 'user', content: JSON.stringify(input) }],
      max_output_tokens: this.maxOutputTokens,
      text: { format: format ?? { type: 'json_schema', name: `${role}_decision`, strict: true, schema } } };
    const encoded = JSON.stringify(body);
    const reservation = Buffer.byteLength(encoded, 'utf8') + this.maxOutputTokens + 1024;
    if (this.calls >= this.maxCalls) throw new LimitReached('call_budget');
    if (this.reservedTokens + reservation > this.maxTokens) throw new LimitReached('token_budget');
    this.calls++;
    this.reservedTokens += reservation;
    const entry = { role, model: this.model, prompt_version: promptVersion, input, instructions,
      reserved_tokens: reservation, status: 'started' };
    audit.push(entry);
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    let timer;
    try {
      // Race also bounds faulty/injected transports which ignore AbortSignal.
      const work = (async () => {
        const response = await this.fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: encoded, signal: combined,
        });
        if (!response.ok) throw new Error(`model_http_${response.status}`);
        return response.json();
      })();
      const expired = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('model_timeout')); }, this.timeoutMs);
      });
      const response = await Promise.race([work, expired]);
      combined.throwIfAborted();
      const content = (response.output ?? []).filter(x => x.type === 'message').flatMap(x => x.content ?? []);
      if (response.status !== 'completed' || content.some(x => x.type === 'refusal')) throw new Error('model_incomplete_or_refused');
      const value = JSON.parse(content.filter(x => x.type === 'output_text').map(x => x.text).join(''));
      entry.status = 'completed';
      entry.output = value;
      entry.response_id = response.id ?? null;
      entry.usage = response.usage ?? null;
      this.actualTokens += response.usage?.total_tokens ?? 0;
      return value;
    } catch (error) {
      // Never retain headers, key, response error bodies, or arbitrary transport errors.
      entry.status = 'failed';
      entry.error = /^model_/.test(error.message) ? error.message : 'model_failed';
      throw error;
    } finally { clearTimeout(timer); }
  }

  summary() {
    return { calls: this.calls, reserved_tokens: this.reservedTokens, actual_tokens: this.actualTokens };
  }
}
