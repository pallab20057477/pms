const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const { v4: uuidv4 } = require('uuid')

const app = express()
app.use(cors())
app.use(bodyParser.json())

// In-memory store (dev only)
let channelConfig = null

app.get('/api/integrations/channel-config', (req, res) => {
  res.json({ ok: true, config: channelConfig })
})

app.post('/api/integrations/channel-config', (req, res) => {
  const payload = req.body || {}
  channelConfig = { ...channelConfig, ...payload, updatedAt: new Date().toISOString() }
  res.json({ ok: true, config: channelConfig })
})

// OAuth stub: returns a mock redirect URL and stores a pending state
app.post('/api/integrations/oauth/start', (req, res) => {
  const state = uuidv4()
  // in production you'd redirect to booking.com's OAuth URL
  const redirectUrl = `https://example.com/oauth/authorize?state=${state}`
  // store minimal pending state
  channelConfig = { ...(channelConfig || {}), oauthState: state, oauthPendingAt: new Date().toISOString() }
  res.json({ ok: true, redirectUrl, state })
})

// OAuth callback stub: exchange code for token
app.post('/api/integrations/oauth/callback', (req, res) => {
  const { state, code } = req.body || {}
  if (!state || !code) return res.status(400).json({ ok: false, error: 'missing state or code' })
  // issue a fake token
  const accessToken = `stub-token-${uuidv4()}`
  channelConfig = { ...(channelConfig || {}), oauth: { accessToken, obtainedAt: new Date().toISOString() } }
  res.json({ ok: true, accessToken })
})

// Simulate importing reservations
app.post('/api/integrations/import', (req, res) => {
  // pretend we imported N reservations
  const imported = 3
  channelConfig = { ...(channelConfig || {}), importedAt: new Date().toISOString(), importedCount: imported }
  res.json({ ok: true, imported })
})

// Webhook simulator: accept incoming reservation payloads
app.post('/api/integrations/webhook', (req, res) => {
  const payload = req.body || {}
  // In prod you'd validate signature and push to the system. Here we just log and return.
  console.log('Received webhook:', JSON.stringify(payload).slice(0, 1000))
  res.json({ ok: true })
})

const port = process.env.PORT || 4001
app.listen(port, () => {
  console.log(`Integration stub API listening on http://localhost:${port}`)
})
