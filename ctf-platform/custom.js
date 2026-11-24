// custom.js -> customize your own ctfd

const CHALL_PATH = process.env.CUSTOM_CHALL_PATH || '/api/v1/challenges'
const SOLVE_PATH = process.env.CUSTOM_SOLVE_PATH || '/api/v1/challenges/{id}/solves'
const FREEZE_PATH = process.env.CUSTOM_FREEZE_PATH || '/api/v1/configs'

function createCustomAdapter(baseUrl, token = null) {
  const headers = { accept: 'application/json' }
  if (token) headers.Authorization = `Token ${token}`

  async function get(path) {
    const res = await fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return res.json()
  }

  function asList(body) {
    if (Array.isArray(body)) return body
    if (body?.success && Array.isArray(body.data)) return body.data
    if (body?.data && Array.isArray(body.data.solves)) return body.data.solves
    return []
  }

  return {
    name: () => 'custom',

    async getChallenges() {
      const list = asList(await get(CHALL_PATH))
      return list.map((c, i) => ({
        id: String(c.id ?? i),
        name: c.name ?? c.title ?? `chall-${i}`,
        category: c.category ?? 'uncategorized',
        points: c.points ?? c.value ?? 0,
      }))
    },

    async getSolves(challId) {
      const list = asList(await get(SOLVE_PATH.replace('{id}', challId)))
      return list.map((s, i) => ({
        id: `${challId}-${s.account_id ?? s.user_id ?? s.id ?? i}`,
        account_id: String(s.account_id ?? s.user_id ?? s.id ?? i),
        name: s.name ?? s.team_name ?? s.user_name ?? `unknown-${i}`,
        date: s.date ?? s.created_at ?? new Date(Date.now() - i).toISOString(),
      })).sort((a, b) => new Date(a.date) - new Date(b.date))
    },

    async getFreezeTime() {
      const cfg = await get(FREEZE_PATH)
      if (!cfg) return null
      const data = cfg.data ?? cfg
      const { start, end, freeze } = data ?? {}
      const now = Date.now()
      if (start && now < start * 1000) return now
      if (freeze && now >= freeze * 1000) return freeze * 1000
      return null
    },
  }
}

module.exports = { createCustomAdapter }
