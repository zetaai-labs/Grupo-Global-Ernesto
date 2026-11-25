import { useEffect, useState } from 'react'
import { avatarUrl, initials } from './avatarStore'

/** Round profile photo, or the person's initials when there is no photo. */
function Avatar({ userId, version, name, size = 33, className = '' }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    let alive = true
    avatarUrl(userId, version).then((url) => { if (alive) setSrc(url) })
    return () => { alive = false }
  }, [userId, version])

  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }
  if (src && version) return <img className={`profile-avatar avatar-photo ${className}`} src={src} alt="" style={style} />
  return <div className={`profile-avatar ${className}`} style={style} aria-hidden="true">{initials(name)}</div>
}

export default Avatar
