// gzctf.js -> Documentation GZ::CTF (https://gzctf.gzti.me)

function createGZCTFAdapter(baseUrl, token = null) {
  const headers = { accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  async function get(path) {
    const res = await fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return res.json()
  }

  return {
    name: () => 'gzctf',

    async getChallenges() {
      const body = await get('/api/challenges')
      if (!Array.isArray(body)) return []
      return body.map(c => ({
        id: String(c.id),
        name: c.title ?? c.name ?? 'unnamed',
        category: c.category || 'uncategorized',
        points: c.score ?? 0,
      }))
    },

    async getSolves(challId) {
      const body = await get(`/api/challenges/${challId}/solves`)
      if (!Array.isArray(body)) return []
      return body.map((s, i) => ({
        id: `${challId}-${s.id ?? s.userId ?? i}`,
        account_id: String(s.userId ?? s.teamId ?? i),
        name: s.userName ?? s.teamName ?? `unknown-${i}`,
        date: s.createdAt ?? new Date(Date.now() - i).toISOString(),
      })).sort((a, b) => new Date(a.date) - new Date(b.date))
    },

    async getFreezeTime() {
      return null
    },
  }
}

module.exports = { createGZCTFAdapter }
