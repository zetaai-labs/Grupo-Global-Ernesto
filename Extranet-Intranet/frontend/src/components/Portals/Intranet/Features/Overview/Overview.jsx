
import FeaturePage from '../../../Shared/FeaturePage'

function Overview() {
  return (
    <FeaturePage
      eyebrow="INTERNAL WORKSPACE"
      title="Overview"
      description="Your central workspace for corporate documents, collaboration and daily operations."
      icon="⌂"
      action="Explore workspace"
      stats={[
        { label: 'Cloud folders', value: '—', note: 'Connected folders', icon: '▤' },
        { label: 'Pending workflows', value: '—', note: 'Awaiting action', icon: '⟳' },
        { label: 'External shares', value: '—', note: 'Shared workspaces', icon: '⇄' },
        { label: 'Storage usage', value: '—', note: 'Storage information', icon: '◷' }
      ]}
      items={[
        { name: 'Cloud Folders', description: 'Browse corporate files and folders', icon: '▤' },
        { name: 'AutoFlow', description: 'Review document workflows and approvals', icon: '⟳' },
        { name: 'Web Received Files', description: 'Review files received from external users', icon: '⇩' }
      ]}
    />
  )
}

export default Overview
