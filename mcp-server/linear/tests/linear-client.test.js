import { describe, it, expect } from 'vitest'
import { LinearClient, LinearError } from '../linear-client.js'

const KEY = 'lin_test_key'

function fakeFetch(...responses) {
  let calls = 0
  const fn = async (url, opts) => {
    const req = { url, method: opts.method, headers: opts.headers, body: JSON.parse(opts.body) }
    const res = responses[Math.min(calls, responses.length - 1)]
    calls++
    res._req = req
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      statusText: 'OK',
      json: async () => res.body,
    }
  }
  fn.requests = responses
  return fn
}

describe('LinearClient', () => {
  it('throws without an API key', () => {
    expect(() => new LinearClient({ apiKey: undefined })).toThrow(LinearError)
    expect(() => new LinearClient({ apiKey: undefined })).toThrow(/LINEAR_API_KEY/)
  })

  it('gets the team by key', async () => {
    const fetchImpl = fakeFetch({ body: { data: { teams: { nodes: [{ id: 't1', key: 'THE', name: 'THE APP' }] } } } })
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    const team = await c.getTeam()
    expect(team).toEqual({ id: 't1', key: 'THE', name: 'THE APP' })
    const req = fetchImpl.requests[0]._req
    expect(req.headers.Authorization).toBe(KEY)
    expect(req.body.query).toContain('teams')
  })

  it('throws if the team key is unknown', async () => {
    const fetchImpl = fakeFetch({ body: { data: { teams: { nodes: [] } } } })
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    await expect(c.getTeam()).rejects.toThrow(/not found/)
  })

  it('resolves a workflow state name to a state id', async () => {
    const fetchImpl = fakeFetch({
      body: {
        data: {
          workflowStates: {
            nodes: [
              { id: 's-backlog', name: 'Backlog', type: 'backlog', team: { key: 'THE' } },
              { id: 's-progress', name: 'In Progress', type: 'started', team: { key: 'THE' } },
              { id: 's-done', name: 'Done', type: 'completed', team: { key: 'THE' } },
            ],
          },
        },
      },
    })
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    expect(await c.resolveStateId('in progress', 't1')).toBe('s-progress')
    expect(await c.resolveStateId('DONE', 't1')).toBe('s-done')
  })

  it('throws for an unknown workflow state', async () => {
    const fetchImpl = fakeFetch({ body: { data: { workflowStates: { nodes: [{ id: 's1', name: 'Backlog', type: 'backlog', team: { key: 'THE' } }] } } } })
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    await expect(c.resolveStateId('Release', 't1')).rejects.toThrow(/Unknown state "Release"/)
  })

  it('lists issues with a team/state/label filter', async () => {
    const fetchImpl = fakeFetch({
      body: {
        data: {
          issues: {
            nodes: [
              {
                id: 'i1',
                identifier: 'THE-9',
                title: 'Wire up linear CLI',
                state: { name: 'Done' },
                labels: { nodes: [{ name: 'chore' }] },
              },
            ],
          },
        },
      },
    })
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    const issues = await c.listIssues({ teamId: 't1', stateName: 'Done', labelName: 'chore' })
    expect(issues).toEqual([{ id: 'i1', identifier: 'THE-9', title: 'Wire up linear CLI', state: 'Done', labels: ['chore'] }])
    const req = fetchImpl.requests[0]._req
    expect(req.body.query).toContain('team: { id: { eq: "t1" } }')
    expect(req.body.query).toContain('state: { name: { eq: "Done" } }')
    expect(req.body.query).toContain('labels: { some: { name: { eq: "chore" } } }')
    expect(req.body.variables.limit).toBe(50)
  })

  it('creates an issue and passes the resolved state + labels', async () => {
    const fetchImpl = fakeFetch(
      { body: { data: { workflowStates: { nodes: [{ id: 's-progress', name: 'In Progress', type: 'started', team: { key: 'THE' } }] } } } },
      { body: { data: { issueLabels: { nodes: [{ id: 'l1', name: 'insight', color: '#fff' }] } } } },
      {
        body: {
          data: {
            issueCreate: {
              issue: {
                id: 'i9',
                identifier: 'THE-17',
                title: 'Hello',
                description: 'd',
                url: 'https://linear.app/the-appamina/issue/THE-17',
                state: { name: 'In Progress' },
                labels: { nodes: [{ name: 'insight' }] },
                team: { key: 'THE', name: 'THE APP' },
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            },
          },
        },
      }
    )
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    const issue = await c.createIssue({ title: 'Hello', description: 'd', teamId: 't1', stateName: 'In Progress', labelNames: ['insight'] })
    expect(issue.identifier).toBe('THE-17')
    expect(issue.labels).toEqual(['insight'])
    const createReq = fetchImpl.requests[2]._req
    expect(createReq.body.variables.stateId).toBe('s-progress')
    expect(createReq.body.variables.labelIds).toEqual(['l1'])
    expect(createReq.body.variables.title).toBe('Hello')
  })

  it('creates a missing label before assigning it', async () => {
    const fetchImpl = fakeFetch(
      { body: { data: { workflowStates: { nodes: [{ id: 's-backlog', name: 'Backlog', type: 'backlog', team: { key: 'THE' } }] } } } },
      { body: { data: { issueLabels: { nodes: [] } } } },
      { body: { data: { issueLabelCreate: { issueLabel: { id: 'l-new' } } } } },
      {
        body: {
          data: {
            issueCreate: {
              issue: {
                id: 'i10', identifier: 'THE-18', title: 't', description: null, url: null,
                state: { name: 'Backlog' }, labels: { nodes: [{ name: 'newlabel' }] },
                team: { key: 'THE', name: 'THE APP' }, createdAt: 'x', updatedAt: 'x',
              },
            },
          },
        },
      }
    )
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    await c.createIssue({ title: 't', teamId: 't1', labelNames: ['newlabel'] })
    expect(fetchImpl.requests[2]._req.body.query).toContain('issueLabelCreate')
    const createReq = fetchImpl.requests[3]._req
    expect(createReq.body.query).toContain('issueCreate')
    expect(createReq.body.variables.labelIds).toEqual(['l-new'])
  })

  it('sets a status via issueUpdate', async () => {
    const fetchImpl = fakeFetch(
      { body: { data: { teams: { nodes: [{ id: 't1', key: 'THE', name: 'THE APP' }] } } } },
      { body: { data: { workflowStates: { nodes: [{ id: 's-done', name: 'Done', type: 'completed', team: { key: 'THE' } }] } } } },
      {
        body: {
          data: { issueUpdate: { issue: { id: 'i1', identifier: 'THE-5', state: { name: 'Done', type: 'completed' } } } },
        },
      }
    )
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    const res = await c.setStatus('THE-5', 'Done')
    expect(res).toEqual({ id: 'i1', identifier: 'THE-5', state: 'Done', stateType: 'completed' })
    const req = fetchImpl.requests[2]._req
    expect(req.body.variables.id).toBe('THE-5')
    expect(req.body.variables.stateId).toBe('s-done')
  })

  it('adds a comment', async () => {
    const fetchImpl = fakeFetch({
      body: {
        data: { commentCreate: { comment: { id: 'c1', issue: { identifier: 'THE-9' } } } },
      },
    })
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    const res = await c.addComment('THE-9', 'reviewed')
    expect(res).toEqual({ id: 'c1', issueIdentifier: 'THE-9' })
    const req = fetchImpl.requests[0]._req
    expect(req.body.variables).toEqual({ id: 'THE-9', body: 'reviewed' })
  })

  it('lists and fetches projects', async () => {
    const fetchImpl = fakeFetch(
      { body: { data: { projects: { nodes: [{ id: 'p1', name: 'THE APP', description: 'd', url: 'u' }] } } } },
      {
        body: {
          data: { project: { id: 'p1', name: 'THE APP', description: 'd', url: 'u' } },
        },
      }
    )
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    const all = await c.listProjects()
    expect(all).toEqual([{ id: 'p1', name: 'THE APP', description: 'd', url: 'u' }])
    const one = await c.getProject('p1')
    expect(one.name).toBe('THE APP')
  })

  it('resolves a project by name when id lookup fails', async () => {
    const fetchImpl = fakeFetch(
      { body: { errors: [{ message: 'Unknown project id' }] } },
      { body: { data: { projects: { nodes: [{ id: 'p1', name: 'THE APP', description: null, url: null }] } } } }
    )
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    const one = await c.getProject('the app')
    expect(one.id).toBe('p1')
  })

  it('throws a LinearError on a non-OK HTTP response', async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 401, body: {} })
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    await expect(c.getTeam()).rejects.toThrow(/HTTP 401/)
  })

  it('throws a LinearError carrying GraphQL errors', async () => {
    const fetchImpl = fakeFetch({ body: { errors: [{ message: 'Authentication required' }] } })
    const c = new LinearClient({ apiKey: KEY, fetchImpl })
    await expect(c.getTeam()).rejects.toThrow(/Authentication required/)
  })
})