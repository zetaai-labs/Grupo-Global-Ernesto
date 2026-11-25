import { useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { useT, dateLocale } from '../../../../../i18n'
import './ProjectUpdates.css'
import { translateServer } from '../../../../../i18n/serverMessages'

const PHASE_LABELS = { INITIATION: 'Initiation', PLANNING: 'Planning', EXECUTION: 'Execution', MONITORING: 'Monitoring', COMPLETED: 'Completed' }
const STATUS_LABELS = { PLANNED: 'Planned', IN_PROGRESS: 'In progress', DONE: 'Done', BLOCKED: 'Blocked' }

/** Extranet: projects the organisation takes part in, with the milestones shared with partners. */
function ProjectUpdates() {
  const t = useT()
  const [projects, setProjects] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/projects/shared')
      .then((response) => setProjects(response.data?.data || []))
      .catch((err) => setError(err.response?.data?.message || 'Could not load project updates.'))
      .finally(() => setLoaded(true))
  }, [])

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('PROJECT INFORMATION')}</div>
          <h1>{t('Project Updates')}</h1>
          <p>{t('Milestones of the projects your organisation takes part in, shared by Grupo Global.')}</p>
        </div>
      </div>

      {error && <div className="cloud-notice" role="alert">{translateServer(error)}</div>}

      {loaded && !projects.length && (
        <div className="feature-panel feature-empty-state">
          <div className="empty-icon">◷</div>
          <h3>{t('No shared projects yet')}</h3>
          <p>{t('When Grupo Global links your organisation to a project, its milestones appear here.')}</p>
        </div>
      )}

      <div className="pu-list">
        {projects.map((project) => {
          const done = project.milestones.filter((milestone) => milestone.status === 'DONE').length
          return (
            <article key={project.project_id} className="feature-panel pu-card">
              <header>
                <div>
                  <h2>{project.title}</h2>
                  <p>{project.lead_entity_name}{project.end_date ? ` · ${t('target')} ${new Date(project.end_date).toLocaleDateString(dateLocale())}` : ''}</p>
                </div>
                <span className="pu-phase">{t(PHASE_LABELS[project.phase])}</span>
              </header>
              {project.milestones.length ? (
                <>
                  <span className="pu-progress" aria-label={t('{done} of {total} milestones done', { done, total: project.milestones.length })}>
                    <i style={{ width: `${Math.round((done / project.milestones.length) * 100)}%` }} />
                  </span>
                  <ol className="pu-milestones">
                    {project.milestones.map((milestone) => (
                      <li key={milestone.milestone_id} className={`pu-${milestone.status.toLowerCase()}`}>
                        <span className="pu-dot" aria-hidden="true">{milestone.status === 'DONE' ? '✓' : ''}</span>
                        <span className="pu-copy">
                          <strong>{milestone.title}</strong>
                          <small>{milestone.due_date ? new Date(milestone.due_date).toLocaleDateString(dateLocale()) : t('No date')} · {t(STATUS_LABELS[milestone.status])}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : <p className="pu-muted">{t('No milestones shared yet.')}</p>}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default ProjectUpdates
