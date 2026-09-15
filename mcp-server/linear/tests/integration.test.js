import { describe, it, expect, afterEach } from 'vitest'
import { LinearClient } from '../linear-client.js'

const key = process.env.LINEAR_API_KEY
const describeLive = key ? describe : describe.skip

describeLive('LinearClient integration (requires live LINEAR_API_KEY)', () => {
  let createdId = null

  afterEach(async () => {
    if (createdId) {
      const client = new LinearClient()
      await client.setStatus(createdId, 'Canceled').catch(() => {})
      createdId = null
    }
  })

  it('runs a full issue lifecycle against the real workspace', async () => {
    const client = new LinearClient()
    const team = await client.getTeam()
    expect(team.key).toBe('THE')

    const created = await client.createIssue({
      title: `MCP integration test ${Date.now()}`,
      description: 'temporary test issue; auto-canceled after the run',
      teamId: team.id,
      stateName: 'Backlog',
    })
    createdId = created.identifier
    expect(created.identifier).toMatch(/^THE-\d+$/)
    expect(created.state).toBe('Backlog')

    const fetched = await client.getIssue(created.identifier)
    expect(fetched.title).toBe(created.title)

    const comment = await client.addComment(created.identifier, 'created by MCP integration test')
    expect(comment.issueIdentifier).toBe(created.identifier)

    let res = await client.setStatus(created.identifier, 'In Progress')
    expect(res.state).toBe('In Progress')

    const updated = await client.updateIssue({ id: created.identifier, title: fetched.title + ' (updated)', stateName: 'Done' })
    expect(updated.title.endsWith('(updated)')).toBe(true)
    expect(updated.state).toBe('Done')

    res = await client.setStatus(created.identifier, 'Canceled')
    expect(res.state).toBe('Canceled')
    createdId = null
  }, 30000)

  it('lists issues and projects', async () => {
    const client = new LinearClient()
    const team = await client.getTeam()
    const issues = await client.listIssues({ teamId: team.id, limit: 5 })
    expect(Array.isArray(issues)).toBe(true)
    for (const issue of issues) {
      expect(issue.identifier).toMatch(/^THE-/)
    }

    const projects = await client.listProjects()
    expect(projects.length).toBeGreaterThan(0)
    const first = projects[0]
    const byId = await client.getProject(first.id)
    expect(byId.id).toBe(first.id)
    const byName = await client.getProject(first.name)
    expect(byName.id).toBe(first.id)
  }, 30000)
})