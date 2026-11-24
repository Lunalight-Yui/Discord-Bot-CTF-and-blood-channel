// ctf-platform/index.js -> registry adapter CTF platform

const adapters = {
  ctfd: () => require('./ctfd'),
  rctf: () => require('./rctf'),
  gzctf: () => require('./gzctf'),
  custom: () => require('./custom'),
}

const PLATFORM_IDS = Object.keys(adapters)

function createPlatformClient({ platform, baseUrl, apiToken = null }) {
  const make = adapters[platform]
  if (!make) throw new Error(`unknown platform: ${platform}. pick one: ${PLATFORM_IDS.join(', ')}`)
  return make(baseUrl, apiToken)
}

// ---- auto-detect ----

const DETECTORS = [
  {
    platform: 'ctfd',
    probe: async (baseUrl, token) => {
      try {
        const res = await fetch(`${baseUrl}/api/v1/challenges`, {
          headers: token ? { Authorization: `Token ${token}` } : {},
          signal: AbortSignal.timeout(8000),
        })
        const body = await res.json().catch(() => null)
        return body?.success === true && Array.isArray(body?.data)
      } catch { return false }
    },
  },
  {
    platform: 'rctf',
    probe: async (baseUrl, token) => {
      try {
        const res = await fetch(`${baseUrl}/api/v1/integrations/client/config`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(8000),
        })
        const body = await res.json().catch(() => null)
        return body?.kind === 'goodClientConfig'
      } catch { return false }
    },
  },
  {
    platform: 'gzctf',
    probe: async (baseUrl, token) => {
      try {
        const res = await fetch(`${baseUrl}/api/challenges`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(8000),
        })
        const body = await res.json().catch(() => null)
        return Array.isArray(body)
      } catch { return false }
    },
  },
]

// Try detecting this one...
async function detectPlatform(baseUrl, token = null) {
  for (const { platform, probe } of DETECTORS) {
    const ok = await probe(baseUrl, token)
    if (ok) return platform
  }
  return null
}

// Combine if the platform not set
async function resolvePlatformClient({ baseUrl, apiToken = null, platform = null }) {
  const chosen = platform || (await detectPlatform(baseUrl, apiToken))
  if (!chosen) {
    throw new Error(
      `could not detect the platform at ${baseUrl}. set one manually: ${PLATFORM_IDS.join(', ')}`,
    )
  }
  console.log(`[platform] terdeteksi: ${chosen}`)
  return createPlatformClient({ platform: chosen, baseUrl, apiToken })
}

module.exports = {
  PLATFORM_IDS,
  createPlatformClient,
  resolvePlatformClient,
  detectPlatform,
}
