import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, HelpCircle, Megaphone, Pin, Trash2, CornerDownRight, Send, RefreshCw } from 'lucide-react'
import { useToast } from '../Toast'
import { API_BASE } from '../../api/api'

function DiscussionBoard({ user, trainingId }) {
  const { success, error: showError } = useToast()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('ALL') // ALL, DISCUSSION, QUESTION, ANNOUNCEMENT
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostType, setNewPostType] = useState('DISCUSSION') // DISCUSSION, QUESTION, ANNOUNCEMENT
  const [newPostPinned, setNewPostPinned] = useState(false)
  const [replyingToId, setReplyingToId] = useState(null)
  const [replyContent, setReplyContent] = useState('')

  const isTrainerOrAdmin = user.role === 'TRAINER' || user.role === 'ADMIN'
  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user.token}`
  })

  const fetchPosts = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/discussion/${trainingId}`, { headers: authHeaders() })
      const d = await r.json()
      if (r.ok && d.success) {
        setPosts(d.posts || [])
      } else {
        showError(d.error || 'Failed to load discussion posts')
      }
    } catch (e) {
      showError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (trainingId) {
      fetchPosts()
    }
  }, [trainingId])

  const handleCreatePost = async (e) => {
    e.preventDefault()
    if (!newPostContent.trim()) return

    try {
      const r = await fetch(`${API_BASE}/discussion/${trainingId}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          content: newPostContent,
          type: newPostType,
          isPinned: newPostType === 'ANNOUNCEMENT' ? true : newPostPinned
        })
      })
      const d = await r.json()
      if (r.ok && d.success) {
        success('Post created successfully!')
        setNewPostContent('')
        setNewPostPinned(false)
        fetchPosts()
      } else {
        showError(d.error || 'Failed to create post')
      }
    } catch (e) {
      showError(e.message)
    }
  }

  const handleCreateReply = async (e, parentId) => {
    e.preventDefault()
    if (!replyContent.trim()) return

    try {
      const r = await fetch(`${API_BASE}/discussion/${trainingId}/posts/${parentId}/reply`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content: replyContent })
      })
      const d = await r.json()
      if (r.ok && d.success) {
        success('Reply posted!')
        setReplyContent('')
        setReplyingToId(null)
        fetchPosts()
      } else {
        showError(d.error || 'Failed to post reply')
      }
    } catch (e) {
      showError(e.message)
    }
  }

  const handleTogglePin = async (post) => {
    try {
      const r = await fetch(`${API_BASE}/discussion/${trainingId}/posts/${post.id}/pin`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ isPinned: !post.isPinned })
      })
      const d = await r.json()
      if (r.ok && d.success) {
        success(post.isPinned ? 'Post unpinned.' : 'Post pinned successfully!')
        fetchPosts()
      } else {
        showError(d.error || 'Failed to pin post')
      }
    } catch (e) {
      showError(e.message)
    }
  }

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Are you sure you want to delete this post? This will delete all its replies.')) return

    try {
      const r = await fetch(`${API_BASE}/discussion/${trainingId}/posts/${postId}`, {
        method: 'DELETE',
        headers: authHeaders()
      })
      const d = await r.json()
      if (r.ok && d.success) {
        success('Post deleted successfully.')
        fetchPosts()
      } else {
        showError(d.error || 'Failed to delete post')
      }
    } catch (e) {
      showError(e.message)
    }
  }

  const getInitials = (name) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const filteredPosts = posts.filter(p => {
    if (activeTab === 'ALL') return true
    return p.type === activeTab
  })

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", color: 'var(--academic-text)' }}>
      {/* Tab controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 8, border: '1px solid var(--academic-border)' }}>
          {[
            { key: 'ALL', label: 'All Posts', icon: <MessageSquare size={14} /> },
            { key: 'DISCUSSION', label: 'Discussions', icon: <MessageSquare size={14} /> },
            { key: 'QUESTION', label: 'Q&A', icon: <HelpCircle size={14} /> },
            { key: 'ANNOUNCEMENT', label: 'Announcements', icon: <Megaphone size={14} /> }
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', borderRadius: 6,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === t.key ? 'var(--academic-primary)' : 'transparent',
                color: activeTab === t.key ? '#fff' : 'var(--academic-text-secondary)'
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <button onClick={fetchPosts} className="ac-btn ac-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} className={loading ? 'spin-animation' : ''} /> Refresh
        </button>
      </div>

      {/* New Post Form */}
      <div className="ac-card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 className="ac-section-title" style={{ fontSize: 15, marginBottom: 12 }}>Join the discussion</h3>
        <form onSubmit={handleCreatePost}>
          <textarea
            className="form-control"
            value={newPostContent}
            onChange={e => setNewPostContent(e.target.value)}
            placeholder="What's on your mind? Write a post, ask a question, or share an announcement..."
            rows={3}
            required
            style={{ marginBottom: 12 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <select
                  className="form-control"
                  value={newPostType}
                  onChange={e => setNewPostType(e.target.value)}
                  style={{ padding: '6px 12px', fontSize: 13, minWidth: 150 }}
                >
                  <option value="DISCUSSION">Normal Post</option>
                  <option value="QUESTION">Question</option>
                  {isTrainerOrAdmin && <option value="ANNOUNCEMENT">Announcement</option>}
                </select>
              </div>

              {isTrainerOrAdmin && newPostType !== 'ANNOUNCEMENT' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newPostPinned}
                    onChange={e => setNewPostPinned(e.target.checked)}
                    style={{ margin: 0 }}
                  />
                  Pin Post
                </label>
              )}
            </div>
            <button type="submit" className="ac-btn ac-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Send size={14} /> Post
            </button>
          </div>
        </form>
      </div>

      {/* Posts list */}
      {loading && posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--academic-text-muted)' }}>Loading discussion board...</div>
      ) : filteredPosts.length === 0 ? (
        <div className="ac-card" style={{ padding: 40, textAlign: 'center', color: 'var(--academic-text-muted)' }}>
          <MessageSquare size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
          <p>No posts found in this tab. Be the first to start the conversation!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredPosts.map(post => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                border: post.isPinned ? '1px solid var(--academic-primary)' : '1px solid var(--academic-border)',
                background: post.type === 'ANNOUNCEMENT' ? 'rgba(79, 70, 229, 0.04)' : 'rgba(255,255,255,0.02)',
                borderRadius: 10,
                padding: 20
              }}
            >
              {/* Post Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--academic-primary)'
                  }}>
                    {getInitials(post.user?.name)}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{post.user?.name || 'Unknown'}</span>
                      <span style={{ fontSize: 10, color: 'var(--academic-text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                        {post.user?.role}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--academic-text-muted)' }}>
                      {new Date(post.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                
                {/* Badges / Actions */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {post.isPinned && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--academic-primary)', fontWeight: 600 }}>
                      <Pin size={12} /> Pinned
                    </span>
                  )}
                  {post.type === 'ANNOUNCEMENT' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#e11d48', fontWeight: 600, textTransform: 'uppercase' }}>
                      <Megaphone size={12} /> Announcement
                    </span>
                  )}
                  {post.type === 'QUESTION' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase' }}>
                      <HelpCircle size={12} /> Question
                    </span>
                  )}

                  {/* Pin/Unpin */}
                  {isTrainerOrAdmin && post.type !== 'ANNOUNCEMENT' && (
                    <button
                      onClick={() => handleTogglePin(post)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: 'var(--academic-text-secondary)', hover: { color: 'var(--academic-primary)' } }}
                      title={post.isPinned ? 'Unpin Post' : 'Pin Post'}
                    >
                      <Pin size={14} style={{ opacity: post.isPinned ? 1 : 0.4 }} />
                    </button>
                  )}

                  {/* Delete */}
                  {(user.id === post.userId || isTrainerOrAdmin) && (
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: '#ef4444' }}
                      title="Delete Post"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Post Content */}
              <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 16 }}>
                {post.content}
              </div>

              {/* Reply Button */}
              <div style={{ borderTop: '1px solid var(--academic-border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--academic-text-muted)' }}>
                  {post.replies?.length || 0} reply(ies)
                </span>
                <button
                  className="ac-btn ac-btn-sm ac-btn-secondary"
                  onClick={() => setReplyingToId(replyingToId === post.id ? null : post.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <CornerDownRight size={12} /> Reply
                </button>
              </div>

              {/* Reply input box */}
              {replyingToId === post.id && (
                <motion.form
                  onSubmit={(e) => handleCreateReply(e, post.id)}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  style={{ marginTop: 12 }}
                >
                  <textarea
                    className="form-control"
                    value={replyContent}
                    onChange={e => setReplyContent(e.target.value)}
                    placeholder="Write your reply..."
                    rows={2}
                    required
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="ac-btn ac-btn-sm ac-btn-secondary" onClick={() => setReplyingToId(null)}>Cancel</button>
                    <button type="submit" className="ac-btn ac-btn-sm ac-btn-primary">Post Reply</button>
                  </div>
                </motion.form>
              )}

              {/* Nesting replies */}
              {post.replies && post.replies.length > 0 && (
                <div style={{ borderLeft: '2px solid var(--academic-border)', paddingLeft: 16, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {post.replies.map(reply => (
                    <div key={reply.id} style={{ background: 'rgba(255,255,255,0.01)', padding: 12, borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, color: 'var(--academic-primary)'
                          }}>
                            {getInitials(reply.user?.name)}
                          </div>
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{reply.user?.name}</span>
                            <span style={{ fontSize: 9, color: 'var(--academic-text-muted)', background: 'rgba(255,255,255,0.04)', padding: '1px 4px', borderRadius: 3, marginLeft: 6 }}>
                              {reply.user?.role}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--academic-text-muted)', marginLeft: 8 }}>
                              {new Date(reply.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {/* Reply actions */}
                        {(user.id === reply.userId || isTrainerOrAdmin) && (
                          <button
                            onClick={() => handleDeletePost(reply.id)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: '#ef4444' }}
                            title="Delete Reply"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--academic-text-secondary)', paddingLeft: 36 }}>
                        {reply.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DiscussionBoard
