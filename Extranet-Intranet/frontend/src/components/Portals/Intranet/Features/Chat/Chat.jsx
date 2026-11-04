
import { useState } from 'react'

const initialChats = [
  {
    id: 1,
    name: 'Development Team',
    message: 'The project update is ready.',
    time: '10:42 AM',
    unread: 2,
    messages: [
      { id: 1, sender: 'Alex', text: 'Good morning, everyone!', time: '10:30 AM' },
      { id: 2, sender: 'You', text: 'Good morning!', time: '10:32 AM' },
      { id: 3, sender: 'Alex', text: 'The project update is ready.', time: '10:42 AM' }
    ]
  },
  {
    id: 2,
    name: 'HR Department',
    message: 'Please check the new announcement.',
    time: '09:15 AM',
    unread: 0,
    messages: [
      { id: 1, sender: 'HR', text: 'Please check the new announcement.', time: '09:15 AM' }
    ]
  }
]

function Chat() {
  const [chats, setChats] = useState(initialChats)
  const [activeChat, setActiveChat] = useState(1)
  const [message, setMessage] = useState('')

  const currentChat = chats.find(chat => chat.id === activeChat)

  const sendMessage = (e) => {
    e.preventDefault()
    if (!message.trim()) return

    setChats(prev => prev.map(chat =>
      chat.id === activeChat
        ? {
            ...chat,
            message: message,
            time: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            }),
            messages: [
              ...chat.messages,
              {
                id: Date.now(),
                sender: 'You',
                text: message.trim(),
                time: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })
              }
            ]
          }
        : chat
    ))

    setMessage('')
  }

  return (
    <div className="communication-page">
      <header className="communication-header">
        <div>
          <span className="communication-eyebrow">COMMUNICATION</span>
          <h1>Team Chat</h1>
          <p>Stay connected with colleagues and teams.</p>
        </div>
        <span className="communication-status">● Internal workspace</span>
      </header>

      <div className="chat-container">
        <aside className="chat-sidebar">
          <h3>Conversations</h3>

          {chats.map(chat => (
            <button
              key={chat.id}
              className={`chat-contact ${activeChat === chat.id ? 'active' : ''}`}
              onClick={() => setActiveChat(chat.id)}
            >
              <div className="chat-avatar">
                {chat.name.charAt(0)}
              </div>

              <div className="chat-contact-info">
                <strong>{chat.name}</strong>
                <span>{chat.message}</span>
              </div>

              <div className="chat-contact-meta">
                <small>{chat.time}</small>
                {chat.unread > 0 && <b>{chat.unread}</b>}
              </div>
            </button>
          ))}
        </aside>

        <section className="chat-conversation">
          {currentChat && (
            <>
              <div className="chat-conversation-header">
                <div className="chat-avatar">
                  {currentChat.name.charAt(0)}
                </div>
                <div>
                  <strong>{currentChat.name}</strong>
                  <span>Conversation</span>
                </div>
              </div>

              <div className="chat-messages">
                {currentChat.messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`chat-message ${msg.sender === 'You' ? 'sent' : 'received'}`}
                  >
                    <span className="chat-sender">{msg.sender}</span>
                    <p>{msg.text}</p>
                    <small>{msg.time}</small>
                  </div>
                ))}
              </div>

              <form className="chat-input-area" onSubmit={sendMessage}>
                <input
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Write a message..."
                />
                <button type="submit">Send ↗</button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default Chat
