import test from 'node:test'
import assert from 'node:assert/strict'
import { ensureFreeLaneShape, toPiContext, type HarnessGenerateOptions, type HarnessMessage, type PiMessage } from '../src/adapter/messages.ts'

function expectAssistant(message: PiMessage | undefined): Extract<PiMessage, { role: 'assistant' }> {
  assert.equal(message?.role, 'assistant')
  return message as Extract<PiMessage, { role: 'assistant' }>
}

function expectRole(message: PiMessage | undefined, role: PiMessage['role']): PiMessage {
  assert.equal(message?.role, role)
  return message as PiMessage
}

function options(overrides: Partial<HarnessGenerateOptions> = {}): HarnessGenerateOptions {
  return { provider: 'opencode2dsh', model: 'qwen-free', messages: [], ...overrides }
}

test('system messages become leading user text', () => {
  const context = toPiContext(
    options({
      system: 'be helpful',
      messages: [{ role: 'system', content: [{ type: 'text', text: 'be helpful' }] }],
    }),
  )
  assert.equal(context.systemPrompt, 'be helpful')
  assert.equal(context.messages.length, 1)
  assert.deepEqual(context.messages[0], { role: 'user', content: 'be helpful', timestamp: 0 })
})

test('tool results become toolResult messages with the name from the prior toolCall', () => {
  const messages: HarnessMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'run it' }] },
    {
      role: 'assistant',
      content: [{ type: 'tool-call', id: 'call_1', name: 'shell', arguments: '{"cmd":"ls"}' }],
    },
    {
      role: 'user',
      content: [
        { type: 'tool-result', toolCallId: 'call_1', content: [{ type: 'text', text: 'file.txt' }], isError: false },
      ],
    },
  ]
  const context = toPiContext(options({ messages }))
  assert.equal(context.messages.length, 3)
  const toolResult = expectRole(context.messages[2], 'toolResult') as Extract<PiMessage, { role: 'toolResult' }>
  assert.equal(toolResult.toolCallId, 'call_1')
  assert.equal(toolResult.toolName, 'shell')
  assert.equal(toolResult.isError, false)
  assert.deepEqual(toolResult.content, [{ type: 'text', text: 'file.txt' }])
})

test('a user turn with text and tool results emits both messages', () => {
  const messages: HarnessMessage[] = [
    {
      role: 'assistant',
      content: [{ type: 'tool-call', id: 'c9', name: 'read', arguments: '{}' }],
    },
    {
      role: 'user',
      content: [
        { type: 'tool-result', toolCallId: 'c9', content: [{ type: 'text', text: 'ok' }] },
        { type: 'text', text: 'now summarize' },
      ],
    },
  ]
  const context = toPiContext(options({ messages }))
  assert.equal(context.messages.length, 3)
  expectRole(context.messages[1], 'user')
  expectRole(context.messages[2], 'toolResult')
  expectRole(context.messages[0], 'assistant')
})

test('assistant history replays text, thinking and tool calls with parsed arguments', () => {
  const messages: HarnessMessage[] = [
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'thinking out loud' },
        { type: 'reasoning', text: 'internal scratch' },
        { type: 'tool-call', id: 't1', name: 'calc', arguments: '{"a":1}' },
      ],
      source: { kind: 'model', provider: 'opencode2dsh', model: 'qwen-free' },
    },
  ]
  const context = toPiContext(options({ messages }))
  const assistant = expectAssistant(context.messages[0])
  assert.deepEqual(assistant.content, [
    { type: 'text', text: 'thinking out loud' },
    { type: 'thinking', thinking: 'internal scratch' },
    { type: 'toolCall', id: 't1', name: 'calc', arguments: { a: 1 } },
  ])
  assert.equal(assistant.stopReason, 'toolUse')
  assert.equal(assistant.model, 'qwen-free')
})

test('arguments parsing tolerates junk', () => {
  const context = toPiContext(
    options({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'tool-call', id: 'a', name: 'x', arguments: '' },
            { type: 'tool-call', id: 'b', name: 'x', arguments: 'not json' },
          ],
        },
      ],
    }),
  )
  const assistant = expectAssistant(context.messages[0])
  assert.deepEqual(assistant.content[0], { type: 'toolCall', id: 'a', name: 'x', arguments: {} })
  assert.deepEqual(assistant.content[1], { type: 'toolCall', id: 'b', name: 'x', arguments: { raw: 'not json' } })
  assert.equal(assistant.stopReason, 'toolUse')
})

