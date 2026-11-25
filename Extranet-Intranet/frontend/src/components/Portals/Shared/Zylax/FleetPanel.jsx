import { useCallback, useEffect, useState } from 'react'
import api from '../../../../api/client'
import { useT, dateLocale } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'

const osm = (lat, lng) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`

/** Vehicle GPS: the driver shares the phone's position with one tap; managers see the recent track. */
function FleetPanel({ vehicleId, onShared }) {
  const t = useT()
  const [points, setPoints] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/zylax/hub/fleet/vehicles/${vehicleId}/positions`, { params: { hours: 72 } })
      setPoints(response.data?.data || [])
    } catch {
      setPoints([])
    }
  }, [vehicleId])

  useEffect(() => { load() }, [load])

  const share = () => {
    if (!navigator.geolocation) return setMessage(t('This device cannot share its location.'))
    setBusy(true)
    setMessage('')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude, accuracy, speed } = position.coords
          const response = await api.post(`/zylax/hub/fleet/vehicles/${vehicleId}/position`, {
            lat: latitude, lng: longitude, accuracy_m: accuracy, speed_kmh: speed == null ? null : speed * 3.6,
          })
          setMessage(response.data?.message || 'Position shared.')
          await load()
          onShared?.()
        } catch (error) {
          setMessage(error.response?.data?.message || 'Could not share the position.')
        } finally {
          setBusy(false)
        }
      },
      () => {
        setBusy(false)
        setMessage(t('Location access was denied or is not available.'))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
    return undefined
  }

  return (
    <section className="zx-fleet">
      <div className="zx-fleet-head">
        <strong>{t('GPS position')}</strong>
        <button type="button" className="primary-action" onClick={share} disabled={busy}>{busy ? t('Locating…') : t('Share my location now')}</button>
      </div>
      <small className="zx-fleet-note">{t('Only sent when you press the button. Kept for 90 days.')}</small>
      {message && <p className="zx-fleet-message" role="status">{translateServer(message)}</p>}
      {points.length > 0 ? (
        <ol className="zx-fleet-track">
          {points.slice(0, 10).map((point) => (
            <li key={point.id}>
              <a href={osm(point.lat, point.lng)} target="_blank" rel="noreferrer">{Number(point.lat).toFixed(5)}, {Number(point.lng).toFixed(5)}</a>
              <small>
                {new Date(point.recorded_at).toLocaleString(dateLocale())}
                {point.reported_by ? ` · ${point.reported_by}` : ''}
                {point.accuracy_m ? ` · ±${point.accuracy_m} m` : ''}
              </small>
            </li>
          ))}
        </ol>
      ) : <small className="zx-fleet-note">{t('No positions in the last 3 days.')}</small>}
    </section>
  )
}

export default FleetPanel
