
import FeaturePage from '../../../Shared/FeaturePage'

function Backups() {
  return (
    <FeaturePage
      eyebrow="DATA PROTECTION"
      title="Backups"
      description="View backup records and access historical recovery points."
      icon="◷"
      action="Backup settings"
      stats={[
        { label: 'Backup records', value: '—', note: 'Available records', icon: '▤' },
        { label: 'Last backup', value: '—', note: 'Last recorded backup', icon: '◷' }
      ]}
      emptyMessage="Backup history will appear here when connected."
    />
  )
}

export default Backups
