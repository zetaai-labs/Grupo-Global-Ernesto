
import FeaturePage from '../../../Shared/FeaturePage'

function WebReceivedFiles() {
  return (
    <FeaturePage
      eyebrow="INCOMING DOCUMENTS"
      title="Web Received Files"
      description="Review and organize documents uploaded by external users."
      icon="⇩"
      action="＋ Request files"
      stats={[
        { label: 'Received files', value: '—', note: 'All incoming files', icon: '⇩' },
        { label: 'Pending review', value: '—', note: 'Awaiting attention', icon: '◷' }
      ]}
      emptyMessage="Files submitted by external users will appear here."
    />
  )
}

export default WebReceivedFiles
