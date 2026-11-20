import { Link } from 'react-router-dom'
import './Unauthorized.css'
import { useT } from '../../i18n'

function Unauthorized() {
  const t = useT()
  return (
    <main className="unauthorized-page">
      <div className="unauthorized-card">
        <span className="unauthorized-code">403</span>
        <h1>{t('Access restricted')}</h1>
        <p>{t('Your account does not have permission to open this workspace.')}</p>
        <div className="unauthorized-actions">
          <Link to="/">Return home</Link>
          <Link to="/login">Sign in with another account</Link>
        </div>
      </div>
    </main>
  )
}

export default Unauthorized
