import { useT } from '../../../i18n'
function FeaturePage({
  eyebrow,
  title,
  description,
  icon = '▤',
  action = 'Create new',
  stats = [],
  items = [],
  emptyMessage = 'Your records will appear here.'
}) {
  const t = useT()
  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t(eyebrow)}</div>
          <h1>{t(title)}</h1>
          <p>{t(description)}</p>
        </div>

        {action && (
          <button className="primary-action">
            <span>＋</span> {t(action)}
          </button>
        )}
      </div>

      {stats.length > 0 && (
        <div className="feature-stats">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-top">
                <span>{t(stat.label)}</span>
                <span className="stat-icon">{stat.icon}</span>
              </div>
              <strong>{stat.value}</strong>
              <small>{t(stat.note)}</small>
            </div>
          ))}
        </div>
      )}

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t(title)}</h3>
            <p>{t('Manage and access everything in {area}.', { area: t(title) })}</p>
          </div>

          <button className="secondary-action">{t("View all ↗")}</button>
        </div>

        {items.length > 0 ? (
          <div className="feature-list">
            {items.map((item) => (
              <div className="feature-list-row" key={item.name}>
                <div className="list-item-icon">{item.icon || icon}</div>
                <div className="list-item-copy">
                  <strong>{t(item.name)}</strong>
                  <span>{t(item.description)}</span>
                </div>
                <span className={`item-status ${item.statusType || ''}`}>
                  {t(item.status || 'Available')}
                </span>
                <span className="list-item-arrow">↗</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">{icon}</div>
            <h3>{t("No records available")}</h3>
            <p>{t(emptyMessage)}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default FeaturePage
