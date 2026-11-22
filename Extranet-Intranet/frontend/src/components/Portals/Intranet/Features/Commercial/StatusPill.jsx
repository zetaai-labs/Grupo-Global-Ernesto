import { useT } from '../../../../../i18n'

function StatusPill({ status }) {
  const t = useT()
  return <span className={`zx-pill zx-${String(status).toLowerCase()}`}>{t(status)}</span>
}

export default StatusPill
