import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import './QRScanner.css'

const SCANNER_ID = 'hms-qr-reader'

export default function QRScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)
  const scannedRef = useRef(false)
  const animRef = useRef(null)
  const [error, setError] = useState('')
  const [cameras, setCameras] = useState([])
  const [activeCameraId, setActiveCameraId] = useState(null)
  const [detected, setDetected] = useState(false)
  const [lineY, setLineY] = useState(0)

  // Animate scan line
  useEffect(() => {
    let pos = 0
    let dir = 1
    function tick() {
      pos += dir * 1.2
      if (pos >= 100) dir = -1
      if (pos <= 0) dir = 1
      setLineY(pos)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [])

  function extractToken(text) {
    const raw = String(text || '').trim()
    try {
      const t = new URL(raw).searchParams.get('token')
      if (t) return t
    } catch { }
    return raw
  }

  async function startScanner(cameraId) {
    try {
      const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false })
      scannerRef.current = scanner
      await scanner.start(
        cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 200, height: 200 } },
        (decodedText) => {
          if (scannedRef.current) return
          scannedRef.current = true
          cancelAnimationFrame(animRef.current)
          setDetected(true)
          setTimeout(() => onScan(extractToken(decodedText)), 500)
        },
        () => { }
      )
    } catch (err) {
      setError(String(err?.message || err))
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch { }
      try { scannerRef.current.clear() } catch { }
      scannerRef.current = null
    }
  }

  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        setCameras(devices || [])
        const back = devices.find((d) => /back|rear|environment/i.test(d.label))
        const id = back?.id || devices[0]?.id || null
        setActiveCameraId(id)
        startScanner(id)
      })
      .catch((err) => setError(`Cannot access camera: ${String(err?.message || err)}`))
    return () => stopScanner()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function switchCamera(id) {
    await stopScanner()
    scannedRef.current = false
    setDetected(false)
    setActiveCameraId(id)
    startScanner(id)
  }

  // Size of the scan box as % of container
  const BOX = 62 // percent
  const BOX_OFFSET = (100 - BOX) / 2

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      {error ? (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10,
          padding: '14px 16px', fontSize: 13, color: '#b91c1c', margin: '8px 0',
        }}>
          <i className="fa fa-exclamation-triangle" style={{ marginRight: 6 }} />
          {error}
          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
            Allow camera access in your browser and try again.
          </div>
        </div>
      ) : (
        <div style={{
          position: 'relative',
          width: 280,
          margin: '0 auto',
          borderRadius: 14,
          overflow: 'hidden',
          background: '#000',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          aspectRatio: '1 / 1',
        }}>
          {/* html5-qrcode video container */}
          <div id={SCANNER_ID} style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
          }} />

          {/* Dark mask - 4 sides around the scan box */}
          {/* top */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${BOX_OFFSET}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
          {/* bottom */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${BOX_OFFSET}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
          {/* left */}
          <div style={{ position: 'absolute', top: `${BOX_OFFSET}%`, left: 0, width: `${BOX_OFFSET}%`, height: `${BOX}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
          {/* right */}
          <div style={{ position: 'absolute', top: `${BOX_OFFSET}%`, right: 0, width: `${BOX_OFFSET}%`, height: `${BOX}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />

          {/* Corner brackets */}
          {[
            { top: `${BOX_OFFSET}%`, left: `${BOX_OFFSET}%`, borderTop: true, borderLeft: true },
            { top: `${BOX_OFFSET}%`, right: `${BOX_OFFSET}%`, borderTop: true, borderRight: true },
            { bottom: `${BOX_OFFSET}%`, left: `${BOX_OFFSET}%`, borderBottom: true, borderLeft: true },
            { bottom: `${BOX_OFFSET}%`, right: `${BOX_OFFSET}%`, borderBottom: true, borderRight: true },
          ].map((c, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: 20, height: 20,
              pointerEvents: 'none',
              top: c.top, left: c.left, right: c.right, bottom: c.bottom,
              borderTopWidth: c.borderTop ? 3 : 0,
              borderLeftWidth: c.borderLeft ? 3 : 0,
              borderRightWidth: c.borderRight ? 3 : 0,
              borderBottomWidth: c.borderBottom ? 3 : 0,
              borderStyle: 'solid',
              borderColor: detected ? '#22c55e' : '#00e5cc',
              transition: 'border-color 0.25s',
              transform: c.right ? 'translateX(100%)' : c.left ? 'translateX(-100%)' : undefined,
              // nudge corners to sit on the edge of the box
              marginTop: c.top ? -1 : undefined,
              marginBottom: c.bottom ? -1 : undefined,
            }} />
          ))}

          {/* Animated scan line inside the box */}
          {!detected && (
            <div style={{
              position: 'absolute',
              left: `${BOX_OFFSET}%`,
              width: `${BOX}%`,
              top: `calc(${BOX_OFFSET}% + ${lineY * BOX / 100}%)`,
              height: 2,
              background: 'linear-gradient(90deg, transparent 0%, #00e5cc 30%, #00e5cc 70%, transparent 100%)',
              boxShadow: '0 0 8px 2px rgba(0,229,204,0.6)',
              pointerEvents: 'none',
            }} />
          )}

          {/* Success overlay */}
          {detected && (
            <div style={{
              position: 'absolute',
              top: `${BOX_OFFSET}%`, left: `${BOX_OFFSET}%`,
              width: `${BOX}%`, height: `${BOX}%`,
              background: 'rgba(34,197,94,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
              borderRadius: 4,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: '#22c55e',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 20px rgba(34,197,94,0.7)',
              }}>
                <i className="fa fa-check" style={{ color: '#fff', fontSize: 24 }} />
              </div>
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize: 12, color: detected ? '#16a34a' : '#6b7280', marginTop: 10, fontWeight: detected ? 600 : 400 }}>
        {detected ? '✅ QR detected - verifying...' : 'Align the QR code inside the frame'}
      </p>

      {cameras.length > 1 && !detected && (
        <select
          className="form-control form-control-sm"
          style={{ display: 'inline-block', width: 'auto', fontSize: 12, marginBottom: 8 }}
          value={activeCameraId || ''}
          onChange={(e) => switchCamera(e.target.value)}
        >
          {cameras.map((cam) => (
            <option key={cam.id} value={cam.id}>{cam.label || `Camera ${cam.id}`}</option>
          ))}
        </select>
      )}

      {!detected && (
        <div>
          <button type="button" className="btn btn-default btn-sm" onClick={onClose}>
            <i className="fa fa-times" style={{ marginRight: 4 }} />Cancel
          </button>
        </div>
      )}
    </div>
  )
}
