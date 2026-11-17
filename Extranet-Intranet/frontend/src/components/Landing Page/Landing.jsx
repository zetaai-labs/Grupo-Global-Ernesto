import './Landing.css'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Landing() {
  const navigate = useNavigate()

  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedWorkspace, setSelectedWorkspace] = useState(null)
  const [progress, setProgress] = useState(0)
  const [activeFeature, setActiveFeature] = useState(null)
  const [activeRegion, setActiveRegion] = useState(null)
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setShowWelcome(true), 150)
    return () => clearTimeout(timer)
  }, [])

  const hour = currentTime.getHours()

  const greeting =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
    'Good evening'

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
    if (selectedWorkspace) return

    setSelectedWorkspace(workspace)
    setProgress(0)

    let value = 0

    const interval = setInterval(() => {
      value += 10
      setProgress(Math.min(value, 100))

      if (value >= 100) {
        clearInterval(interval)
        navigate(`/${workspace}`)
      }
    }, 35)
  }

  const features = [
    {
      icon: '▤',
      title: 'Centralised access',
      description: 'Access your organisation’s workspace and resources from one place.'
    },
    {
      icon: '◇',
      title: 'Secure collaboration',
      description: 'A structured environment for internal and external collaboration.'
    },
    {
      icon: '⇄',
      title: 'Connected teams',
      description: 'Bring colleagues, partners and collaborators together.'
    }
  ]


  const globalRegions = [
    {
      id: 'eu',
      flag: '🇪🇺',
      name: 'European Union',
      label: 'EUROPE',
      description: 'Connecting organisations and partners across the European Union.',
      type: 'country-flag'
    },
    {
      id: 'uae',
      flag: '🇦🇪',
      name: 'United Arab Emirates',
      label: 'MIDDLE EAST',
      description: 'Supporting collaboration and business connections in the UAE.',
      type: 'country-flag'
    },
    {
      id: 'canada',
      flag: '🇨🇦',
      name: 'Canada',
      label: 'NORTH AMERICA',
      description: 'Extending our connected workspace to partners across Canada.',
      type: 'country-flag'
    },
    {
      id: 'india',
      flag: '🇮🇳',
      name: 'India',
      label: 'SOUTH ASIA',
      description: 'Building stronger connections with teams and organisations in India.',
      type: 'country-flag'
    },
    {
      id: 'latam',
      flag: '🌎',
      name: 'Latin America',
      label: 'REGIONAL NETWORK',
      description: 'Connecting businesses and partners throughout Latin America.',
      type: 'region-symbol'
    },
    {
      id: 'usa',
      flag: '🇺🇸',
      name: 'United States',
      label: 'NORTH AMERICA',
      description: 'Enabling collaboration with organisations across the United States.',
      type: 'country-flag'
    },
    {
      id: 'morocco',
      flag: '🇲🇦',
      name: 'Morocco',
      label: 'NORTH AFRICA',
      description: 'Strengthening business connections with partners in Morocco.',
      type: 'country-flag'
    },
    {
      id: 'africa',
      flag: '🌍',
      name: 'Africa',
      label: 'REGIONAL NETWORK',
      description: 'Building a connected network across the African continent.',
      type: 'region-symbol'
    }
  ]

  return (
    <main className={`landing-page ${showWelcome ? 'landing-visible' : ''}`}>

      {/* Background */}
      <div className="landing-grid-bg" />
      <div className="landing-glow landing-glow-one" />
      <div className="landing-glow landing-glow-two" />
      <div className="floating-orb orb-one" />
      <div className="floating-orb orb-two" />
      <div className="floating-orb orb-three" />

      {/* Navbar */}
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

      {/* Main */}
      <section className="landing-content">

        {/* Hero */}
        <div className="landing-hero">
          <div className="landing-eyebrow">
            <span className="eyebrow-line" />
            YOUR DIGITAL WORKSPACE
            <span className="eyebrow-line" />
          </div>

          <div className="landing-greeting">
            {greeting} <span>✦</span>
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
            stay connected in one connected environment.
          </p>

          {/* Interactive highlights */}
          <div className="hero-highlights">
            {features.map((feature, index) => (
              <button
                key={feature.title}
                className={`hero-highlight ${
                  activeFeature === index ? 'highlight-active' : ''
                }`}
                onClick={() =>
                  setActiveFeature(activeFeature === index ? null : index)
                }
                aria-expanded={activeFeature === index}
              >
                <span className="highlight-check">✓</span>
                {feature.title}
              </button>
            ))}
          </div>

          {activeFeature !== null && (
            <div className="feature-detail">
              <span className="feature-detail-icon">
                {features[activeFeature].icon}
              </span>
              <div>
                <strong>{features[activeFeature].title}</strong>
                <p>{features[activeFeature].description}</p>
              </div>
              <button
                onClick={() => setActiveFeature(null)}
                aria-label="Close feature information"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Global Presence */}
        <section className="global-presence">
          <div className="global-presence-heading">
            <div>
              <span className="section-eyebrow">OUR GLOBAL REACH</span>
              <h2>Connected Across Borders</h2>
              <p>Building connections across countries and regions.</p>
            </div>

            <div className="global-presence-indicator">
              <span className="global-indicator-dot" />
              GLOBAL NETWORK
            </div>
          </div>

          <div className="global-regions-grid">
            {globalRegions.map((region, index) => (
              <button
                key={region.id}
                type="button"
                className={`global-region-card ${
                  activeRegion === region.id ? 'region-active' : ''
                }`}
                style={{ '--region-index': index }}
                onClick={() =>
                  setActiveRegion(activeRegion === region.id ? null : region.id)
                }
                aria-pressed={activeRegion === region.id}
              >
                <span className="region-card-number">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <span
                  className={`region-flag ${
                    region.type === 'region-symbol' ? 'regional-symbol' : ''
                  }`}
                >
                  {region.flag}
                </span>

                <span className="region-name">{region.name}</span>
                <span className="region-label">{region.label}</span>
                <span className="region-card-arrow">↗</span>
                <span className="region-card-glow" />
              </button>
            ))}
          </div>

          {activeRegion && (
            <div className="global-region-detail">
              <div className="region-detail-flag">
                {globalRegions.find(region => region.id === activeRegion)?.flag}
              </div>

              <div className="region-detail-content">
                <span>GLOBAL CONNECTION</span>
                <strong>
                  {globalRegions.find(region => region.id === activeRegion)?.name}
                </strong>
                <p>
                  {globalRegions.find(region => region.id === activeRegion)?.description}
                </p>
              </div>

              <button
                type="button"
                className="region-detail-close"
                onClick={() => setActiveRegion(null)}
                aria-label="Close region information"
              >
                ×
              </button>
            </div>
          )}
        </section>

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
                    ? `Opening... ${progress}%`
                    : 'Enter internal workspace'}
                </span>

                <span className="workspace-arrow">↗</span>
              </div>

              {selectedWorkspace === 'intranet' && (
                <div className="workspace-progress">
                  <div style={{ width: `${progress}%` }} />
                </div>
              )}

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
                  A collaboration space for external partners,
                  clients and authorised collaborators.
                </p>
              </div>

              <div className="workspace-card-bottom">
                <span className="workspace-enter green-text">
                  {selectedWorkspace === 'extranet'
                    ? `Opening... ${progress}%`
                    : 'Enter partner workspace'}
                </span>

                <span className="workspace-arrow">↗</span>
              </div>

              {selectedWorkspace === 'extranet' && (
                <div className="workspace-progress">
                  <div style={{ width: `${progress}%` }} />
                </div>
              )}

              <div className="workspace-card-decoration green-decoration" />
            </button>

          </div>
        </div>

        {/* Information strip */}
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
        <span>© {currentTime.getFullYear()} Global Group</span>
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
