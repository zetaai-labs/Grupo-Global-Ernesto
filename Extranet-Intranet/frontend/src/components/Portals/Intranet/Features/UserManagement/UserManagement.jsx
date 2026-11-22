import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import { downloadFromApi } from '../../../../../utils/download'
import './UserManagement.css'
import { useT } from '../../../../../i18n'

const HR_MANAGED_ROLES = ['manager', 'employee']

function UserManagement() {
  const t = useT()
  // Super Admin and Technical Admin manage accounts; HR manages employees and managers.
  // Only the Super Admin exports/erases (GDPR). The API enforces these same limits.
  const currentRole = getUser()?.role
  const isHr = currentRole === 'hr'
  const canManage = isHr || ['admin', 'tech_admin'].includes(currentRole)
  const isSuperAdmin = currentRole === 'admin'
  const canAssignRole = (name) => (isHr ? HR_MANAGED_ROLES.includes(name) : isSuperAdmin || !['admin', 'tech_admin'].includes(name))
  const canChangeStatus = (user) => canManage
    && !['erased', 'expelled'].includes(user.status)
    && user.email !== getUser()?.email
    && (isSuperAdmin || !['admin', 'tech_admin'].includes(user.role))
    && (!isHr || HR_MANAGED_ROLES.includes(user.role))
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [regions, setRegions] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [form, setForm] = useState({ name: '', email: '', password: '', role_id: '', region_id: '', org_id: '' })
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [userResponse, metaResponse] = await Promise.all([
        api.get('/users'),
        api.get('/users/meta'),
      ])
      setUsers(userResponse.data?.data || [])
      const meta = metaResponse.data?.data || {}
      setRoles(meta.roles || [])
      setRegions(meta.regions || [])
      setOrganizations(meta.organizations || [])
      const firstRole = (meta.roles || []).find((role) => canAssignRole(role.name))
      if (!form.role_id && firstRole) {
        setForm((current) => ({ ...current, role_id: String(firstRole.id) }))
      }
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load users.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.role_id])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const addUser = async (event) => {
    event.preventDefault()
    try {
      await api.post('/users', {
        ...form,
        role_id: Number(form.role_id),
        region_id: form.region_id ? Number(form.region_id) : null,
        org_id: form.org_id || null,
      })
      setForm({ name: '', email: '', password: '', role_id: String(roles.find((role) => canAssignRole(role.name))?.id || ''), region_id: '', org_id: '' })
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not create the user.')
    }
  }

  const toggleStatus = async (user) => {
    try {
      await api.patch(`/users/${user.id}/status`, {
        status: user.status === 'active' ? 'suspended' : 'active',
      })
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not update this user.')
    }
  }

  // GDPR: right of access (export) and right to erasure.
  const exportData = async (user) => {
    try {
      await downloadFromApi(`/users/${user.id}/export`, `user-${user.id}-data.json`)
      setNotice(`Exported all data held about ${user.name}.`)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not export this user’s data.')
    }
  }

  const erase = async (user) => {
    const confirmed = window.confirm(
      `Permanently erase ${user.name} (${user.email})?\n\nPersonal data (mailbox, notifications, access) is deleted and their name is replaced with “Deleted user”. This cannot be undone.`,
    )
    if (!confirmed) return
    try {
      const response = await api.post(`/users/${user.id}/erase`)
      setNotice(response.data?.message || 'User erased.')
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not erase this user.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('ADMINISTRATION')}</div>
          <h1>{t('User Management')}</h1>
          <p>{t('Manage user profiles, workspace access and organisational permissions.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>Total users</span><span className="stat-icon">♙</span></div>
          <strong>{users.length}</strong>
          <small>Registered accounts</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Active users</span><span className="stat-icon">✓</span></div>
          <strong>{users.filter((user) => user.status === 'active').length}</strong>
          <small>Enabled accounts</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Access roles</span><span className="stat-icon">▤</span></div>
          <strong>{roles.length}</strong>
          <small>Configured permissions</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{notice}</div>}

      {canManage && (
      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{isHr ? 'Add an employee' : 'Add a user'}</h3>
            <p>{isHr ? 'HR can add employees and managers to Grupo Global entities.' : 'New accounts receive a role and an optional region.'}</p>
          </div>
        </div>
        <form className="users-form" onSubmit={addUser}>
          <input value={form.name} onChange={change('name')} placeholder="Full name" required />
          <input type="email" value={form.email} onChange={change('email')} placeholder="Email address" required />
          <input type="password" value={form.password} onChange={change('password')} placeholder="Password (min. 10 characters)" minLength={10} required />
          <select value={form.role_id} onChange={change('role_id')} required aria-label="Role">
            {roles
              .filter((role) => canAssignRole(role.name))
              .map((role) => <option key={role.id} value={role.id}>{role.name}{role.code ? ` — ${role.code}` : ''}</option>)}
          </select>
          <select value={form.region_id} onChange={change('region_id')} aria-label="Corridor">
            <option value="">No corridor</option>
            {regions.map((region) => <option key={region.id} value={region.id}>{region.code}</option>)}
          </select>
          <select value={form.org_id} onChange={change('org_id')} aria-label="Organisation">
            <option value="">No organisation</option>
            {organizations
              .filter((org) => !isHr || ['PARENT', 'BUSINESS_UNIT'].includes(org.org_type))
              .map((org) => <option key={org.org_id} value={org.org_id}>{org.legal_name}</option>)}
          </select>
          <button type="submit" className="primary-action">＋ Add user</button>
        </form>
      </div>
      )}

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>Accounts</h3>
            <p>{isHr ? 'Suspend or reactivate employees and managers.' : 'Suspend or reactivate access.'}</p>
          </div>
        </div>
        <div className="feature-list">
          {users.map((user) => (
            <div className="users-row" key={user.id}>
              <span className="list-item-icon">♙</span>
              <span className="list-item-copy">
                <strong>{user.name}</strong>
                <span>{user.email} · {user.role_code || user.role}{user.region ? ` · ${user.region}` : ''}{user.organization ? ` · ${user.organization}` : ''}</span>
              </span>
              <span className={`item-status ${user.status === 'active' ? 'status-active' : ''}`}>{user.status}</span>
              {canChangeStatus(user) && (
                <button type="button" onClick={() => toggleStatus(user)}>
                  {user.status === 'active' ? 'Suspend' : 'Activate'}
                </button>
              )}
              {isSuperAdmin && user.status !== 'erased' && (
                <>
                  <button type="button" onClick={() => exportData(user)} title="GDPR data export">Export data</button>
                  <button type="button" className="users-erase" onClick={() => erase(user)} title="GDPR right to erasure">Erase</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default UserManagement