test('assistant images cannot be replayed', () => {
  assert.throws(
    () =>
      toPiContext(
        options({
          messages: [{ role: 'assistant', content: [{ type: 'image' as never, data: 'x' } as never] }],
        }),
      ),
    /image/,
  )
})

test('tools pass through and empty tool lists are omitted', () => {
  const withTools = toPiContext(options({ tools: [{ name: 'shell', description: 'run', parameters: { type: 'object' } }] }))
  assert.deepEqual(withTools.tools, [{ name: 'shell', description: 'run', parameters: { type: 'object' } }])
  const withoutTools = toPiContext(options())
  assert.equal(withoutTools.tools, undefined)
})

test('ensureFreeLaneShape injects the real read declaration into toolless chat bodies', () => {
  const payload = { model: 'm', stream: true, messages: [{ role: 'user', content: 'ping' }] }
  const next = ensureFreeLaneShape(payload) as Record<string, unknown>
  assert.notEqual(next, undefined)
  assert.deepEqual(next.messages, payload.messages, 'messages untouched')
  const tools = next.tools as Array<{ type: string; function: { name: string; parameters: { properties: Record<string, unknown>; required?: string[] } } }>
  assert.deepEqual(tools.map((t) => t.function.name), ['read'])
  assert.ok(Object.keys(tools[0]!.function.parameters.properties).length > 0, 'gate read carries a real schema')
  assert.deepEqual(tools[0]!.function.parameters.required, ['filePath'])
  assert.equal(next.tool_choice, 'none', 'injected-only declaration is call-disabled')
})

test('ensureFreeLaneShape appends only the missing read and keeps tool_choice', () => {
  const payload = {
    model: 'm',
    messages: [{ role: 'user', content: 'ping' }],
    tools: [{ type: 'function', function: { name: 'webfetch', description: 'x', parameters: {} } }],
    tool_choice: 'auto',
  }
  const next = ensureFreeLaneShape(payload) as Record<string, unknown>
  const tools = next.tools as Array<{ type: string; function: { name: string } }>
  assert.equal(tools.length, 2, 'existing tool kept, read appended')
  assert.deepEqual(tools.map((t) => t.function.name), ['webfetch', 'read'])
  assert.equal(next.tool_choice, 'auto', 'client choice preserved')
})

test('ensureFreeLaneShape replaces a schema-less read and never injects bash', () => {
  const stubbed = {
    model: 'm',
    messages: [{ role: 'user', content: 'ping' }],
    tools: [{ type: 'function', function: { name: 'read', description: 'x', parameters: { type: 'object', properties: {} } } }],
  }
  const next = ensureFreeLaneShape(stubbed) as Record<string, unknown>
  const tools = next.tools as Array<{ function: { name: string; parameters: { properties: Record<string, unknown> } } }>
  assert.deepEqual(tools.map((t) => t.function.name), ['read'])
  assert.ok(Object.keys(tools[0]!.function.parameters.properties).length > 0, 'stub replaced by the real schema')
  assert.equal(tools.some((t) => t.function.name === 'bash'), false, 'bash is never injected')
})

test('ensureFreeLaneShape leaves satisfying and non-chat payloads untouched', () => {
  const satisfying = {
    model: 'm',
    messages: [],
    tools: [
      { type: 'function', function: { name: 'bash', description: 'x', parameters: { type: 'object', properties: { command: { type: 'string' } } } } },
      { type: 'function', function: { name: 'read', description: 'x', parameters: { type: 'object', properties: { filePath: { type: 'string' } } } } },
    ],
  }
  assert.equal(ensureFreeLaneShape(satisfying), undefined)
  assert.equal(ensureFreeLaneShape({ tools: [] }), undefined, 'no messages = not a chat body')
  assert.equal(ensureFreeLaneShape(null), undefined)
  assert.equal(ensureFreeLaneShape('text'), undefined)
})
