import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../../api/client'
import { getSharedSocket } from '../../../api/socket'
import './NotificationBell.css'
import AlertsToggle from '../../../pwa/AlertsToggle'
import { useT, dateLocale } from '../../../i18n'
import { translateServer } from '../../../i18n/serverMessages'

const TYPE_ICONS = {
  workflow: '⟳',
  share: '♧',
  chat: '💬',
  'received-file': '⇩',
  announcement: '▣',
  calendar: '◷',
  email: '✉',
  meeting: '📹',
}

function timeAgo(value, t) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return t('just now')
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return t('{n} min ago', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('{n} h ago', { n: hours })
  return new Date(value).toLocaleDateString(dateLocale())
}

/** Bell icon with unread badge and dropdown; new notifications arrive live over Socket.IO. */
function NotificationBell({ accent = '' }) {
  const t = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const response = await api.get('/notifications')
      setItems(response.data?.data || [])
      setUnread(response.data?.unread || 0)
    } catch {
      // The bell stays empty if the API is unreachable.
    }
  }, [])

  useEffect(() => {
    load()
    const socket = getSharedSocket()
    if (!socket) return undefined
    const onNew = (notification) => {
      setItems((current) => [notification, ...current].slice(0, 50))
      setUnread((count) => count + 1)
    }
    socket.on('notification:new', onNew)
    socket.on('connect', load)
    return () => {
      socket.off('notification:new', onNew)
      socket.off('connect', load)
    }
  }, [load])

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const openItem = async (item) => {
    if (!item.read_at) {
      setItems((current) => current.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)))
      setUnread((count) => Math.max(0, count - 1))
      api.post(`/notifications/${item.id}/read`).catch(() => {})
    }
    setOpen(false)
    if (item.link) navigate(item.link)
  }

  const markAll = async () => {
    setItems((current) => current.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    setUnread(0)
    api.post('/notifications/read-all').catch(() => {})
  }

  return (
    <div className="notification-bell" ref={wrapperRef}>
      <button
        type="button"
        className="topbar-icon-btn"
        title={t('Notifications')}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        onClick={() => setOpen((value) => !value)}
      >
        🔔
        {unread > 0 && <span className={`notification-count ${accent}`}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel-head">
            <strong>{t('Notifications')}</strong>
            {unread > 0 && (
              <button type="button" onClick={markAll}>{t('Mark all as read')}</button>
            )}
          </div>
          <div className="notification-list">
            {!items.length && <p className="notification-empty">{t("You're all caught up.")}</p>}
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`notification-item ${item.read_at ? '' : 'is-unread'}`}
                onClick={() => openItem(item)}
              >
                <span className="notification-icon">{TYPE_ICONS[item.type] || '•'}</span>
                <span className="notification-copy">
                  <strong>{translateServer(item.title)}</strong>
                  {item.body && <span>{translateServer(item.body)}</span>}
                  <small>{timeAgo(item.created_at, t)}</small>
                </span>
              </button>
            ))}
          </div>
          <AlertsToggle />
        </div>
      )}
    </div>
  )
}

export default NotificationBell
