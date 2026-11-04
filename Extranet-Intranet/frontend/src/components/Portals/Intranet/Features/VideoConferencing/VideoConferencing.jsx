
import { useState } from 'react'

function VideoConferencing() {
  const [meetingName, setMeetingName] = useState('')
  const [meetingStarted, setMeetingStarted] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)

  const startMeeting = (e) => {
    e.preventDefault()
    if (!meetingName.trim()) return
    setMeetingStarted(true)
  }

  return (
    <div className="communication-page">
      <header className="communication-header">
        <div>
          <span className="communication-eyebrow">COMMUNICATION</span>
          <h1>Video Conferencing</h1>
          <p>Connect with colleagues through online meetings.</p>
        </div>
        <span className="communication-status">● Meeting workspace</span>
      </header>

      {!meetingStarted ? (
        <div className="meeting-setup">
          <div className="meeting-illustration">▣</div>
          <h2>Start a new meeting</h2>
          <p>Create a meeting room for your team.</p>

          <form onSubmit={startMeeting}>
            <input
              value={meetingName}
              onChange={e => setMeetingName(e.target.value)}
              placeholder="Enter meeting name"
              required
            />
            <button type="submit">Start Meeting ↗</button>
          </form>

          <div className="meeting-features">
            <span>🎙 Microphone controls</span>
            <span>📹 Camera controls</span>
            <span>👥 Participant-ready layout</span>
          </div>
        </div>
      ) : (
        <div className="meeting-room">
          <div className="meeting-room-header">
            <div>
              <span className="communication-eyebrow">MEETING ROOM</span>
              <h2>{meetingName}</h2>
            </div>
            <span className="meeting-live">● Meeting preview</span>
          </div>

          <div className="meeting-screen">
            <div className="meeting-placeholder">
              <div className="meeting-avatar">You</div>
              <h3>{cameraOn ? 'Camera preview unavailable' : 'Camera is off'}</h3>
              <p>Connect a video service to enable live video.</p>
            </div>
          </div>

          <div className="meeting-controls">
            <button onClick={() => setMicOn(!micOn)}>
              {micOn ? '🎙 Mute' : '🔇 Unmute'}
            </button>
            <button onClick={() => setCameraOn(!cameraOn)}>
              {cameraOn ? '📹 Camera off' : '📷 Camera on'}
            </button>
            <button
              className="end-meeting"
              onClick={() => setMeetingStarted(false)}
            >
              End meeting
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoConferencing
