
import FeaturePage from '../../../Shared/FeaturePage'

function AutoFlow() {
  return (
    <FeaturePage
      eyebrow="WORKFLOW AUTOMATION"
      title="AutoFlow"
      description="Manage document approvals, task assignments and automated workflows."
      icon="⟳"
      action="＋ Create workflow"
      stats={[
        { label: 'Active workflows', value: '—', note: 'Currently running', icon: '⟳' },
        { label: 'Pending approvals', value: '—', note: 'Require your attention', icon: '◷' },
        { label: 'Completed', value: '—', note: 'Completed workflows', icon: '✓' }
      ]}
      emptyMessage="Your workflows and pending approvals will appear here."
    />
  )
}

export default AutoFlow
