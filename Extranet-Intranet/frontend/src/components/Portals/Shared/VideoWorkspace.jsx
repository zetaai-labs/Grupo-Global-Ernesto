import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import api from '../../../api/client'
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
 * Group video meeting. Uses the LiveKit SFU when the server provides a session, otherwise
 * WebRTC mesh for up to 8 people. The room comes from ?room= (calendar meeting links) or
 * defaults to the portal's open meeting room.
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
  const sfuRef = useRef(null) // { room, Track, streams, publications }
  const [peers, setPeers] = useState([]) // [{ id, name, stream }]
  const [joined, setJoined] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [notice, setNotice] = useState('')
  const [mode, setMode] = useState('mesh')

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
    const sfu = sfuRef.current
    sfuRef.current = null
    sfu?.room.disconnect()
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

  /** Joins through the SFU. Remote tiles keep one MediaStream each so video does not flicker. */
  const joinSfu = async (session, stream) => {
    const { Room, RoomEvent, Track } = await import('livekit-client')
    const lkRoom = new Room({ adaptiveStream: true, dynacast: true })
    const sfu = { room: lkRoom, Track, streams: new Map(), publications: {} }
    sfuRef.current = sfu

    const tile = (id, name, tracks) => {
      if (!tracks.length) {
        sfu.streams.delete(id)
        return null
      }
      const media = sfu.streams.get(id) || new MediaStream()
      sfu.streams.set(id, media)
      media.getTracks().filter((track) => !tracks.includes(track)).forEach((track) => media.removeTrack(track))
      tracks.filter((track) => !media.getTracks().includes(track)).forEach((track) => media.addTrack(track))
      return { id, name, stream: media }
    }
    const refresh = () => {
      if (sfuRef.current !== sfu) return
      const next = []
      lkRoom.remoteParticipants.forEach((participant) => {
        const published = [...participant.trackPublications.values()].filter((item) => item.isSubscribed && item.track)
        const of = (screen) => published
          .filter((item) => [Track.Source.ScreenShare, Track.Source.ScreenShareAudio].includes(item.source) === screen)
          .map((item) => item.track.mediaStreamTrack)
        const name = participant.name || 'Participant'
        next.push(tile(participant.identity, name, of(false)) || { id: participant.identity, name, stream: null })
        const screen = tile(`${participant.identity}:screen`, `${name} (screen)`, of(true))
        if (screen) next.push(screen)
      })
      setPeers(next)
    }

    for (const event of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed]) {
      lkRoom.on(event, refresh)
    }
    lkRoom.on(RoomEvent.Reconnecting, () => setNotice('Connection lost. Reconnecting…'))
    lkRoom.on(RoomEvent.Reconnected, () => setNotice('Reconnected.'))
    lkRoom.on(RoomEvent.Disconnected, () => {
      if (sfuRef.current !== sfu) return
      teardown()
      setJoined(false)
      setNotice('You were disconnected from the meeting.')
    })

    await lkRoom.connect(session.url, session.token)
    const [audio] = stream.getAudioTracks()
    const [video] = stream.getVideoTracks()
    if (audio) sfu.publications.audio = await lkRoom.localParticipant.publishTrack(audio, { source: Track.Source.Microphone })
    if (video) sfu.publications.video = await lkRoom.localParticipant.publishTrack(video, { source: Track.Source.Camera })
    refresh()
    setMode('sfu')
    setJoined(true)
    setNotice(lkRoom.remoteParticipants.size ? `Joined — ${lkRoom.remoteParticipants.size} other participant(s) in the room.` : 'Joined — waiting for others to join.')
  }

  const join = async () => {
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (localRef.current) localRef.current.srcObject = stream
    } catch {
      setNotice('Camera or microphone access was denied.')
      return
    }

    let session = { mode: 'mesh' }
    try {
      session = (await api.post('/video/session', { room })).data.data
    } catch (error) {
      if (error.response?.status === 403) {
        setNotice(error.response.data?.message || 'You are not invited to this meeting.')
        teardown()
        return
      }
    }
    if (session.mode === 'sfu') {
      try {
        await joinSfu(session, stream)
      } catch {
        // No silent fallback: mesh users would end up in a separate call from SFU users.
        teardown()
        setNotice('The meeting server could not be reached. Please try again.')
      }
      return
    }
    setMode('mesh')

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
    const publication = sfuRef.current?.publications.audio
    if (publication) (next ? publication.mute() : publication.unmute())
    else streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
    setMuted(next)
  }

  const toggleCamera = () => {
    const next = !cameraOff
    const publication = sfuRef.current?.publications.video
    if (publication) (next ? publication.mute() : publication.unmute())
    else streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next })
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
    const sfu = sfuRef.current
    if (sfu?.publications.screen?.track) {
      sfu.room.localParticipant.unpublishTrack(sfu.publications.screen.track)
      sfu.publications.screen = null
    }
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
      const sfu = sfuRef.current
      if (sfu) sfu.publications.screen = await sfu.room.localParticipant.publishTrack(track, { source: sfu.Track.Source.ScreenShare })
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
          <p>{joined && mode === 'sfu' ? 'Secure group meeting.' : 'Secure group meetings.'} Schedule one from the Calendar to invite colleagues, clients or suppliers.</p>
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
