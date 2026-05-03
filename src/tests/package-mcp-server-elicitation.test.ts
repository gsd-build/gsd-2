import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import {
  buildAskUserQuestionsElicitRequest,
  createMcpServer,
  formatAskUserQuestionsElicitResult,
} from '../../packages/mcp-server/src/server.js'

function createSessionManagerStub() {
  return {
    startSession: async () => {
      throw new Error('not implemented in test')
    },
    getSession: () => undefined,
    getResult: () => undefined,
    cancelSession: async () => {},
    resolveBlocker: async () => {},
  }
}

async function createConnectedClient(options?: {
  onElicit?: (params: unknown) => Promise<unknown>,
}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const { server } = await createMcpServer(createSessionManagerStub() as never)
  const client = new Client({
    name: 'test-client',
    version: '0.0.0',
  }, {
    capabilities: {
      elicitation: {},
    },
  })

  if (options?.onElicit) {
    client.setRequestHandler(ElicitRequestSchema, options.onElicit)
  }

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ])

  return {
    client,
    close: async () => {
      await client.close()
      await server.close()
    },
  }
}

test('package MCP server exposes ask_user_questions over listTools', async () => {
  const { client, close } = await createConnectedClient()

  try {
    const tools = await client.listTools()
    assert.ok(tools.tools.some(tool => tool.name === 'ask_user_questions'))
  } finally {
    await close()
  }
})

test('ask_user_questions returns the packaged answers JSON shape for form elicitation', async () => {
  const { client, close } = await createConnectedClient({
    onElicit: async (request) => {
      const elicitation = (request as {
        params?: {
          message: string,
          requestedSchema: { properties: Record<string, unknown>, required?: string[] },
        },
      }).params ?? request as {
        message: string,
        requestedSchema: { properties: Record<string, unknown>, required?: string[] },
      }
      assert.match(elicitation.message, /Please answer the following question/)
      assert.ok(elicitation.requestedSchema.properties.deployment)
      assert.ok(elicitation.requestedSchema.properties['deployment__note'])
      assert.ok(elicitation.requestedSchema.required?.includes('deployment'))

      return {
        action: 'accept',
        content: {
          deployment: 'None of the above',
          deployment__note: 'Need hybrid deployment.',
        },
      }
    },
  })

  try {
    const result = await client.callTool({
      name: 'ask_user_questions',
      arguments: {
        questions: [
          {
            id: 'deployment',
            header: 'Deploy',
            question: 'Where will this run?',
            options: [
              { label: 'Cloud', description: 'Managed hosting.' },
              { label: 'On-prem', description: 'Runs in customer infrastructure.' },
            ],
          },
        ],
      },
    })

    const text = result.content.find(item => item.type === 'text')
    assert.ok(text && 'text' in text)
    assert.equal(
      text.text,
      JSON.stringify({
        answers: {
          deployment: {
            answers: ['None of the above', 'user_note: Need hybrid deployment.'],
          },
        },
      }),
    )

    // Regression #5267: the gate hook reads `details.response.answers[id].selected`
    // off the MCP `tool_result` event. The bridge maps `structuredContent`
    // into `details`, so a missing `structuredContent` (or wrong inner shape)
    // makes the discussion gate stay pending forever and HARD-BLOCKs every
    // follow-up tool call.
    assert.deepEqual(
      (result as { structuredContent?: unknown }).structuredContent,
      {
        questions: [
          {
            id: 'deployment',
            header: 'Deploy',
            question: 'Where will this run?',
            options: [
              { label: 'Cloud', description: 'Managed hosting.' },
              { label: 'On-prem', description: 'Runs in customer infrastructure.' },
            ],
          },
        ],
        response: {
          endInterview: false,
          answers: {
            deployment: { selected: 'None of the above', notes: 'Need hybrid deployment.' },
          },
        },
        cancelled: false,
      },
    )
  } finally {
    await close()
  }
})

test('ask_user_questions structuredContent reflects an accepted single-select answer', async () => {
  const { client, close } = await createConnectedClient({
    onElicit: async () => ({
      action: 'accept',
      content: { confirm: 'Yes, you got it (Recommended)' },
    }),
  })

  try {
    const result = await client.callTool({
      name: 'ask_user_questions',
      arguments: {
        questions: [
          {
            id: 'confirm',
            header: 'Depth Check',
            question: 'Did I capture the scope correctly?',
            options: [
              { label: 'Yes, you got it (Recommended)', description: 'Proceed.' },
              { label: 'Not quite — let me clarify', description: 'Adjust.' },
            ],
          },
        ],
      },
    })

    assert.deepEqual(
      (result as { structuredContent?: unknown }).structuredContent,
      {
        questions: [
          {
            id: 'confirm',
            header: 'Depth Check',
            question: 'Did I capture the scope correctly?',
            options: [
              { label: 'Yes, you got it (Recommended)', description: 'Proceed.' },
              { label: 'Not quite — let me clarify', description: 'Adjust.' },
            ],
          },
        ],
        response: {
          endInterview: false,
          answers: {
            confirm: { selected: 'Yes, you got it (Recommended)', notes: '' },
          },
        },
        cancelled: false,
      },
    )
  } finally {
    await close()
  }
})

