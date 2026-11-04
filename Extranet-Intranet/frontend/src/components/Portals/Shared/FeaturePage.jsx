
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
  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        {action && (
          <button className="primary-action">
            <span>＋</span> {action}
          </button>
        )}
      </div>

      {stats.length > 0 && (
        <div className="feature-stats">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-top">
                <span>{stat.label}</span>
                <span className="stat-icon">{stat.icon}</span>
              </div>
              <strong>{stat.value}</strong>
              <small>{stat.note}</small>
            </div>
          ))}
        </div>
      )}

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{title}</h3>
            <p>Manage and access your {title.toLowerCase()}.</p>
          </div>

          <button className="secondary-action">View all ↗</button>
        </div>

        {items.length > 0 ? (
          <div className="feature-list">
            {items.map((item) => (
              <div className="feature-list-row" key={item.name}>
                <div className="list-item-icon">{item.icon || icon}</div>
                <div className="list-item-copy">
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </div>
                <span className={`item-status ${item.statusType || ''}`}>
                  {item.status || 'Available'}
                </span>
                <span className="list-item-arrow">↗</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">{icon}</div>
            <h3>No records available</h3>
            <p>{emptyMessage}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default FeaturePage
