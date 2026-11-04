
import FeaturePage from '../../../Shared/FeaturePage'

function Overview() {
  return (
    <FeaturePage
      eyebrow="PARTNER WORKSPACE"
      title="Overview"
      description="Your secure workspace for accessing shared documents and collaborating with Global Group."
      icon="⌂"
      action="Browse documents"
      stats={[
        { label: 'Shared documents', value: '—', note: 'Available to you', icon: '▤' },
        { label: 'My submissions', value: '—', note: 'Uploaded documents', icon: '⇧' },
        { label: 'Shared links', value: '—', note: 'Accessible links', icon: '↗' }
      ]}
      items={[
        { name: 'Shared Documents', description: 'Access documents shared with you', icon: '▤' },
        { name: 'My Submissions', description: 'Review files you have submitted', icon: '⇧' },
        { name: 'Project Updates', description: 'Stay informed about project activity', icon: '◷' }
      ]}
    />
  )
}

export default Overview
