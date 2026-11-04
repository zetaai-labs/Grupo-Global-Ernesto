
import FeaturePage from '../../../Shared/FeaturePage'

function SharedDocuments() {
  return (
    <FeaturePage
      eyebrow="DOCUMENT ACCESS"
      title="Shared Documents"
      description="Browse documents and folders shared with your external account."
      icon="▤"
      action={null}
      stats={[
        { label: 'Shared folders', value: '—', note: 'Accessible folders', icon: '▤' },
        { label: 'Shared files', value: '—', note: 'Available documents', icon: '▧' }
      ]}
      emptyMessage="Documents shared with your account will appear here."
    />
  )
}

export default SharedDocuments
