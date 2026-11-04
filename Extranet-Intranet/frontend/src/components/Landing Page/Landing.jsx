
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Landing() {
  const navigate = useNavigate()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedWorkspace, setSelectedWorkspace] = useState(null)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const formattedDate = currentTime.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })

  const formattedTime = currentTime.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  const enterWorkspace = (workspace) => {
    setSelectedWorkspace(workspace)

    setTimeout(() => {
      navigate(`/${workspace}`)
    }, 350)
  }

  return (
    <main className="landing-page">

      {/* Background decoration */}
      <div className="landing-grid-bg" />
      <div className="landing-glow landing-glow-one" />
      <div className="landing-glow landing-glow-two" />
      <div className="floating-orb orb-one" />
      <div className="floating-orb orb-two" />
      <div className="floating-orb orb-three" />

      {/* Top navigation */}
      <header className="landing-navbar">
        <div className="landing-nav-brand">
          <div className="landing-logo">GG</div>

          <div className="landing-brand">
            <span className="landing-brand-name">GLOBAL GROUP</span>
            <span className="landing-brand-caption">CONNECTED WORKSPACE</span>
          </div>
        </div>

        <div className="landing-nav-right">
          <div className="landing-security">
            <span className="security-pulse" />
            Secure environment
          </div>

          <div className="landing-live-clock">
            <span className="clock-icon">◷</span>
            <div>
              <strong>{formattedTime}</strong>
              <span>{formattedDate}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main hero */}
      <section className="landing-content">

        <div className="landing-hero">
          <div className="landing-eyebrow">
            <span className="eyebrow-line" />
            YOUR DIGITAL WORKSPACE
            <span className="eyebrow-line" />
          </div>

          <h1>
            One workspace.
            <br />
            <span className="hero-gradient">
              Connected everywhere.
            </span>
          </h1>

          <p>
            Everything your organisation needs to work smarter.
            Access information, collaborate seamlessly and
            stay connected in one secure environment.
          </p>

          <div className="hero-highlights">
            <span><span>✓</span> Centralised access</span>
            <span><span>✓</span> Secure collaboration</span>
            <span><span>✓</span> Connected teams</span>
          </div>
        </div>

        {/* Workspace selection */}
        <div className="workspace-section">

          <div className="workspace-section-heading">
            <div>
              <span className="section-eyebrow">GET STARTED</span>
              <h2>Choose your workspace</h2>
              <p>Select the environment you want to access.</p>
            </div>

            <div className="workspace-count">
              <span className="count-dot" />
              02 WORKSPACES AVAILABLE
            </div>
          </div>

          <div className="workspace-grid">

            {/* Intranet */}
            <button
              className={`workspace-option intranet-option ${
                selectedWorkspace === 'intranet' ? 'workspace-selected' : ''
              }`}
              onClick={() => enterWorkspace('intranet')}
              disabled={selectedWorkspace !== null}
            >
              <div className="workspace-card-top">
                <div className="workspace-icon purple-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="8" height="8" rx="2" />
                    <rect x="13" y="3" width="8" height="8" rx="2" />
                    <rect x="3" y="13" width="8" height="8" rx="2" />
                    <rect x="13" y="13" width="8" height="8" rx="2" />
                  </svg>
                </div>

                <span className="workspace-card-tag purple-tag">
                  INTERNAL ACCESS
                </span>
              </div>

              <div className="workspace-details">
                <h3>Intranet</h3>
                <p>
                  Your central hub for internal operations,
                  corporate documents and team collaboration.
                </p>
              </div>

              <div className="workspace-card-bottom">
                <span className="workspace-enter purple-text">
                  {selectedWorkspace === 'intranet'
                    ? 'Opening workspace...'
                    : 'Enter internal workspace'}
                </span>

                <span className="workspace-arrow">↗</span>
              </div>

              <div className="workspace-card-decoration purple-decoration" />
            </button>

            {/* Extranet */}
            <button
              className={`workspace-option extranet-option ${
                selectedWorkspace === 'extranet' ? 'workspace-selected' : ''
              }`}
              onClick={() => enterWorkspace('extranet')}
              disabled={selectedWorkspace !== null}
            >
              <div className="workspace-card-top">
                <div className="workspace-icon green-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z" />
                  </svg>
                </div>

                <span className="workspace-card-tag green-tag">
                  EXTERNAL ACCESS
                </span>
              </div>

              <div className="workspace-details">
                <h3>Extranet</h3>
                <p>
                  A secure collaboration space for external
                  partners, clients and authorised collaborators.
                </p>
              </div>

              <div className="workspace-card-bottom">
                <span className="workspace-enter green-text">
                  {selectedWorkspace === 'extranet'
                    ? 'Opening workspace...'
                    : 'Enter partner workspace'}
                </span>

                <span className="workspace-arrow">↗</span>
              </div>

              <div className="workspace-card-decoration green-decoration" />
            </button>

          </div>
        </div>

        {/* Bottom information */}
        <div className="landing-information">
          <div className="information-item">
            <span className="information-icon">⌘</span>
            <div>
              <strong>One connected platform</strong>
              <span>Everything in one place</span>
            </div>
          </div>

          <div className="information-divider" />

          <div className="information-item">
            <span className="information-icon">◈</span>
            <div>
              <strong>Controlled access</strong>
              <span>Designed for secure collaboration</span>
            </div>
          </div>

          <div className="information-divider" />

          <div className="information-item">
            <span className="information-icon">⇄</span>
            <div>
              <strong>Seamless collaboration</strong>
              <span>Internal and external teams</span>
            </div>
          </div>
        </div>

      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Global Group</span>
        <span className="footer-separator">·</span>
        <span>Connected Workspace</span>

        <span className="footer-right">
          Designed for connected work.
        </span>
      </footer>

    </main>
  )
}

export default Landing
