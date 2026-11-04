
import FeaturePage from '../../../Shared/FeaturePage'

function CloudFolders() {
  return (
    <FeaturePage
      eyebrow="DOCUMENT MANAGEMENT"
      title="Cloud Folders"
      description="Access and organize corporate documents, folders and shared resources."
      icon="▤"
      action="＋ New folder"
      stats={[
        { label: 'Total folders', value: '—', note: 'Across your workspace', icon: '▤' },
        { label: 'Files', value: '—', note: 'Available documents', icon: '▧' },
        { label: 'Shared folders', value: '—', note: 'Collaborative access', icon: '⇄' }
      ]}
      emptyMessage="Your corporate folders will appear here."
    />
  )
}

export default CloudFolders
