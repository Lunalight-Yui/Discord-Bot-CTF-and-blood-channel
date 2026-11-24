// // blood-announcer.js - announce first/second/third blood + submission tracking

// const { EmbedBuilder } = require('discord.js')
// const { resolvePlatformClient } = require('../ctf-platform')

// const POLL_MS = Number(process.env.BLOOD_POLL_MS) || 30000
// const CATCHUP_MS = Number(process.env.BLOOD_CATCHUP_MS) || 1500

// const BLOOD = {
//   1: { title: 'FIRST BLOOD', emoji: '🩸', color: 0xed1c24 },
//   2: { title: 'SECOND BLOOD', emoji: '🥈', color: 0xc0c0c0 },
//   3: { title: 'THIRD BLOOD', emoji: '🥉', color: 0xcd7f32 },
// }

// const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// function ordinal(n) {
//   const s = ['th', 'st', 'nd', 'rd']
//   const v = n % 100
//   return n + (s[(v - 20) % 10] || s[v] || s[0])
// }

// function startBloodAnnouncer(client, { baseUrl, apiToken = null, channelId, platform = null }) {
//   const seen = new Set()   
//   const closed = new Set() 
//   let submissionChannelId = process.env.SUBMISSION_CHANNEL_ID || null

//   async function pollOnce() {
//     const client_adapter = await resolvePlatformClient({ baseUrl, apiToken, platform })
//     const frozen = (await client_adapter.getFreezeTime()) != null

//     const challs = await client_adapter.getChallenges()

//     for (const chall of challs) {
//       const solves = await client_adapter.getSolves(chall.id)
//       if (!solves.length && !closed.has(chall.id)) continue

//       // blood 1-3
//       let order = 0
//       for (const solve of solves) {
//         order += 1
//         if (order > 3) break

//         const key = `${chall.id}:${solve.account_id}`
//         if (seen.has(key)) continue
//         seen.add(key)

//         const who = frozen ? '{someone}' : solve.name
//         const what = frozen ? '{something}' : chall.name

//         try {
//           const ch = await client.channels.fetch(channelId).catch(() => null)
//           if (!ch) return

//           if (frozen) {
//             await ch.send(
//               `${BLOOD[order].emoji} {someone} has solved {something} for the ${ordinal(order)} place in top 3`,
//             )
//           } else {
//             const embed = new EmbedBuilder()
//               .setTitle(`${BLOOD[order].emoji} ${BLOOD[order].title}`)
//               .setColor(BLOOD[order].color)
//               .setDescription(
//                 `**${who}** has solved **${what}** for the ${ordinal(order)} place!`,
//               )
//               .setTimestamp(new Date())
//             await ch.send({ embeds: [embed] })
//           }
//           console.log(`[blood] ${order}: ${frozen ? '{someone}' : who} solved ${what}`)
//         } catch (err) {
//           console.error('[blood] announce failed:', err.message)
//         }
//       }

//       if (solves.length >= 3 && !closed.has(chall.id)) {
//         closed.add(chall.id)
//         const subId = process.env.SUBMISSION_CHANNEL_ID
//         if (subId) {
//           try {
//             const sub = await client.channels.fetch(subId).catch(() => null)
//             if (sub) {
//               const frozenNote = frozen ? ' *(freeze aktif, nama disembunyikan)*' : ''
//               await sub.send(
//                 `📋 **${frozen ? '{something}' : chall.name}** sudah punya 3 solver${frozenNote}. ` +
//                 `Total ${solves.length} solve.\n` +
//                 solves.map((s, i) => {
//                   const who = frozen ? '{someone}' : s.name
//                   return `  ${i + 1}. ${who} — <t:${Math.floor(new Date(s.date).getTime() / 1000)}:R>`
//                 }).join('\n') +
//                 `\n\n*(tambahkan validasi submission di sini bila perlu)*`,
//               )
//             }
//           } catch (err) {
//             console.error('[submission] failed to send:', err.message)
//           }
//         }
//       }

//       await sleep(CATCHUP_MS)
//     }
//   }

//   console.log(`[blood] announcer start, target ${baseUrl}, poll tiap ${POLL_MS / 1000}s`)
//   pollOnce().catch(err => console.error('[blood] poll error:', err.message))
//   return setInterval(
//     () => pollOnce().catch(err => console.error('[blood] poll error:', err.message)),
//     POLL_MS,
//   )
// }

// module.exports = { startBloodAnnouncer }
