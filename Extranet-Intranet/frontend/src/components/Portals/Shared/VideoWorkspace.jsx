import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { getToken } from '../../../api/auth'
import { SOCKET_URL } from '../../../api/socket'
import './VideoWorkspace.css'
import { useT } from '../../../i18n'

// STUN works on open networks; corporate/NAT networks need a TURN relay (VITE_TURN_*).
const ICE_SERVERS = [
  { urls: import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302' },
  ...(import.meta.env.VITE_TURN_URL
    ? [{
        urls: import.meta.env.VITE_TURN_URL.split(',').map((url) => url.trim()),
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_CREDENTIAL,
      }]
    : []),
]

function RemoteTile({ peer }) {
  const videoRef = useRef(null)
  useEffect(() => {
    if (videoRef.current && peer.stream) videoRef.current.srcObject = peer.stream
  }, [peer.stream])
  return (
    <div className="video-tile">
      <video ref={videoRef} autoPlay playsInline />
      {!peer.stream && <div className="video-placeholder">Connecting…</div>}
      <span>{peer.name}</span>
    </div>
  )
}

/**
 * Group video meeting (WebRTC mesh, up to 8 people). The room comes from ?room=
 * (calendar meeting links) or defaults to the portal's open meeting room.
 */
function VideoWorkspace({ portal = 'intranet' }) {
  const t = useT()
  const [searchParams] = useSearchParams()
  const defaultRoom = portal === 'intranet' ? 'intranet-meeting' : 'extranet-meeting'
  const room = searchParams.get('room') || defaultRoom

  const localRef = useRef(null)
  const socketRef = useRef(null)
  const streamRef = useRef(null)
  const screenRef = useRef(null)
  const peersRef = useRef(new Map()) // socketId -> { pc, name }
  const [peers, setPeers] = useState([]) // [{ id, name, stream }]
  const [joined, setJoined] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [notice, setNotice] = useState('')

  const upsertPeer = useCallback((id, patch) => {
    setPeers((current) => {
      const found = current.find((peer) => peer.id === id)
      return found
        ? current.map((peer) => (peer.id === id ? { ...peer, ...patch } : peer))
        : [...current, { id, name: 'Participant', stream: null, ...patch }]
    })
  }, [])

  const removePeer = useCallback((id) => {
    peersRef.current.get(id)?.pc.close()
    peersRef.current.delete(id)
    setPeers((current) => current.filter((peer) => peer.id !== id))
  }, [])

  /** Creates (or returns) the RTCPeerConnection for one remote participant. */
  const connectionFor = useCallback((id, name) => {
    const existing = peersRef.current.get(id)
    if (existing) return existing.pc

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peersRef.current.set(id, { pc, name })
    upsertPeer(id, { name: name || 'Participant' })

    const outgoing = screenRef.current || streamRef.current
    streamRef.current?.getAudioTracks().forEach((track) => pc.addTrack(track, streamRef.current))
    outgoing?.getVideoTracks().forEach((track) => pc.addTrack(track, streamRef.current))

    pc.onicecandidate = (event) => {
      if (event.candidate) socketRef.current?.emit('video:signal', { to: id, data: { type: 'ice', candidate: event.candidate } })
    }
    pc.ontrack = (event) => upsertPeer(id, { stream: event.streams[0] })
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) removePeer(id)
    }
    return pc
  }, [removePeer, upsertPeer])

  const teardown = useCallback(() => {
    peersRef.current.forEach(({ pc }) => pc.close())
    peersRef.current.clear()
    setPeers([])
    screenRef.current?.getTracks().forEach((track) => track.stop())
    screenRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (localRef.current) localRef.current.srcObject = null
    setSharing(false)
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) return undefined

    const socket = io(SOCKET_URL, { auth: { token } })
    socketRef.current = socket
    socket.on('connect_error', () => setNotice('Meeting server unavailable.'))

    // Existing participants wait; the newcomer sends them offers.
    socket.on('video:peer-joined', ({ id, name }) => upsertPeer(id, { name }))
    socket.on('video:peer-left', ({ id }) => removePeer(id))

    socket.on('video:signal', async ({ from, name, data }) => {
      try {
        if (data.type === 'offer') {
          const pc = connectionFor(from, name)
          await pc.setRemoteDescription(data.sdp)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('video:signal', { to: from, data: { type: 'answer', sdp: answer } })
        } else if (data.type === 'answer') {
          await peersRef.current.get(from)?.pc.setRemoteDescription(data.sdp)
        } else if (data.type === 'ice') {
          await peersRef.current.get(from)?.pc.addIceCandidate(data.candidate)
        }
      } catch {
        setNotice('A participant could not be connected. Calls across office networks may need a TURN server.')
      }
    })

    return () => {
      socket.emit('video:leave')
      teardown()
      socket.disconnect()
      socketRef.current = null
    }
  }, [connectionFor, removePeer, teardown, upsertPeer])

  const join = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (localRef.current) localRef.current.srcObject = stream
    } catch {
      setNotice('Camera or microphone access was denied.')
      return
    }

    socketRef.current?.emit('video:join', room, async (reply) => {
      if (!reply?.ok) {
        setNotice(reply?.message || 'Could not join the meeting.')
        teardown()
        return
      }
      setJoined(true)
      setNotice(reply.peers.length ? `Joined — ${reply.peers.length} other participant(s) in the room.` : 'Joined — waiting for others to join.')
      for (const peer of reply.peers) {
        const pc = connectionFor(peer.id, peer.name)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socketRef.current?.emit('video:signal', { to: peer.id, data: { type: 'offer', sdp: offer } })
      }
    })
  }

  const leave = () => {
    socketRef.current?.emit('video:leave')
    teardown()
    setJoined(false)
    setMuted(false)
    setCameraOff(false)
    setNotice('You left the meeting.')
  }

  const toggleMute = () => {
    const next = !muted
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
    setMuted(next)
  }

  const toggleCamera = () => {
    const next = !cameraOff
    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next })
    setCameraOff(next)
  }

  /** Swaps the outgoing video track for every participant. */
  const replaceVideoTrack = (track) => {
    peersRef.current.forEach(({ pc }) => {
      const sender = pc.getSenders().find((item) => item.track?.kind === 'video')
      sender?.replaceTrack(track)
    })
    if (localRef.current) {
      localRef.current.srcObject = track === streamRef.current?.getVideoTracks()[0] ? streamRef.current : screenRef.current
    }
  }

  const stopSharing = () => {
    screenRef.current?.getTracks().forEach((track) => track.stop())
    screenRef.current = null
    replaceVideoTrack(streamRef.current?.getVideoTracks()[0] || null)
    setSharing(false)
  }

  const toggleShare = async () => {
    if (sharing) return stopSharing()
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true })
      screenRef.current = screen
      const [track] = screen.getVideoTracks()
      track.onended = stopSharing
      replaceVideoTrack(track)
      setSharing(true)
    } catch {
      setNotice('Screen sharing was cancelled.')
    }
    return undefined
  }

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Meeting link copied. Only invited people can join a scheduled meeting.')
    } catch {
      setNotice(url)
    }
  }

  const isScheduled = room !== defaultRoom
  const participantCount = peers.length + (joined ? 1 : 0)

  return (
    <div className="communication-page">
      <header className="communication-header">
        <div>
          <span className="communication-eyebrow">{t('COMMUNICATION')}</span>
          <h1>{portal === 'intranet' ? 'Video Conferencing' : 'Video Meetings'}</h1>
          <p>Secure group meetings for up to 8 people. Schedule one from the Calendar to invite colleagues, clients or suppliers.</p>
        </div>
        <span className="communication-status">{joined ? `● In meeting · ${participantCount}` : '○ Not connected'}</span>
      </header>

      {notice && <div className="cloud-notice" role="status">{notice}</div>}

      <div className="meeting-room">
        <div className="meeting-room-header">
          <h2>{isScheduled ? 'Scheduled meeting' : portal === 'intranet' ? 'Internal Meeting Room' : 'Partner Meeting Room'}</h2>
          <span className="meeting-live">Room: {room}</span>
        </div>

        <div className={`video-grid video-grid--${Math.min(participantCount || 1, 4)}`}>
          <div className="video-tile">
            <video ref={localRef} autoPlay playsInline muted />
            {cameraOff && <div className="video-placeholder">Camera off</div>}
            <span>You{sharing ? ' (sharing screen)' : ''}{muted ? ' · muted' : ''}</span>
          </div>
          {peers.map((peer) => <RemoteTile key={peer.id} peer={peer} />)}
        </div>

        <div className="meeting-controls">
          {!joined ? (
            <>
              <button type="button" onClick={join}>Join meeting</button>
              <button type="button" onClick={copyLink}>Copy meeting link</button>
            </>
          ) : (
            <>
              <button type="button" onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
              <button type="button" onClick={toggleCamera}>{cameraOff ? 'Camera on' : 'Camera off'}</button>
              <button type="button" onClick={toggleShare}>{sharing ? 'Stop sharing' : 'Share screen'}</button>
              <button type="button" onClick={copyLink}>Copy link</button>
              <button type="button" className="end-meeting" onClick={leave}>Leave</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default VideoWorkspace
