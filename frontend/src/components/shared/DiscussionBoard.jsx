import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, HelpCircle, Megaphone, Pin, Trash2, CornerDownRight, Send, RefreshCw } from 'lucide-react'
import { useToast } from '../Toast'
import { API_BASE } from '../../api/api'
import '../../styles/course-tabs.css'


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
    <div className="cdb-container">
      {/* Top Filter & Action Bar */}
      <div className="cdb-top-bar">
        <div className="cdb-filter-pills">
          {[
            { key: 'ALL', label: 'All Posts', icon: <MessageSquare size={16} /> },
            { key: 'DISCUSSION', label: 'Discussions', icon: <MessageSquare size={16} /> },
            { key: 'QUESTION', label: 'Q&A', icon: <HelpCircle size={16} /> },
            { key: 'ANNOUNCEMENT', label: 'Announcements', icon: <Megaphone size={16} /> }
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`cdb-filter-pill ${activeTab === t.key ? 'cdb-filter-pill--active' : ''}`}
            >
              {t.icon} <span>{t.label}</span>
            </button>
          ))}
        </div>
        <button onClick={fetchPosts} className="cdb-btn-refresh">
          <RefreshCw size={15} className={loading ? 'bulk-spin' : ''} /> <span>Refresh</span>
        </button>
      </div>

      {/* New Post Form Card */}
      <div className="cdb-card cdb-new-post-card">
        <h4 className="cdb-section-title">Join the discussion</h4>
        <form onSubmit={handleCreatePost}>
          <textarea
            className="cdb-textarea"
            value={newPostContent}
            onChange={e => setNewPostContent(e.target.value)}
            placeholder="What's on your mind? Write a post, ask a question, or share an announcement..."
            rows={3}
            required
          />
          <div className="cdb-form-actions">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <select
                className="cdb-select"
                value={newPostType}
                onChange={e => setNewPostType(e.target.value)}
              >
                <option value="DISCUSSION">Normal Post</option>
                <option value="QUESTION">Question</option>
                {isTrainerOrAdmin && <option value="ANNOUNCEMENT">Announcement</option>}
              </select>

              {isTrainerOrAdmin && newPostType !== 'ANNOUNCEMENT' && (
                <label className="cdb-pin-label">
                  <input
                    type="checkbox"
                    checked={newPostPinned}
                    onChange={e => setNewPostPinned(e.target.checked)}
                  />
                  Pin Post
                </label>
              )}
            </div>
            <button type="submit" className="cdb-btn-submit">
              <Send size={15} /> <span>Post</span>
            </button>
          </div>
        </form>
      </div>

      {/* Posts list */}
      <div className="cdb-posts-list">
        {loading && posts.length === 0 && (
          <div className="cdb-empty-state">Loading discussion board...</div>
        )}
        {!loading && filteredPosts.length === 0 && (
          <div className="cdb-empty-state">
            <MessageSquare size={30} color="#94A3B8" style={{ marginBottom: 6 }} />
            <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>No posts found in this tab. Be the first to start the conversation!</p>
          </div>
        )}
        {filteredPosts.map(post => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`cdb-post-card ${post.isPinned ? 'cdb-post-card--pinned' : ''}`}
          >
            {/* Post Header */}
            <div className="cdb-post-header">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="cdb-avatar">
                  {getInitials(post.user?.name)}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="cdb-user-name">{post.user?.name || 'Unknown'}</span>
                    <span className="cdb-user-role">
                      {post.user?.role}
                    </span>
                  </div>
                  <span className="cdb-post-date">
                    {new Date(post.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Badges / Actions */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {post.isPinned && (
                  <span className="cdb-badge-pinned">
                    <Pin size={11} /> Pinned
                  </span>
                )}
                {post.type === 'ANNOUNCEMENT' && (
                  <span className="cdb-badge-announcement">
                    <Megaphone size={11} /> Announcement
                  </span>
                )}
                {post.type === 'QUESTION' && (
                  <span className="cdb-badge-question">
                    <HelpCircle size={11} /> Question
                  </span>
                )}

                {/* Pin/Unpin */}
                {isTrainerOrAdmin && post.type !== 'ANNOUNCEMENT' && (
                  <button
                    onClick={() => handleTogglePin(post)}
                    className="cdb-btn-icon"
                    title={post.isPinned ? 'Unpin Post' : 'Pin Post'}
                  >
                    <Pin size={13} style={{ opacity: post.isPinned ? 1 : 0.45 }} />
                  </button>
                )}

                {/* Delete */}
                {(user.id === post.userId || isTrainerOrAdmin) && (
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="cdb-btn-icon cdb-btn-icon--delete"
                    title="Delete Post"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Post Content */}
            <div className="cdb-post-body">
              {post.content}
            </div>

            {/* Reply Button */}
            <div className="cdb-reply-footer">
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>
                {post.replies?.length || 0} reply(ies)
              </span>
              <button
                className="cdb-btn-reply"
                onClick={() => setReplyingToId(replyingToId === post.id ? null : post.id)}
              >
                <CornerDownRight size={11} /> Reply
              </button>
            </div>

            {/* Reply input box */}
            {replyingToId === post.id && (
              <motion.form
                onSubmit={(e) => handleCreateReply(e, post.id)}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{ marginTop: 10 }}
              >
                <textarea
                  className="cdb-textarea"
                  value={replyContent}
                  onChange={e => setReplyContent(e.target.value)}
                  placeholder="Write your reply..."
                  rows={2}
                  required
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                  <button type="button" className="cdb-btn-secondary-sm" onClick={() => setReplyingToId(null)}>Cancel</button>
                  <button type="submit" className="cdb-btn-primary-sm">Post Reply</button>
                </div>
              </motion.form>
            )}

            {/* Replies list */}
            {post.replies && post.replies.length > 0 && (
              <div className="cdb-replies-list">
                {post.replies.map(reply => (
                  <div key={reply.id} className="cdb-reply-item">
                    <div className="cdb-reply-header">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div className="cdb-avatar cdb-avatar--sm">
                          {getInitials(reply.user?.name)}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="cdb-user-name" style={{ fontSize: 12.5 }}>{reply.user?.name}</span>
                            <span className="cdb-user-role" style={{ fontSize: 9 }}>{reply.user?.role}</span>
                          </div>
                          <span className="cdb-post-date">{new Date(reply.createdAt).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Reply actions */}
                      {(user.id === reply.userId || isTrainerOrAdmin) && (
                        <button
                          onClick={() => handleDeletePost(reply.id)}
                          className="cdb-btn-icon cdb-btn-icon--delete"
                          title="Delete Reply"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                    <div className="cdb-reply-body">
                      {reply.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export default DiscussionBoard
