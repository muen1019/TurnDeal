import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelGateway, buyerOutput } from '../src/negotiation/model.mjs';

const args = () => ({ role: 'buyer', input: { round: 1 }, schema: buyerOutput, instructions: 'Choose', signal: new AbortController().signal, audit: [] });
const response = payload => async () => ({ ok: true, json: async () => payload });
const success = { id: 'resp_unit', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"action":"negotiate","target_option_index":0}' }] }], usage: { total_tokens: 20 } };

test('gateway sends strict Responses JSON schema without storing keys in audit', async () => {
  const input = args();
  const gateway = new ModelGateway({ apiKey: 'secret-for-unit-only', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, 'Bearer secret-for-unit-only');
    const body = JSON.parse(init.body); assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true); assert.deepEqual(body.text.format.schema, buyerOutput);
    return { ok: true, json: async () => success };
  } });
  assert.equal((await gateway.decide(input)).target_option_index, 0);
  assert.equal(gateway.summary().calls, 1); assert.equal(gateway.summary().actual_tokens, 20);
  assert.ok(!JSON.stringify(input.audit).includes('secret-for-unit-only'));
});

test('no key and zero budgets make no HTTP request', async () => {
  for (const [config, message] of [[{}, /unconfigured/], [{ apiKey: 'x', maxCalls: 0 }, /call_budget/], [{ apiKey: 'x', maxTokens: 0 }, /token_budget/]]) {
    const gateway = new ModelGateway({ ...config, fetchImpl: () => assert.fail('should not dispatch') });
    await assert.rejects(gateway.decide(args()), message); assert.equal(gateway.calls, 0);
  }
});

test('refusals, truncated output, malformed JSON and HTTP failure never become a decision', async () => {
  for (const transport of [
    response({ ...success, status: 'incomplete' }),
    response({ ...success, output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }),
    response({ ...success, output: [{ type: 'message', content: [{ type: 'output_text', text: 'bad-json' }] }] }),
    async () => ({ ok: false, status: 429, json: () => assert.fail('do not persist error body') }),
  ]) {
    const input = args(); const gateway = new ModelGateway({ apiKey: 'x', fetchImpl: transport });
    await assert.rejects(gateway.decide(input)); assert.equal(gateway.calls, 1);
    assert.ok(gateway.reservedTokens > 0); assert.equal(input.audit[0].status, 'failed');
  }
});

test('parallel reservation cannot overspend the call limit and timeout retains reservation', async () => {
  let dispatched = 0;
  const gateway = new ModelGateway({ apiKey: 'x', maxCalls: 1, timeoutMs: 5, fetchImpl: async () => { dispatched++; return new Promise(() => {}); } });
  const answers = await Promise.allSettled([gateway.decide(args()), gateway.decide(args())]);
  assert.equal(dispatched, 1); assert.ok(answers.every(a => a.status === 'rejected')); assert.ok(gateway.reservedTokens > 0);
});

test('already-aborted work never calls the API', async () => {
  const input = args(); const controller = new AbortController(); controller.abort(); input.signal = controller.signal;
  await assert.rejects(new ModelGateway({ apiKey: 'x', fetchImpl: () => assert.fail('aborted') }).decide(input), { name: 'AbortError' });
});
