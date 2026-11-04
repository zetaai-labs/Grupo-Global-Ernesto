
import FeaturePage from '../../../Shared/FeaturePage'

function UserManagement() {
  return (
    <FeaturePage
      eyebrow="ADMINISTRATION"
      title="User Management"
      description="Manage user profiles, workspace access and organisational permissions."
      icon="♙"
      action="＋ Add user"
      stats={[
        { label: 'Total users', value: '—', note: 'Registered accounts', icon: '♙' },
        { label: 'Active users', value: '—', note: 'Enabled accounts', icon: '✓' },
        { label: 'Access roles', value: '—', note: 'Configured permissions', icon: '▤' }
      ]}
      emptyMessage="User accounts and permission details will appear here."
    />
  )
}

export default UserManagement
