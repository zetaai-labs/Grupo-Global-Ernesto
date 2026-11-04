
import FeaturePage from '../../../Shared/FeaturePage'

function SystemWebPage() {
  return (
    <FeaturePage
      eyebrow="CORPORATE INFORMATION"
      title="System Web Page"
      description="Manage corporate announcements, news and organisational resources."
      icon="▣"
      action="＋ Create announcement"
      stats={[
        { label: 'Announcements', value: '—', note: 'Published updates', icon: '▣' },
        { label: 'Resources', value: '—', note: 'Available resources', icon: '▤' }
      ]}
      emptyMessage="Corporate announcements and updates will appear here."
    />
  )
}

export default SystemWebPage
