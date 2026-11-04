
import FeaturePage from '../../../Shared/FeaturePage'

function Emails() {
  return (
    <FeaturePage
      eyebrow="COMMUNICATION"
      title="Emails"
      description="Access the platform's email workspace and manage communications."
      icon="✉"
      action="＋ Compose email"
      stats={[
        { label: 'Inbox', value: '—', note: 'Received messages', icon: '✉' },
        { label: 'Sent', value: '—', note: 'Sent messages', icon: '↗' },
        { label: 'Drafts', value: '—', note: 'Unsent messages', icon: '▤' }
      ]}
      emptyMessage="Your email messages will appear here when email integration is configured."
    />
  )
}

export default Emails
