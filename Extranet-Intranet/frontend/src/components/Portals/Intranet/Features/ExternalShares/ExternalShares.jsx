
import FeaturePage from '../../../Shared/FeaturePage'

function ExternalShares() {
  return (
    <FeaturePage
      eyebrow="EXTERNAL COLLABORATION"
      title="External Shares"
      description="Manage secure shared workspaces for partners, vendors and clients."
      icon="♧"
      action="＋ Create external share"
      stats={[
        { label: 'Shared workspaces', value: '—', note: 'External collaborations', icon: '⇄' },
        { label: 'External users', value: '—', note: 'Connected collaborators', icon: '♙' }
      ]}
      emptyMessage="Your external sharing workspaces will appear here."
    />
  )
}

export default ExternalShares
