import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import api from '../../../api/client'
import { getToken, getUser } from '../../../api/auth'
import './ChatWorkspace.css'
import { useT } from '../../../i18n'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'

function timeLabel(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ChatWorkspace({ portal = 'intranet' }) {
  const t = useT()
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const socketRef = useRef(null)
  const user = getUser()

  const loadConversations = useCallback(async () => {
    try {
      const response = await api.get('/chat/conversations', { params: { portal } })
      const list = response.data?.data || []
      setConversations(list)
      if (!activeId && list.length) setActiveId(list[0].id)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load conversations.')
    }
  }, [portal, activeId])

  const loadMessages = useCallback(async (id) => {
    if (!id) return
    try {
      const response = await api.get(`/chat/conversations/${id}/messages`)
      setMessages(response.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load messages.')
    }
  }, [])

  useEffect(() => {
    loadConversations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portal])

  useEffect(() => {
    loadMessages(activeId)
  }, [activeId, loadMessages])

  useEffect(() => {
    const token = getToken()
    if (!token) return undefined

    const socket = io(SOCKET_URL, { auth: { token } })
    socketRef.current = socket
    socket.on('connect_error', () => setNotice('Real-time connection unavailable.'))

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!socketRef.current || !activeId) return
    socketRef.current.emit('chat:join', activeId)

    const onMessage = (payload) => {
      if (String(payload.conversation_id) !== String(activeId)) return
      setMessages((current) =>
        current.some((item) => item.id === payload.id) ? current : [...current, payload],
      )
    }
    socketRef.current.on('chat:message', onMessage)

    return () => socketRef.current?.off('chat:message', onMessage)
  }, [activeId])

  const send = async (event) => {
    event.preventDefault()
    if (!message.trim() || !activeId) return
    try {
      const response = await api.post(`/chat/conversations/${activeId}/messages`, { body: message.trim() })
      const payload = response.data?.data
      socketRef.current?.emit('chat:message', {
        ...payload,
        conversation_id: activeId,
        sender_name: payload.sender_name || user?.name || 'You',
      })
      setMessage('')
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not send the message.')
    }
  }

  const active = conversations.find((conversation) => conversation.id === activeId)

  return (
    <div className="communication-page">
      <header className="communication-header">
        <div>
          <span className="communication-eyebrow">{t('COMMUNICATION')}</span>
          <h1>{portal === 'intranet' ? 'Team Chat' : 'Partner Chat'}</h1>
          <p>Stay connected with {portal === 'intranet' ? 'colleagues and teams' : 'external partners'}.</p>
        </div>
        <span className="communication-status">● {portal === 'intranet' ? 'Internal workspace' : 'Partner workspace'}</span>
      </header>

      {notice && <div className="cloud-notice">{notice}</div>}

      <div className="chat-container">
        <aside className="chat-sidebar">
          <h3>Conversations</h3>
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`chat-contact ${activeId === conversation.id ? 'active' : ''}`}
              onClick={() => setActiveId(conversation.id)}
            >
              <div className="chat-avatar">{conversation.name.charAt(0)}</div>
              <div className="chat-contact-info">
                <strong>{conversation.name}</strong>
                <span>{conversation.last_message || 'No messages yet'}</span>
              </div>
            </button>
          ))}
          {!conversations.length && <p className="chat-empty">No conversations available.</p>}
        </aside>

        <section className="chat-conversation">
          {active && (
            <>
              <div className="chat-conversation-header">
                <div className="chat-avatar">{active.name.charAt(0)}</div>
                <div><strong>{active.name}</strong><span>Conversation</span></div>
              </div>

              <div className="chat-messages">
                {messages.map((item) => (
                  <div
                    key={item.id}
                    className={`chat-message ${String(item.user_id) === String(user?.id) ? 'sent' : 'received'}`}
                  >
                    <span className="chat-sender">{item.sender_name}</span>
                    <p>{item.body}</p>
                    <small>{timeLabel(item.created_at)}</small>
                  </div>
                ))}
                {!messages.length && <p className="chat-empty">Start the conversation.</p>}
              </div>

              <form className="chat-input-area" onSubmit={send}>
                <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a message…" />
                <button type="submit">Send ↗</button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default ChatWorkspace
