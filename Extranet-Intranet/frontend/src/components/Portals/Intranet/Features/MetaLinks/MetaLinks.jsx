
import FeaturePage from '../../../Shared/FeaturePage'

function MetaLinks() {
  return (
    <FeaturePage
      eyebrow="SECURE FILE SHARING"
      title="MetaLinks"
      description="Create and manage secure links for controlled document distribution."
      icon="↗"
      action="＋ Create MetaLink"
      stats={[
        { label: 'Active links', value: '—', note: 'Currently available', icon: '↗' },
        { label: 'Expired links', value: '—', note: 'No longer active', icon: '◷' }
      ]}
      emptyMessage="Your generated MetaLinks will appear here."
    />
  )
}

export default MetaLinks
