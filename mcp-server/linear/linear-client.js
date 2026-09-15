const API = 'https://api.linear.app/graphql'

export class LinearError extends Error {
  constructor(message, queryName) {
    super(message)
    this.name = 'LinearError'
    this.queryName = queryName
  }
}

export class LinearClient {
  constructor({ apiKey = process.env.LINEAR_API_KEY, teamKey = process.env.LINEAR_TEAM_KEY || 'THE', fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey) throw new LinearError('LINEAR_API_KEY env var is required to talk to Linear')
    this.apiKey = apiKey
    this.teamKey = teamKey
    this.fetch = fetchImpl
  }

  async gql(query, variables = {}, queryName = 'query') {
    const res = await this.fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.apiKey },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) {
      let detail = ''
      try {
        const body = await res.json()
        detail = (body.errors || []).map((e) => e.message).join('; ')
      } catch {}
      throw new LinearError(`Linear API responded HTTP ${res.status} (${res.statusText})${detail ? `: ${detail}` : ''}`, queryName)
    }
    const json = await res.json()
    if (json.errors && json.errors.length) {
      throw new LinearError(json.errors.map((e) => e.message).join('; '), queryName)
    }
    return json.data
  }

  async getTeam(key = this.teamKey) {
    const data = await this.gql(
      `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id key name } } }`,
      { key },
      'teams'
    )
    const team = data.teams.nodes[0]
    if (!team) throw new LinearError(`Linear team "${key}" not found; set LINEAR_TEAM_KEY`)
    return team
  }

  async getStates(teamKey = this.teamKey) {
    const data = await this.gql(
      `query { workflowStates { nodes { id name type team { key } } } }`,
      {},
      'workflowStates'
    )
    return data.workflowStates.nodes.filter((s) => s.team.key === teamKey)
  }

  async resolveStateId(stateName, teamId, teamKey = this.teamKey) {
    const all = await this.getStates(teamKey)
    const st = all.find((s) => s.name.toLowerCase() === stateName.toLowerCase())
    if (!st) {
      const known = all.map((s) => s.name).join(', ')
      throw new LinearError(`Unknown state "${stateName}" for team ${teamKey}. Known states: ${known}`)
    }
    return st.id
  }

  async getLabels() {
    const data = await this.gql(
      `query { issueLabels(first: 100) { nodes { id name color } } }`,
      {},
      'issueLabels'
    )
    return data.issueLabels.nodes
  }

  async resolveLabelId(labelName, teamId) {
    const all = await this.getLabels()
    const found = all.find((l) => l.name.toLowerCase() === labelName.toLowerCase())
    if (found) return found.id
    const data = await this.gql(
      `mutation($name: String!, $teamId: String!) { issueLabelCreate(input: { name: $name, teamId: $teamId }) { issueLabel { id } } }`,
      { name: labelName, teamId },
      'issueLabelCreate'
    )
    return data.issueLabelCreate.issueLabel.id
  }

  async resolveLabelIds(labelNames, teamId) {
    if (!labelNames || labelNames.length === 0) return []
    const ids = []
    for (const name of labelNames) ids.push(await this.resolveLabelId(name, teamId))
    return ids
  }

  async listIssues({ teamId, stateName, labelName, limit = 50 } = {}) {
    if (!teamId) {
      const t = await this.getTeam()
      teamId = t.id
    }
    const filterParts = [`team: { id: { eq: ${JSON.stringify(teamId)} } }`]
    if (stateName) filterParts.push(`state: { name: { eq: ${JSON.stringify(stateName)} } }`)
    if (labelName) filterParts.push(`labels: { some: { name: { eq: ${JSON.stringify(labelName)} } } }`)
    const data = await this.gql(
      `query($limit: Int) { issues(filter: { ${filterParts.join(', ')} }, orderBy: createdAt, first: $limit) { nodes { id identifier title state { name } labels { nodes { name } } } } }`,
      { limit },
      'issues'
    )
    return data.issues.nodes.map((i) => ({
      id: i.id,
      identifier: i.identifier,
      title: i.title,
      state: i.state?.name ?? null,
      labels: i.labels.nodes.map((l) => l.name),
    }))
  }

  async getIssue(id) {
    const data = await this.gql(
      `query($id: String!) { issue(id: $id) { id identifier title description url state { name } labels { nodes { name } } team { key name } createdAt updatedAt } }`,
      { id },
      'issue'
    )
    if (!data.issue) throw new LinearError(`Linear issue "${id}" not found`)
    return mapIssue(data.issue)
  }

  async createIssue({ title, description, teamId, stateName = 'Backlog', labelNames }) {
    if (!title) throw new LinearError('title is required')
    if (!teamId) {
      const t = await this.getTeam()
      teamId = t.id
    }
    const stateId = await this.resolveStateId(stateName, teamId)
    const labelIds = await this.resolveLabelIds(labelNames || [], teamId)
    const data = await this.gql(
      `mutation($title: String!, $desc: String, $teamId: String!, $stateId: String!, $labelIds: [String!]) {
        issueCreate(input: { title: $title, description: $desc, teamId: $teamId, stateId: $stateId, labelIds: $labelIds }) {
          issue { id identifier title description url state { name } labels { nodes { name } } team { key name } createdAt updatedAt }
        }
      }`,
      { title, desc: description ?? undefined, teamId, stateId, labelIds },
      'issueCreate'
    )
    return mapIssue(data.issueCreate.issue)
  }

  async updateIssue({ id, title, description, stateName, labelNames }) {
    const input = {}
    if (title !== undefined) input.title = title
    if (description !== undefined) input.description = description
    if (stateName !== undefined) {
      const t = await this.getTeam()
      input.stateId = await this.resolveStateId(stateName, t.id)
    }
    if (labelNames !== undefined) {
      const t = await this.getTeam()
      input.labelIds = await this.resolveLabelIds(labelNames, t.id)
    }
    if (Object.keys(input).length === 0) {
      throw new LinearError('provide at least one field to update (title, description, stateName, labelNames)')
    }
    const data = await this.gql(
      `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { issue { id identifier title description url state { name } labels { nodes { name } } team { key name } createdAt updatedAt } } }`,
      { id, input },
      'issueUpdate'
    )
    if (!data.issueUpdate) throw new LinearError(`Linear issue "${id}" not found`)
    return mapIssue(data.issueUpdate.issue)
  }

  async setStatus(id, stateName) {
    const t = await this.getTeam()
    const stateId = await this.resolveStateId(stateName, t.id)
    const data = await this.gql(
      `mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { issue { id identifier state { name type } } } }`,
      { id, stateId },
      'issueUpdate'
    )
    if (!data.issueUpdate) throw new LinearError(`Linear issue "${id}" not found`)
    const issue = data.issueUpdate.issue
    return { id: issue.id, identifier: issue.identifier, state: issue.state.name, stateType: issue.state.type }
  }

  async addComment(id, body) {
    if (!body) throw new LinearError('body is required')
    const data = await this.gql(
      `mutation($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { comment { id issue { identifier } } } }`,
      { id, body },
      'commentCreate'
    )
    if (!data.commentCreate) throw new LinearError(`Linear issue "${id}" not found`)
    return { id: data.commentCreate.comment.id, issueIdentifier: data.commentCreate.comment.issue.identifier }
  }

  async listProjects() {
    const data = await this.gql(
      `query { projects(first: 100) { nodes { id name description url } } }`,
      {},
      'projects'
    )
    return data.projects.nodes.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      url: p.url ?? null,
    }))
  }

  async getProject(idOrName) {
    try {
      const data = await this.gql(
        `query($id: String!) { project(id: $id) { id name description url } }`,
        { id: idOrName },
        'project'
      )
      if (data.project) return { ...data.project, description: data.project.description ?? null, url: data.project.url ?? null }
    } catch {
      // fall through to name matching below
    }
    const projects = await this.listProjects()
    const needle = idOrName.toLowerCase()
    const found = projects.find((p) => p.name?.toLowerCase() === needle)
    if (!found) throw new LinearError(`Linear project "${idOrName}" not found by id or name`)
    return found
  }
}

function mapIssue(i) {
  return {
    id: i.id,
    identifier: i.identifier,
    title: i.title,
    description: i.description ?? null,
    url: i.url ?? null,
    state: i.state?.name ?? null,
    labels: i.labels.nodes.map((l) => l.name),
    team: { key: i.team.key, name: i.team.name },
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  }
}