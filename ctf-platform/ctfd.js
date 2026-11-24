// ctfd.js -> Documentation CTFd (https://ctfd.io)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function createCTFdAdapter(baseUrl, token = null) {
  const headers = { accept: 'application/json' }
  if (token) headers.Authorization = `Token ${token}`

  async function get(path) {
    const res = await fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return res.json()
  }

  return {
    name: () => 'ctfd',

    async getChallenges() {
      const body = await get('/api/v1/challenges')
      if (!body?.success) return []
      return body.data.map(c => ({
        id: String(c.id),
        name: c.name,
        category: c.category || 'uncategorized',
        points: c.value ?? 0,
      }))
    },

    async getSolves(challId) {
      const body = await get(`/api/v1/challenges/${challId}/solves`)
      if (!body?.success) return []
      const list = body.data.solves ?? body.data ?? []
      return list.map((s, i) => ({
        id: `${challId}-${s.account_id}`,
        account_id: String(s.account_id),
        name: s.name ?? s.user?.name ?? `team-${s.account_id}`,
        date: s.date ?? new Date(Date.now() - i).toISOString(),
      })).sort((a, b) => new Date(a.date) - new Date(b.date))
    },

    async getFreezeTime() {
      const cfg = await get('/api/v1/configs')
      if (!cfg?.success) return null
      const { start, end, freeze } = cfg.data ?? {}
      const now = Date.now()
      // not started yet: treat as "no one can solve yet"
      if (start && now < start * 1000) return now
      // freeze on
      if (freeze && now >= freeze * 1000) return freeze * 1000
      return null
    },
  }
}

module.exports = { createCTFdAdapter }
