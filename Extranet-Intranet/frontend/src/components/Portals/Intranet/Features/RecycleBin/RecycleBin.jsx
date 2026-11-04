
import FeaturePage from '../../../Shared/FeaturePage'

function RecycleBin() {
  return (
    <FeaturePage
      eyebrow="DOCUMENT RECOVERY"
      title="Recycle Bin"
      description="Review deleted files and restore items when required."
      icon="▧"
      action={null}
      stats={[
        { label: 'Deleted items', value: '—', note: 'Items in recycle bin', icon: '▧' }
      ]}
      emptyMessage="There are currently no deleted items to display."
    />
  )
}

export default RecycleBin