test('ask_user_questions structuredContent reflects an accepted multi-select answer', async () => {
  const { client, close } = await createConnectedClient({
    onElicit: async () => ({
      action: 'accept',
      content: { focus: ['Frontend', 'Backend'] },
    }),
  })

  try {
    const result = await client.callTool({
      name: 'ask_user_questions',
      arguments: {
        questions: [
          {
            id: 'focus',
            header: 'Focus',
            question: 'Which areas matter most?',
            allowMultiple: true,
            options: [
              { label: 'Frontend', description: 'UI work.' },
              { label: 'Backend', description: 'Server work.' },
              { label: 'Infra', description: 'Ops work.' },
            ],
          },
        ],
      },
    })

    const structured = (result as { structuredContent?: { response?: { answers?: Record<string, { selected: unknown; notes: unknown }> } } }).structuredContent
    assert.deepEqual(structured?.response?.answers?.focus, { selected: ['Frontend', 'Backend'], notes: '' })
    assert.equal((result as { structuredContent?: { cancelled?: unknown } }).structuredContent?.cancelled, false)
  } finally {
    await close()
  }
})

test('ask_user_questions returns an error result for invalid question payloads', async () => {
  const { client, close } = await createConnectedClient()

  try {
    const result = await client.callTool({
      name: 'ask_user_questions',
      arguments: {
        questions: [
          {
            id: 'broken',
            header: 'Broken',
            question: 'This payload is invalid',
            options: [],
          },
        ],
      },
    })

    const text = result.content.find(item => item.type === 'text')
    assert.ok(text && 'text' in text)
    assert.equal(result.isError, true)
    assert.match(text.text, /requires non-empty options/i)
  } finally {
    await close()
  }
})

test('ask_user_questions returns the cancellation message when elicitation is declined', async () => {
  const { client, close } = await createConnectedClient({
    onElicit: async () => ({
      action: 'decline',
    }),
  })

  try {
    const result = await client.callTool({
      name: 'ask_user_questions',
      arguments: {
        questions: [
          {
            id: 'continue',
            header: 'Continue',
            question: 'Continue?',
            options: [
              { label: 'Yes', description: 'Proceed.' },
              { label: 'No', description: 'Stop here.' },
            ],
          },
        ],
      },
    })

    const text = result.content.find(item => item.type === 'text')
    assert.ok(text && 'text' in text)
    assert.equal(text.text, 'ask_user_questions was cancelled before receiving a response')

    // Regression #5267: the cancel/decline path must also surface a
    // structuredContent payload so the gate hook routes the cancel branch
    // (response: null, cancelled: true) instead of falling into the
    // "missing details → HARD BLOCK with no recovery" path.
    assert.deepEqual(
      (result as { structuredContent?: unknown }).structuredContent,
      {
        questions: [
          {
            id: 'continue',
            header: 'Continue',
            question: 'Continue?',
            options: [
              { label: 'Yes', description: 'Proceed.' },
              { label: 'No', description: 'Stop here.' },
            ],
          },
        ],
        response: null,
        cancelled: true,
      },
    )
  } finally {
    await close()
  }
})

test('buildAskUserQuestionsRoundResult normalizes elicitation content into the gate-hook shape', async () => {
  const mod = await import('../../packages/mcp-server/src/server.js') as {
    buildAskUserQuestionsRoundResult: (questions: unknown[], result: { action: string; content?: Record<string, unknown> }) => { answers: Record<string, { selected: string | string[]; notes: string }> },
  }
  const buildAskUserQuestionsRoundResult = mod.buildAskUserQuestionsRoundResult
  assert.equal(typeof buildAskUserQuestionsRoundResult, 'function', 'Helper buildAskUserQuestionsRoundResult must be exported from packages/mcp-server (regression #5267)')

  const questions = [
    { id: 'confirm', header: 'Confirm', question: 'Proceed?', options: [
      { label: 'Yes', description: 'Go.' },
      { label: 'No', description: 'Stop.' },
    ] },
    { id: 'focus', header: 'Focus', question: 'Which area?', allowMultiple: true, options: [
      { label: 'Frontend', description: 'UI work.' },
      { label: 'Backend', description: 'Server work.' },
    ] },
  ]

  const accepted = buildAskUserQuestionsRoundResult(questions, {
    action: 'accept',
    content: {
      confirm: 'Yes',
      focus: ['Frontend', 'Backend'],
    },
  })
  assert.deepEqual(accepted, {
    endInterview: false,
    answers: {
      confirm: { selected: 'Yes', notes: '' },
      focus: { selected: ['Frontend', 'Backend'], notes: '' },
    },
  })

  const noteCarrying = buildAskUserQuestionsRoundResult([questions[0]], {
    action: 'accept',
    content: {
      confirm: 'None of the above',
      confirm__note: 'Want a hybrid path.',
    },
  })
  assert.deepEqual(noteCarrying.answers.confirm, { selected: 'None of the above', notes: 'Want a hybrid path.' })
})

test('helper formatting stays aligned with the tool contract', () => {
  const questions = [
    {
      id: 'focus_areas',
      header: 'Focus',
      question: 'Which areas matter most?',
      allowMultiple: true,
      options: [
        { label: 'Frontend', description: 'Prioritize the UI.' },
        { label: 'Backend', description: 'Prioritize server logic.' },
      ],
    },
  ]

  const request = buildAskUserQuestionsElicitRequest(questions)
  assert.equal(request.mode, 'form')
  assert.ok(request.requestedSchema.properties.focus_areas)
  assert.ok(!request.requestedSchema.properties['focus_areas__note'])

  const formatted = formatAskUserQuestionsElicitResult(questions, {
    action: 'accept',
    content: {
      focus_areas: ['Frontend', 'Backend'],
    },
  })

  assert.equal(
    formatted,
    JSON.stringify({
      answers: {
        focus_areas: {
          answers: ['Frontend', 'Backend'],
        },
      },
    }),
  )
})
