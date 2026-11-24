// transcript.js -> transcript .txt with OCR (image to text)

const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const { AttachmentBuilder } = require('discord.js')
const { ocrImage } = require('./ocr')

async function fetchAllMessages(channel) {
  const all = []
  let before
  let batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) })
  while (batch.size) {
    all.push(...Array.from(batch.values()))
    before = batch.last().id
    batch = await channel.messages.fetch({ limit: 100, before })
  }
  return all.reverse()
}

function download(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, { timeout: 15000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(download(res.headers.location))
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`status ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
  })
}

async function createTranscript(channel) {
  const messages = await fetchAllMessages(channel)
  const lines = []

  for (const m of messages) {
    const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 19)
    lines.push(`[${time}] ${m.author.tag}: ${m.content || ''}`)

    // image attachments
    if (m.attachments.size) {
      for (const a of m.attachments.values()) {
        if (!a.height) {
          lines.push(`    [file] ${a.name} (${a.size} bytes)`)
          continue
        }
        try {
          const buf = await download(a.url)

          // OCR: image contents become text, added to the transcript IN ORDER
          const ocr = await ocrImage(buf)
          if (ocr) {
            lines.push(`    [OCR from ${a.name}]`)
            lines.push(ocr)
          } else {
            lines.push(`    [image] ${a.name} (no readable text)`)
          }
        } catch (err) {
          lines.push(`    [image] ${a.name} -> failed to process (${err.message})`)
        }
      }
    }

    // embed images (bot / link preview)
    if (m.embeds.length && !m.content) {
      const e = m.embeds[0]
      const title = e.title ? ` [${e.title}]` : ''
      if (e.image?.url) {
        try {
          const buf = await download(e.image.url)
          const ocr = await ocrImage(buf)
          if (ocr) lines.push(`    [OCR embed] ${ocr}`)
          else lines.push(`    [embed]${title} (no readable text)`)
        } catch (err) {
          lines.push(`    [embed]${title} (failed to process)`)
        }
      } else {
        lines.push(`    [embed]${title}`)
      }
    }
  }

  const header =
    `Transcript of #${channel.name}\n` +
    `Messages: ${messages.length}\n` +
    `${'-'.repeat(40)}\n`

  return new AttachmentBuilder(
    Buffer.from(header + lines.join('\n'), 'utf8'),
    { name: `transcript-${channel.name}.txt` },
  )
}

module.exports = { createTranscript }
