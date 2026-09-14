import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { getWithAuth, postWithAuth } from '../api'

const CHANNEL_TYPES = [
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'expedia', label: 'Expedia' },
  { value: 'agoda', label: 'Agoda' },
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'direct_ical', label: 'Direct iCal Feed' },
]

const PROVIDER_LABEL = CHANNEL_TYPES.reduce((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

function defaultChannel(provider = 'booking_com') {
  return {
    id: `${provider}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    provider,
    name: PROVIDER_LABEL[provider] || provider,
    status: 'draft',
    enabled: false,
    credentials: {
      property_id: '',
      username: '',
      api_key: '',
    },
    permissions_granted: false,
    room_mappings: {},
    pricing: {
      currency: 'INR',
    },
    imported: false,
    imported_count: 0,
    sync_window: {
      start: '14:00',
      end: '11:00',
    },
    last_sync_at: '',
    created_at: Date.now(),
    updated_at: Date.now(),
  }
}

function normalizeConfig(rawConfig, fallbackWindow) {
  const safeRaw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
  const channels = Array.isArray(safeRaw.channels)
    ? safeRaw.channels
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const provider = String(item.provider || 'booking_com')
        const base = defaultChannel(provider)
        return {
          ...base,
          ...item,
          name: String(item.name || base.name),
          credentials: {
            ...base.credentials,
            ...(item.credentials || {}),
          },
          pricing: {
            ...base.pricing,
            ...(item.pricing || {}),
          },
          sync_window: {
            start: String(item?.sync_window?.start || fallbackWindow.start || base.sync_window.start),
            end: String(item?.sync_window?.end || fallbackWindow.end || base.sync_window.end),
          },
          room_mappings: item.room_mappings && typeof item.room_mappings === 'object' ? item.room_mappings : {},
          updated_at: Date.now(),
        }
      })
    : []

  if (channels.length === 0 && (safeRaw.hotelId || safeRaw.mappings || safeRaw.permissionsGranted != null)) {
    const migrated = defaultChannel('booking_com')
    migrated.credentials.property_id = String(safeRaw.hotelId || '')
    migrated.permissions_granted = !!safeRaw.permissionsGranted
    migrated.room_mappings = safeRaw.mappings && typeof safeRaw.mappings === 'object' ? safeRaw.mappings : {}
    migrated.pricing.currency = String(safeRaw?.prices?.currency || 'INR')
    migrated.imported = !!safeRaw.imported
    migrated.imported_count = Number(safeRaw.importedCount || 0)
    migrated.enabled = !!safeRaw.enabled
    migrated.status = migrated.enabled ? 'active' : 'draft'
    migrated.sync_window = {
      start: String(safeRaw?.timeWindow?.start || fallbackWindow.start || '14:00'),
      end: String(safeRaw?.timeWindow?.end || fallbackWindow.end || '11:00'),
    }
    channels.push(migrated)
  }

  return {
    version: 2,
    channels,
    selectedChannelId: channels[0]?.id || '',
  }
}

function timeToMinutes(value) {
  const [h, m] = String(value || '00:00').split(':').map((n) => Number(n || 0))
  return (h * 60) + m
}

function isNowWithinWindow(start, end) {
  const now = new Date()
  const current = (now.getHours() * 60) + now.getMinutes()
  const s = timeToMinutes(start)
  const e = timeToMinutes(end)
  if (s <= e) return current >= s && current <= e
  return current >= s || current <= e
}

export default function ChannelManager() {
  const token = useSelector((state) => state.auth.accesstoken)
  const activeHotelId = useSelector((state) => state.auth.activeHotelId)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [persistedChannelIds, setPersistedChannelIds] = useState(new Set())
  const [rooms, setRooms] = useState([])
  const [syncJobs, setSyncJobs] = useState([])
  const [config, setConfig] = useState({ version: 2, channels: [], selectedChannelId: '' })
  const [newProvider, setNewProvider] = useState('booking_com')

  const selectedChannel = useMemo(
    () => config.channels.find((item) => item.id === config.selectedChannelId) || null,
    [config.channels, config.selectedChannelId]
  )

  useEffect(() => {
    if (!token) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const [cfgRes, sysRes, roomsRes] = await Promise.all([
          getWithAuth('/integrations/channel-config', token),
          getWithAuth('/settings/system', token),
          getWithAuth('/rooms', token),
        ])
        if (!mounted) return
        const fallbackWindow = {
          start: String(sysRes?.data?.checkin_time || '14:00'),
          end: String(sysRes?.data?.checkout_time || '11:00'),
        }
        const normalized = normalizeConfig(cfgRes?.data?.config, fallbackWindow)
        setConfig(normalized)
        setPersistedChannelIds(new Set(normalized.channels.map((item) => item.id)))
        const items = Array.isArray(roomsRes?.data?.items) ? roomsRes.data.items : []
        setRooms(items.map((room) => ({
          id: room.id,
          name: `${room.room_number || room.name || `Room ${room.id}`}${room.room_type ? ` (${room.room_type})` : ''}`,
        })))
        try {
          const jobsRes = await getWithAuth('/integrations/sync-jobs?limit=20', token)
          const jobs = Array.isArray(jobsRes?.data?.items) ? jobsRes.data.items : []
          setSyncJobs(jobs)
        } catch {
          setSyncJobs([])
        }
      } catch {
        toast.error('Failed to load channel manager configuration.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [token, activeHotelId])

  function updateSelectedChannel(patch) {
    if (!selectedChannel) return
    setConfig((prev) => ({
      ...prev,
      channels: prev.channels.map((item) => (
        item.id === selectedChannel.id
          ? { ...item, ...patch, updated_at: Date.now() }
          : item
      )),
    }))
  }

  function updateSelectedChannelNested(key, nestedPatch) {
    if (!selectedChannel) return
    setConfig((prev) => ({
      ...prev,
      channels: prev.channels.map((item) => {
        if (item.id !== selectedChannel.id) return item
        return {
          ...item,
          [key]: {
            ...(item[key] || {}),
            ...nestedPatch,
          },
          updated_at: Date.now(),
        }
      }),
    }))
  }

  function addChannel() {
    const created = defaultChannel(newProvider)
    setConfig((prev) => ({
      ...prev,
      channels: [...prev.channels, created],
      selectedChannelId: created.id,
    }))
  }

  function removeSelectedChannel() {
    if (!selectedChannel) return
    if (!window.confirm(`Remove ${selectedChannel.name}?`)) return
    setConfig((prev) => {
      const nextChannels = prev.channels.filter((item) => item.id !== selectedChannel.id)
      return {
        ...prev,
        channels: nextChannels,
        selectedChannelId: nextChannels[0]?.id || '',
      }
    })
  }

  async function saveConfiguration() {
    if (!token) return
    setSaving(true)
    try {
      await postWithAuth('/integrations/channel-config', config, token)
      setPersistedChannelIds(new Set(config.channels.map((item) => item.id)))
      toast.success('Channel manager configuration saved.')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to save channel manager configuration')
    }
    setSaving(false)
  }

  async function refreshSyncJobs() {
    if (!token) return
    try {
      const jobsRes = await getWithAuth('/integrations/sync-jobs?limit=20', token)
      const jobs = Array.isArray(jobsRes?.data?.items) ? jobsRes.data.items : []
      setSyncJobs(jobs)
    } catch {
      toast.error('Failed to refresh sync jobs')
    }
  }

  async function startOAuthFlow() {
    if (!selectedChannel || !token) return
    try {
      const channelId = await ensureSelectedChannelPersisted()
      if (!channelId) return
      const res = await postWithAuth(`/integrations/channels/${encodeURIComponent(channelId)}/oauth/start`, {}, token)
      const url = res?.data?.redirectUrl
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      updateSelectedChannel({ permissions_granted: true, status: 'connected' })
      toast.success('OAuth/permission flow started.')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to start OAuth/permission flow')
    }
  }

  async function runImport() {
    if (!selectedChannel || !token) return
    try {
      const channelId = await ensureSelectedChannelPersisted()
      if (!channelId) return
      const res = await postWithAuth(`/integrations/channels/${encodeURIComponent(channelId)}/import`, {}, token)
      const importedCount = Number(res?.data?.imported_count || res?.data?.imported || 1)
      updateSelectedChannel({ imported: true, imported_count: importedCount })
      toast.success(`Imported ${importedCount} reservation(s).`)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to import reservations')
    }
  }

  async function toggleSyncEnabled(nextEnabled) {
    if (!selectedChannel || !token) return
    if (nextEnabled) {
      const windowStart = selectedChannel?.sync_window?.start || '00:00'
      const windowEnd = selectedChannel?.sync_window?.end || '23:59'
      const allowed = isNowWithinWindow(windowStart, windowEnd)
      if (!allowed) {
        toast.error(`Cannot enable outside sync window (${windowStart}-${windowEnd})`)
        return
      }
    }
    try {
      const channelId = await ensureSelectedChannelPersisted()
      if (!channelId) return
      const res = await postWithAuth(`/integrations/channels/${encodeURIComponent(channelId)}/sync/toggle`, { enabled: nextEnabled }, token)
      const serverChannel = res?.data?.channel
      if (serverChannel && typeof serverChannel === 'object') {
        updateSelectedChannel({
          ...serverChannel,
          enabled: !!serverChannel.enabled,
        })
      } else {
        updateSelectedChannel({
          enabled: nextEnabled,
          status: nextEnabled ? 'active' : 'paused',
          last_sync_at: nextEnabled ? new Date().toISOString() : selectedChannel.last_sync_at,
        })
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to toggle synchronization')
    }
  }

  async function ensureSelectedChannelPersisted() {
    if (!selectedChannel || !token) return null
    if (persistedChannelIds.has(selectedChannel.id)) return selectedChannel.id
    try {
      await postWithAuth('/integrations/channels', selectedChannel, token)
      setPersistedChannelIds((prev) => {
        const next = new Set(prev)
        next.add(selectedChannel.id)
        return next
      })
      return selectedChannel.id
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Please save channel configuration first')
      return null
    }
  }

  if (loading) {
    return <div style={{ padding: 20 }}>Loading channel manager...</div>
  }

  return (
    <div style={{ display: 'flex', padding: 20, gap: 18 }}>
      <div style={{ width: 320, background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
        <Link to="/integrations" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#4f46e5', textDecoration: 'none', marginBottom: 8 }}>&larr; Return</Link>
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'inline-block', padding: '6px 12px', background: '#eef2ff', color: '#4f46e5', borderRadius: 999, fontWeight: 700, fontSize: 12 }}>Integrations</div>
          <h3 style={{ marginTop: 10, marginBottom: 8 }}>Channel Manager</h3>
          <div style={{ color: '#64748b', fontSize: 13 }}>Manage multiple OTA and channel connections from one place.</div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <select className="form-control" value={newProvider} onChange={(e) => setNewProvider(e.target.value)}>
              {CHANNEL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <button className="btn btn-primary" onClick={addChannel}>Add</button>
          </div>

          <hr style={{ margin: '14px 0', border: 'none', borderTop: '1px solid #eef2f6' }} />

          <div style={{ maxHeight: '62vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {config.channels.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>No channels added yet.</div>
            ) : config.channels.map((item) => {
              const isActive = item.id === config.selectedChannelId
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, selectedChannelId: item.id }))}
                  style={{
                    textAlign: 'left',
                    background: isActive ? '#eef2ff' : '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 10,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{item.name}</div>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>Status: {item.status || 'draft'} {item.enabled ? '(sync on)' : '(sync off)'}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, background: '#f7fafc', borderRadius: 8, padding: 20, minHeight: 520 }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ background: '#fff', padding: 22, borderRadius: 12, boxShadow: '0 6px 18px rgba(15,23,42,0.04)' }}>
            {!selectedChannel ? (
              <div style={{ color: '#64748b' }}>Select a channel from the left or add a new channel connection.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{selectedChannel.name}</h3>
                    <div style={{ color: '#64748b', marginTop: 4, fontSize: 13 }}>
                      Provider: {PROVIDER_LABEL[selectedChannel.provider] || selectedChannel.provider} | Status: {selectedChannel.status || 'draft'}
                    </div>
                  </div>
                  <button className="btn btn-danger" onClick={removeSelectedChannel}>Remove</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label>Connection Name</label>
                    <input className="form-control" value={selectedChannel.name} onChange={(e) => updateSelectedChannel({ name: e.target.value })} />
                  </div>
                  <div>
                    <label>Property ID</label>
                    <input className="form-control" value={selectedChannel?.credentials?.property_id || ''} onChange={(e) => updateSelectedChannelNested('credentials', { property_id: e.target.value })} />
                  </div>
                  <div>
                    <label>API Username</label>
                    <input className="form-control" value={selectedChannel?.credentials?.username || ''} onChange={(e) => updateSelectedChannelNested('credentials', { username: e.target.value })} />
                  </div>
                  <div>
                    <label>API Key / Token</label>
                    <input className="form-control" value={selectedChannel?.credentials?.api_key || ''} onChange={(e) => updateSelectedChannelNested('credentials', { api_key: e.target.value })} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-default" onClick={startOAuthFlow}>
                    {selectedChannel.permissions_granted ? 'Re-connect Permissions' : 'Grant Permissions'}
                  </button>
                  <span style={{ color: selectedChannel.permissions_granted ? '#16a34a' : '#ef4444' }}>
                    {selectedChannel.permissions_granted ? 'Permissions granted' : 'Permissions pending'}
                  </span>
                </div>

                <div>
                  <h4 style={{ marginTop: 0 }}>Room Mapping</h4>
                  {rooms.length === 0 ? (
                    <div style={{ color: '#94a3b8' }}>No rooms found to map.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                      {rooms.map((room) => (
                        <div key={room.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ minWidth: 220 }}>{room.name}</div>
                          <input
                            className="form-control"
                            placeholder="External room id / rate plan"
                            value={selectedChannel?.room_mappings?.[room.id] || ''}
                            onChange={(e) => updateSelectedChannelNested('room_mappings', { [room.id]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label>Currency</label>
                    <select className="form-control" value={selectedChannel?.pricing?.currency || 'INR'} onChange={(e) => updateSelectedChannelNested('pricing', { currency: e.target.value })}>
                      <option value="INR">INR</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn btn-default" onClick={runImport}>Import Existing Reservations</button>
                    <span style={{ marginLeft: 10, color: selectedChannel.imported ? '#16a34a' : '#94a3b8' }}>
                      {selectedChannel.imported ? `Imported (${selectedChannel.imported_count || 0})` : 'Not imported'}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 style={{ marginTop: 0 }}>Synchronization</h4>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={!!selectedChannel.enabled} onChange={(e) => toggleSyncEnabled(e.target.checked)} />
                      Enable synchronization
                    </label>
                    <span style={{ color: selectedChannel.enabled ? '#16a34a' : '#ef4444' }}>
                      {selectedChannel.enabled ? 'Running' : 'Stopped'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                    <div>
                      <label>Allowed Start</label>
                      <input className="form-control" type="time" value={selectedChannel?.sync_window?.start || '14:00'} onChange={(e) => updateSelectedChannelNested('sync_window', { start: e.target.value })} />
                    </div>
                    <div>
                      <label>Allowed End</label>
                      <input className="form-control" type="time" value={selectedChannel?.sync_window?.end || '11:00'} onChange={(e) => updateSelectedChannelNested('sync_window', { end: e.target.value })} />
                    </div>
                    <div style={{ fontSize: 13, color: isNowWithinWindow(selectedChannel?.sync_window?.start || '14:00', selectedChannel?.sync_window?.end || '11:00') ? '#16a34a' : '#ef4444' }}>
                      {isNowWithinWindow(selectedChannel?.sync_window?.start || '14:00', selectedChannel?.sync_window?.end || '11:00') ? 'Within window' : 'Outside window'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-primary" onClick={saveConfiguration} disabled={saving}>
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
              <button className="btn btn-default" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
            <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>
              Configuration scope: active hotel `{String(activeHotelId || 'none')}`
            </div>
            <div style={{ marginTop: 16, borderTop: '1px solid #edf2f7', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>Recent Sync Jobs</strong>
                <button type="button" className="btn btn-default btn-sm" onClick={refreshSyncJobs}>Refresh</button>
              </div>
              {syncJobs.length === 0 ? (
                <div className="text-muted" style={{ fontSize: 13 }}>No sync jobs found yet. Create/update bookings or rooms to trigger channel sync.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-bordered table-condensed" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Event</th>
                        <th>Entity</th>
                        <th>Status</th>
                        <th>Attempts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncJobs.map((job) => (
                        <tr key={job.id}>
                          <td>{job.provider || '-'}</td>
                          <td>{job.event_type || '-'}</td>
                          <td>{job.entity_type} #{job.entity_id}</td>
                          <td>{job.status}</td>
                          <td>{job.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
