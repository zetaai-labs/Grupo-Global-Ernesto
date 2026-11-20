import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import { downloadFromApi } from '../../../../../utils/download'
import './UserManagement.css'
import { useT } from '../../../../../i18n'

function UserManagement() {
  const t = useT()
  // HR sees a read-only directory; only admins can create or suspend accounts.
  const isAdmin = getUser()?.role === 'admin'
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [regions, setRegions] = useState([])
  const [form, setForm] = useState({ name: '', email: '', password: '', role_id: '', region_id: '' })
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
      if (!form.role_id && meta.roles?.length) {
        setForm((current) => ({ ...current, role_id: String(meta.roles[0].id) }))
      }
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load users.')
    }
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
      })
      setForm({ name: '', email: '', password: '', role_id: String(roles[0]?.id || ''), region_id: '' })
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

      {isAdmin && (
      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>Add a user</h3>
            <p>New accounts receive a role and an optional region.</p>
          </div>
        </div>
        <form className="users-form" onSubmit={addUser}>
          <input value={form.name} onChange={change('name')} placeholder="Full name" required />
          <input type="email" value={form.email} onChange={change('email')} placeholder="Email address" required />
          <input type="password" value={form.password} onChange={change('password')} placeholder="Password" required />
          <select value={form.role_id} onChange={change('role_id')} required>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <select value={form.region_id} onChange={change('region_id')}>
            <option value="">No region</option>
            {regions.map((region) => <option key={region.id} value={region.id}>{region.code}</option>)}
          </select>
          <button type="submit" className="primary-action">＋ Add user</button>
        </form>
      </div>
      )}

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>Accounts</h3>
            <p>{isAdmin ? 'Suspend or reactivate access.' : 'Employee directory (read-only for HR).'}</p>
          </div>
        </div>
        <div className="feature-list">
          {users.map((user) => (
            <div className="users-row" key={user.id}>
              <span className="list-item-icon">♙</span>
              <span className="list-item-copy">
                <strong>{user.name}</strong>
                <span>{user.email} · {user.role}{user.region ? ` · ${user.region}` : ''}</span>
              </span>
              <span className={`item-status ${user.status === 'active' ? 'status-active' : ''}`}>{user.status}</span>
              {isAdmin && user.status !== 'erased' && (
                <>
                  <button type="button" onClick={() => toggleStatus(user)}>
                    {user.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
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
