import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import CcDesk from './CcDesk'
import { CcAgents, CcCampaigns, CcLive } from './CcSupervisor'
import '../Commercial/Commercial.css'
import './CallCenter.css'

/**
 * Joint Grupo Global / Zeta call center. Agents see their desk; supervisors (Super Admin, Tech Admin,
 * managers) also see the live board, campaigns and agents.
 */
function CallCenter() {
  const t = useT()
  const [desk, setDesk] = useState(null)
  const [tab, setTab] = useState(null)
  const [notice, setNotice] = useState('')

  const reload = useCallback(async () => {
    try {
      const data = (await api.get('/call-center/me')).data.data
      setDesk(data)
      setTab((current) => current || (data.agent ? 'desk' : data.supervisor ? 'live' : null))
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message) || t('Could not load this page.'))
    }
  }, [t])
  useEffect(() => { reload() }, [reload])

  if (!desk) return <section className="feature-page"><div className="page-loading" role="status" aria-live="polite" />{notice && <p>{notice}</p>}</section>

  const tabs = [
    ...(desk.agent ? [['desk', 'My desk']] : []),
    ...(desk.supervisor ? [['live', 'Live board'], ['campaigns', 'Campaigns'], ['agents', 'Agents']] : []),
  ]

  return (
    <section className="feature-page cc">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('COMMUNICATION')}</div>
          <h1>{t('Call Center')}</h1>
          <p>{t('Joint call center of Grupo Global and Zeta AI Labs: campaigns, calls, callbacks and live results across every region.')}</p>
        </div>
      </div>

      {notice && <div className="cloud-notice zx-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label={t('Dismiss')}>✕</button></div>}

      {!tabs.length ? (
        <div className="feature-empty-state">
          <div className="empty-icon">☎</div>
          <h3>{t('You are not set up as a call center agent')}</h3>
          <p>{t('Ask a supervisor (Super Admin, Tech Admin or a manager) to add you on the Agents tab.')}</p>
        </div>
      ) : (
        <>
          <div className="zx-tabs" role="tablist">
            {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{t(label)}</button>)}
          </div>
          {tab === 'desk' && desk.agent && <CcDesk desk={desk} reload={reload} notify={setNotice} />}
          {tab === 'live' && <CcLive />}
          {tab === 'campaigns' && <CcCampaigns notify={setNotice} />}
          {tab === 'agents' && <CcAgents notify={(message) => { setNotice(message); reload() }} />}
        </>
      )}
    </section>
  )
}

export default CallCenter
