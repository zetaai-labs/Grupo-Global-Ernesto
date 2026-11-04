
import FeaturePage from '../../../Shared/FeaturePage'

function MySubmissions() {
  return (
    <FeaturePage
      eyebrow="FILE SUBMISSIONS"
      title="My Submissions"
      description="Upload and track documents submitted to Global Group."
      icon="⇧"
      action="＋ Upload document"
      stats={[
        { label: 'Submitted files', value: '—', note: 'Total submissions', icon: '⇧' },
        { label: 'Under review', value: '—', note: 'Awaiting review', icon: '◷' },
        { label: 'Approved', value: '—', note: 'Reviewed submissions', icon: '✓' }
      ]}
      emptyMessage="Your submitted files and their review status will appear here."
    />
  )
}

export default MySubmissions
