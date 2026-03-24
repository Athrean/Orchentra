export const mockStepData = {
  toolCalls: [{ toolName: 'get_workflow_logs', args: { owner: 'my-org', repo: 'api', runId: 123 } }],
  toolResults: [
    {
      toolName: 'get_workflow_logs',
      result: { jobName: 'Build', logs: 'TypeError: x is not a function', failedStep: 'Run tests' },
    },
  ],
}

export const mockGenerateTextResponse = {
  text: 'Based on the logs, the test failed due to a type error.',
  steps: [mockStepData],
}

export const mockBrief = {
  failureType: 'code_bug' as const,
  summary: 'TypeScript compilation failed due to type error',
  rootCause: 'TypeError in src/auth/login.ts — x is not a function',
  suggestedFix: 'Fix the function call on line 42 of src/auth/login.ts',
  confidence: 0.85,
  similarIncidentId: null,
}

export const mockIncident = {
  id: 'test-incident-1',
  repo: 'my-org/api',
  branch: 'main',
  commit: 'abc1234def5678',
  workflowName: 'CI / Build & Test',
  workflowRunId: 123,
  failedStep: null,
  status: 'investigating' as const,
  briefJson: null,
  confidence: null,
  rootCause: null,
  suggestedFix: null,
  slackChannel: '#test',
  slackMessageTs: '1234567890.123456',
  triggeredAt: new Date(),
  resolvedAt: null,
  mttrSeconds: null,
  createdAt: new Date(),
}
