const API = 'https://api.linear.app/graphql'
const key = process.env.LINEAR_API_KEY
if (!key) {
  console.error('LINEAR_API_KEY env var required')
  process.exit(1)
}

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) {
    console.error(JSON.stringify(json.errors, null, 2))
    process.exit(1)
  }
  return json.data
}

async function team() {
  const data = await gql(`query { teams { nodes { id name key } } }`)
  const t = data.teams.nodes.find((x) => x.key === (process.env.LINEAR_TEAM_KEY || 'THE'))
  if (!t) {
    console.error('team not found; set LINEAR_TEAM_KEY')
    process.exit(1)
  }
  return t
}

async function states() {
  const data = await gql(`query { workflowStates { nodes { id name team { key } } } }`)
  return data.workflowStates.nodes.filter((s) => s.team.key === 'THE')
}

async function labels() {
  const data = await gql(`query { issueLabels(first: 50) { nodes { id name color } } }`)
  return data.issueLabels.nodes
}

const [cmd, ...args] = process.argv.slice(2)

if (cmd === 'list') {
  const t = await team()
  const data = await gql(
    `query($teamId: String!) { issues(filter: { team: { id: { eq: $teamId } } }, orderBy: createdAt, first: 50) { nodes { id identifier title state { name } labels { nodes { name } } } } }`,
    { teamId: t.id }
  )
  for (const i of data.issues.nodes) {
    const lbl = i.labels.nodes.map((l) => l.name).join(',')
    console.log(`${i.identifier} [${i.state.name}]${lbl ? ' {' + lbl + '}' : ''} ${i.title} (${i.id})`)
  }
} else if (cmd === 'create') {
  const title = args[0]
  const rest = args.slice(1)
  let desc = ''
  let labelName = null
  let stateName = 'Backlog'
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--desc') desc = rest[i + 1]
    if (rest[i] === '--label') labelName = rest[i + 1]
    if (rest[i] === '--state') stateName = rest[i + 1]
  }
  const t = await team()
  const allStates = await states()
  const st = allStates.find((s) => s.name.toLowerCase() === stateName.toLowerCase())
  if (!st) {
    console.error(`unknown state ${stateName}`)
    process.exit(1)
  }
  let labelId = null
  if (labelName) {
    const allLabels = await labels()
    const found = allLabels.find((l) => l.name.toLowerCase() === labelName.toLowerCase())
    if (found) labelId = found.id
    else {
      const created = await gql(
        `mutation($name: String!, $teamId: String!) { issueLabelCreate(input: { name: $name, teamId: $teamId }) { issueLabel { id } } }`,
        { name: labelName, teamId: t.id }
      )
      labelId = created.issueLabelCreate.issueLabel.id
    }
  }
  const data = await gql(
    `mutation($title: String!, $desc: String, $teamId: String!, $stateId: String!, $labelIds: [String!]) {
      issueCreate(input: { title: $title, description: $desc, teamId: $teamId, stateId: $stateId, labelIds: $labelIds }) {
        issue { id identifier title state { name } }
      }
    }`,
    { title, desc, teamId: t.id, stateId: st.id, labelIds: labelId ? [labelId] : [] }
  )
  console.log(JSON.stringify(data.issueCreate.issue, null, 2))
} else if (cmd === 'state') {
  const id = args[0]
  const stateName = args[1]
  const allStates = await states()
  const st = allStates.find((s) => s.name.toLowerCase() === stateName.toLowerCase())
  if (!st) {
    console.error(`unknown state ${stateName}`)
    process.exit(1)
  }
  const data = await gql(
    `mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { issue { id identifier state { name } } } }`,
    { id, stateId: st.id }
  )
  console.log(JSON.stringify(data.issueUpdate.issue, null, 2))
} else if (cmd === 'get') {
  const id = args[0]
  const data = await gql(
    `query($id: String!) { issue(id: $id) { id identifier title description state { name } labels { nodes { name } } } }`,
    { id }
  )
  console.log(JSON.stringify(data.issue, null, 2))
} else {
  console.log('usage: linear.mjs list | create <title> [--desc <d>] [--label <l>] [--state <s>] | state <id> <state> | get <id>')
  process.exit(1)
}