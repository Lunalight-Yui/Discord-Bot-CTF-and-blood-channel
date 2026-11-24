// rctf.js - documentation: rCTF (https://github.com/otter-sec/rctf)

function createRCTFAdapter(baseUrl, token = null) {
  const headers = { accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  async function get(path) {
    const res = await fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return res.json()
  }

  return {
    name: () => 'rctf',

    async getChallenges() {
      const body = await get('/api/v1/challs')
      if (!body || body.kind !== 'goodChallenges') return []
      return body.data.map(c => ({
        id: String(c.id),
        name: c.name,
        category: c.category || 'uncategorized',
        points: c.points ?? 0,
      }))
    },

    async getSolves(challId) {
      const body = await get(`/api/v1/challs/${challId}/solves?limit=20&offset=0`)
      if (!body || body.kind !== 'goodChallengeSolves') return []
      return body.data.solves.map((s, i) => ({
        id: `${challId}-${s.id}`,
        account_id: String(s.userId ?? s.id),
        name: s.userName ?? s.teamName ?? 'unknown',
        date: s.createdAt ? new Date(s.createdAt).toISOString() : new Date(Date.now() - i).toISOString(),
      })).sort((a, b) => new Date(a.date) - new Date(b.date))
    },

    async getFreezeTime() {
      const cfg = await get('/api/v1/integrations/client/config')
      if (!cfg || cfg.kind !== 'goodClientConfig') return null
      const d = cfg.data ?? {}
      const now = Date.now()
      if (d.startTime && now < d.startTime) return now
      if (d.freezeTime && now >= d.freezeTime) return d.freezeTime
      return null
    },
  }
}

module.exports = { createRCTFAdapter }
