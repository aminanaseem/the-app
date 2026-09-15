#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { LinearClient, LinearError } from './linear-client.js'

if (!process.env.LINEAR_API_KEY) {
  console.error('LINEAR_API_KEY env var is required. Set it before starting the Linear MCP server.')
  process.exit(1)
}

const client = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY,
  teamKey: process.env.LINEAR_TEAM_KEY || 'THE',
})

const server = new McpServer({ name: 'the-app-linear', version: '1.0.0' })

const TEXT = (data) => ({ content: [{ type: 'text', text: data }] })
const OK = (data) => TEXT(JSON.stringify(data, null, 2))
const ERR = (err) => ({
  isError: true,
  content: [{ type: 'text', text: err instanceof LinearError ? err.message : `error: ${err.message ?? err}` }],
})
const wrap = (fn) => async (args) => {
  try {
    return OK(await fn(args))
  } catch (err) {
    return ERR(err)
  }
}

server.tool(
  'list_issues',
  'List Linear issues for the THE APP team. Optionally filter by workflow state name (Backlog, In Progress, In Review, Done) and/or label name.',
  {
    teamKey: z.string().optional().describe('Team key; defaults to LINEAR_TEAM_KEY or "THE"'),
    state: z.string().optional().describe('Only issues in this workflow state name, e.g. "In Review"'),
    label: z.string().optional().describe('Only issues with this label name'),
    limit: z.number().int().positive().optional().describe('Max results (default 50)'),
  },
  wrap(async ({ teamKey, state, label, limit }) => {
    const team = await client.getTeam(teamKey)
    const issues = await client.listIssues({ teamId: team.id, stateName: state, labelName: label, limit: limit ?? 50 })
    return issues
  })
)

server.tool(
  'get_issue',
  'Get a single Linear issue by identifier (e.g. THE-5) or Linear UUID.',
  { id: z.string().describe('Issue identifier (THE-5) or UUID') },
  wrap(async ({ id }) => client.getIssue(id))
)

server.tool(
  'create_issue',
  'Create a Linear issue in the THE APP team. State defaults to Backlog; labels are created if they do not exist.',
  {
    title: z.string().describe('Issue title'),
    description: z.string().optional().describe('Issue description'),
    teamKey: z.string().optional().describe('Team key; defaults to LINEAR_TEAM_KEY or "THE"'),
    stateName: z.string().optional().describe('Workflow state, e.g. Backlog (default), In Progress, In Review, Done'),
    labels: z.array(z.string()).optional().describe('Label names to apply, created if missing'),
  },
  wrap(async ({ title, description, teamKey, stateName, labels }) => {
    const team = await client.getTeam(teamKey)
    return client.createIssue({
      title,
      description,
      teamId: team.id,
      stateName: stateName ?? 'Backlog',
      labelNames: labels,
    })
  })
)

server.tool(
  'update_issue',
  'Update fields of an existing Linear issue (title, description, state, labels).',
  {
    id: z.string().describe('Issue identifier (THE-5) or UUID'),
    title: z.string().optional(),
    description: z.string().optional(),
    stateName: z.string().optional().describe('Workflow state name'),
    labels: z.array(z.string()).optional().describe('Replaces all labels with these names'),
  },
  wrap(async ({ id, title, description, stateName, labels }) =>
    client.updateIssue({ id, title, description, stateName, labelNames: labels })
  )
)

server.tool(
  'update_issue_status',
  'Move a Linear issue to a workflow state: Backlog, In Progress, In Review, or Done.',
  {
    id: z.string().describe('Issue identifier (THE-5) or UUID'),
    status: z.string().describe('Target workflow state name, e.g. In Progress, Done'),
  },
  wrap(async ({ id, status }) => client.setStatus(id, status))
)

server.tool(
  'add_issue_comment',
  'Add a comment to a Linear issue.',
  {
    id: z.string().describe('Issue identifier (THE-5) or UUID'),
    body: z.string().describe('Comment text'),
  },
  wrap(async ({ id, body }) => client.addComment(id, body))
)

server.tool(
  'list_projects',
  'List Linear projects for the org.',
  wrap(async () => client.listProjects())
)

server.tool(
  'get_project',
  'Get a single Linear project by UUID or exact name.',
  { id: z.string().describe('Project UUID or name') },
  wrap(async ({ id }) => client.getProject(id))
)

const transport = new StdioServerTransport()
await server.connect(transport)