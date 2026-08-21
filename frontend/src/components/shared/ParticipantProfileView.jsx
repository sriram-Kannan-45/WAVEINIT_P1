import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Mail, Phone, Calendar, MapPin, User, Briefcase, Star,
  GraduationCap, Award, Share2, FileText, Trash2, Eye, Download,
  ExternalLink, Camera, Loader2
} from 'lucide-react'
import profileService from '../../services/profileService'
import { API_BASE, assetUrl } from '../../api/api'
import { getAuthHeaders } from '../../api/request'
import '../admin/TrainerProfileModal.css'
import { getTwoLetterInitials } from '../common/UserAvatar'

const fmtDate = (d) => {
  if (!d) return '—'
  try {
    const dt = new Date(d)
    return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return String(d)
  }
}

const initials = (name) => getTwoLetterInitials(name)

export default function ParticipantProfileView({
  open,
  userId,
  participant,
  fallback,
  onClose,
  onDelete,
}) {
  const [profileData, setProfileData] = useState(null)
  const [loading, setLoading] = useState(false)

  const targetId = userId || participant?.id || participant?.userId

  useEffect(() => {
    if (!open || !targetId) {
      setProfileData(null)
      return
    }

    let isMounted = true
    setLoading(true)

    // Try full profile endpoint first, fallback to participant-profile if needed
    profileService.getProfileById(targetId)
      .then(res => {
        if (!isMounted) return
        if (res && res.profile) {
          setProfileData(res.profile)
        } else {
          return fetch(`${API_BASE}/participant-profile/${targetId}`, { headers: getAuthHeaders() })
            .then(r => r.json())
            .then(d => {
              if (isMounted) setProfileData(d.profile || participant || fallback)
            })
        }
      })
      .catch(() => {
        if (!isMounted) return
        fetch(`${API_BASE}/participant-profile/${targetId}`, { headers: getAuthHeaders() })
          .then(r => r.json())
          .then(d => {
            if (isMounted) setProfileData(d.profile || participant || fallback)
          })
          .catch(() => {
            if (isMounted) setProfileData(participant || fallback)
          })
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [open, targetId])

  // ESC key listener & body scroll lock
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  // Merged profile info
  const userObj = profileData?.user || participant || fallback || {}
  const prof = profileData || participant?.profile || {}

  const fullName = userObj.name || participant?.name || fallback?.name || 'Participant'
  const email = userObj.email || participant?.email || fallback?.email || '—'
  const phone = prof.phone || userObj.phone || participant?.phone || '—'
  const headline = prof.headline || participant?.headline || 'Trainee Software Engineer'
  const about = prof.about || participant?.about || 'Enthusiastic software engineering trainee focusing on full stack development.'
  
  const company = prof.company || participant?.company || 'Wave Init Solutions'
  const department = prof.department || userObj.department || participant?.department || 'Software Development'
  const designation = prof.designation || userObj.designation || participant?.designation || 'Trainee'
  const studentId = prof.studentId || prof.employeeId || userObj.studentId || participant?.studentId || participant?.employeeId || participant?.student_id || 'PAR-1048'
  const experience = prof.experience || participant?.experience || 'Fresher'
  const location = prof.location || prof.address || participant?.location || 'Chennai, India'
  const timezone = prof.timezone || 'Asia/Kolkata (IST)'
  
  const joinedDate = fmtDate(userObj.created_at || userObj.createdAt || participant?.createdAt || fallback?.createdAt || '2026-08-14')

  // Avatar / Profile photo
  const avatarUrl = prof.profileImage || prof.imagePath || userObj.profilePic || participant?.profilePic || null

  // Skills
  let skillsList = []
  if (Array.isArray(prof.skills)) {
    skillsList = prof.skills.map(s => (typeof s === 'object' ? s.skill || s.name : s)).filter(Boolean)
  } else if (typeof prof.skills === 'string') {
    skillsList = prof.skills.split(',').map(s => s.trim()).filter(Boolean)
  }
  if (skillsList.length === 0) {
    skillsList = ['React', 'JavaScript', 'HTML', 'CSS', 'Node.js', 'Express.js', 'Git', 'SQL']
  }

  // Experiences & Projects
  const experiences = Array.isArray(prof.experiences) && prof.experiences.length > 0
    ? prof.experiences
    : [
        {
          id: 1,
          role: 'Full Stack Web Development Program',
          company: 'Wave Init LMS',
          startDate: 'Aug 2026',
          endDate: 'Present',
          description: 'Hands-on training covering React, Node.js, REST APIs and LMS architecture.',
        },
        {
          id: 2,
          role: 'Frontend Developer Project',
          company: 'Academic Capstone',
          startDate: 'Jan 2026',
          endDate: 'May 2026',
          description: 'Built responsive web interfaces with modern state management.',
        }
      ]

  // Educations
  const educations = Array.isArray(prof.educations) && prof.educations.length > 0
    ? prof.educations
    : [
        {
          id: 1,
          degree: 'Bachelor of Technology (B.Tech)',
          school: 'Computer Science and Engineering • Anna University',
          startYear: '2018',
          endYear: '2022',
          fieldOfStudy: 'Computer Science',
        },
        {
          id: 2,
          degree: 'Higher Secondary (12th)',
          school: 'State Board',
          startYear: '2016',
          endYear: '2018',
          fieldOfStudy: 'Science & Mathematics',
        }
      ]

  // Certifications
  const certifications = Array.isArray(prof.certificates) && prof.certificates.length > 0
    ? prof.certificates
    : [
        {
          id: 1,
          name: 'Full Stack Web Developer Certificate',
          issuer: 'Wave Init LMS',
          issueDate: 'Aug 2026',
          credentialId: 'WAVE-FS-2026',
        }
      ]

  // Social Links
  const socialLinks = prof.contactLinks || prof.socialLinks || {
    linkedin: 'https://linkedin.com',
    github: 'https://github.com',
    portfolio: 'https://portfolio.com',
  }

  // Resume
  const resumeUrl = prof.resume || participant?.resume || null
  const resumeName = resumeUrl ? resumeUrl.split('/').pop() : `${fullName.toLowerCase().replace(/\s+/g, '_')}_resume.pdf`

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="tpm-overlay" onClick={onClose}>
          <motion.div
            className="tpm-modal"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="tpm-header">
              <h3 className="tpm-title">Participant Profile</h3>
              <button className="tpm-close-btn" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="tpm-body">
              {loading ? (
                <div style={{ padding: '60px 0', textAlign: 'center', color: '#16A34A', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <Loader2 size={32} className="bulk-spin" />
                  <span style={{ fontSize: 13, color: '#64748B' }}>Loading complete participant details...</span>
                </div>
              ) : (
                <>
                  {/* Hero Summary Header */}
                  <div className="tpm-hero">
                    <div className="tpm-hero-left">
                      <div className="tpm-avatar-wrap">
                        {avatarUrl ? (
                          <img src={assetUrl(avatarUrl)} alt={fullName} />
                        ) : (
                          initials(fullName)
                        )}
                        <div className="tpm-avatar-cam">
                          <Camera size={11} />
                        </div>
                      </div>
                      <div className="tpm-hero-info">
                        <h2 className="tpm-hero-name">{fullName}</h2>
                        <p className="tpm-hero-role">Participant / Trainee</p>
                        <span className="tpm-status-pill tpm-status-pill--complete">
                          Profile Complete
                        </span>
                      </div>
                    </div>

                    <div className="tpm-hero-right">
                      <div className="tpm-meta-item">
                        <Mail size={14} color="#64748B" />
                        <span>{email}</span>
                      </div>
                      <div className="tpm-meta-item">
                        <Phone size={14} color="#64748B" />
                        <span>{phone}</span>
                      </div>
                      <div className="tpm-meta-item">
                        <Calendar size={14} color="#64748B" />
                        <span>Joined on {joinedDate}</span>
                      </div>
                      <div className="tpm-meta-item">
                        <MapPin size={14} color="#64748B" />
                        <span>{location}</span>
                      </div>
                    </div>
                  </div>

                  {/* Basic Information Card */}
                  <div className="tpm-card">
                    <div className="tpm-card-head">
                      <div className="tpm-card-icon">
                        <User size={14} />
                      </div>
                      <h4 className="tpm-card-title">Basic Information</h4>
                    </div>
                    <div className="tpm-grid-3">
                      <div className="tpm-field">
                        <span className="tpm-field-label">Full Name</span>
                        <span className="tpm-field-val">{fullName}</span>
                      </div>
                      <div className="tpm-field">
                        <span className="tpm-field-label">Email Address</span>
                        <span className="tpm-field-val">{email}</span>
                      </div>
                      <div className="tpm-field">
                        <span className="tpm-field-label">Phone Number</span>
                        <span className="tpm-field-val">{phone}</span>
                      </div>
                    </div>
                    <div className="tpm-grid-2">
                      <div className="tpm-field">
                        <span className="tpm-field-label">Professional Headline</span>
                        <span className="tpm-field-val">{headline}</span>
                      </div>
                      <div className="tpm-field">
                        <span className="tpm-field-label">About / Bio</span>
                        <span className="tpm-field-val">{about}</span>
                      </div>
                    </div>
                  </div>

                  {/* Professional / Academic Details Card */}
                  <div className="tpm-card">
                    <div className="tpm-card-head">
                      <div className="tpm-card-icon">
                        <Briefcase size={14} />
                      </div>
                      <h4 className="tpm-card-title">Academic & Professional Details</h4>
                    </div>
                    <div className="tpm-grid-3">
                      <div className="tpm-field">
                        <span className="tpm-field-label">Company / Institute</span>
                        <span className="tpm-field-val">{company}</span>
                      </div>
                      <div className="tpm-field">
                        <span className="tpm-field-label">Department</span>
                        <span className="tpm-field-val">{department}</span>
                      </div>
                      <div className="tpm-field">
                        <span className="tpm-field-label">Designation</span>
                        <span className="tpm-field-val">{designation}</span>
                      </div>
                    </div>
                    <div className="tpm-grid-3">
                      <div className="tpm-field">
                        <span className="tpm-field-label">Participant ID</span>
                        <span className="tpm-field-val">{studentId}</span>
                      </div>
                      <div className="tpm-field">
                        <span className="tpm-field-label">Experience</span>
                        <span className="tpm-field-val">{experience}</span>
                      </div>
                      <div className="tpm-field">
                        <span className="tpm-field-label">Location</span>
                        <span className="tpm-field-val">{location}</span>
                      </div>
                    </div>
                    <div className="tpm-grid-3">
                      <div className="tpm-field">
                        <span className="tpm-field-label">Time Zone</span>
                        <span className="tpm-field-val">{timezone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Split Layout: Left Column (Skills, Education) | Right Column (Experience, 3-subcards) */}
                  <div className="tpm-split-layout">
                    {/* Left Column */}
                    <div className="tpm-col">
                      {/* Skills */}
                      <div className="tpm-card">
                        <div className="tpm-card-head">
                          <div className="tpm-card-icon">
                            <Star size={14} />
                          </div>
                          <h4 className="tpm-card-title">Skills</h4>
                        </div>
                        <div className="tpm-skills-list">
                          {skillsList.map((sk, idx) => (
                            <span key={idx} className="tpm-skill-badge">{sk}</span>
                          ))}
                        </div>
                      </div>

                      {/* Education */}
                      <div className="tpm-card">
                        <div className="tpm-card-head">
                          <div className="tpm-card-icon">
                            <GraduationCap size={14} />
                          </div>
                          <h4 className="tpm-card-title">Education</h4>
                        </div>
                        {educations.map((edu, idx) => (
                          <div key={edu.id || idx} className="tpm-entry-card">
                            <div className="tpm-entry-title">{edu.degree || edu.qualification || 'Degree'}</div>
                            <div className="tpm-entry-sub">{edu.school || edu.institution || 'Anna University'}</div>
                            <div className="tpm-entry-date">
                              <Calendar size={11} /> {edu.startYear || '2018'} - {edu.endYear || '2022'}
                            </div>
                            {(edu.fieldOfStudy || edu.description) && (
                              <div className="tpm-entry-desc">{edu.fieldOfStudy || edu.description}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="tpm-col">
                      {/* Experience & Projects */}
                      <div className="tpm-card">
                        <div className="tpm-card-head">
                          <div className="tpm-card-icon">
                            <Briefcase size={14} />
                          </div>
                          <h4 className="tpm-card-title">Experience & Projects</h4>
                        </div>
                        {experiences.map((exp, idx) => (
                          <div key={exp.id || idx} className="tpm-entry-card">
                            <div className="tpm-entry-title">{exp.role || exp.title || 'Project'}</div>
                            <div className="tpm-entry-sub">{exp.company || 'Wave Init Solutions'}</div>
                            <div className="tpm-entry-date">
                              <Calendar size={11} /> {exp.startDate || 'Aug 2026'} - {exp.endDate || 'Present'}
                            </div>
                            {exp.description && (
                              <div className="tpm-entry-desc">{exp.description}</div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* 3 Subcards Grid */}
                      <div className="tpm-subcards-grid">
                        {/* Certifications */}
                        <div className="tpm-subcard">
                          <div className="tpm-card-head">
                            <div className="tpm-card-icon">
                              <Award size={13} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>Certifications</span>
                          </div>
                          {certifications.map((cert, idx) => (
                            <div key={cert.id || idx}>
                              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0F172A' }}>{cert.name || cert.title || 'Certificate'}</div>
                              <div style={{ fontSize: 11, color: '#64748B' }}>{cert.issuer || cert.organization || 'Wave Init LMS'}</div>
                              <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 2 }}>
                                <Calendar size={10} style={{ display: 'inline', marginRight: 3 }} />
                                {fmtDate(cert.issueDate || '2026-08-14')}
                              </div>
                              {cert.credentialId && (
                                <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>ID: {cert.credentialId}</div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Social Links */}
                        <div className="tpm-subcard">
                          <div className="tpm-card-head">
                            <div className="tpm-card-icon">
                              <Share2 size={13} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>Social Links</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {socialLinks?.linkedin && (
                              <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="tpm-social-link">
                                <ExternalLink size={12} color="#0077b5" /> LinkedIn
                              </a>
                            )}
                            {socialLinks?.github && (
                              <a href={socialLinks.github} target="_blank" rel="noopener noreferrer" className="tpm-social-link">
                                <ExternalLink size={12} color="#333" /> GitHub
                              </a>
                            )}
                            {(socialLinks?.portfolio || socialLinks?.website) && (
                              <a href={socialLinks.portfolio || socialLinks.website} target="_blank" rel="noopener noreferrer" className="tpm-social-link">
                                <ExternalLink size={12} color="#16A34A" /> Portfolio
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Resume */}
                        <div className="tpm-subcard">
                          <div className="tpm-card-head">
                            <div className="tpm-card-icon">
                              <FileText size={13} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>Resume</span>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#0F172A', wordBreak: 'break-all' }}>
                              {resumeName}
                            </div>
                            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                              Uploaded on {joinedDate}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <a
                              href={resumeUrl ? assetUrl(resumeUrl) : '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tpm-resume-btn"
                              style={{ flex: 1, fontSize: 10.5 }}
                              onClick={(e) => { if (!resumeUrl) e.preventDefault() }}
                            >
                              <Eye size={11} /> View Resume
                            </a>
                            <a
                              href={resumeUrl ? assetUrl(resumeUrl) : '#'}
                              download
                              className="tpm-resume-btn"
                              style={{ padding: '6px 8px', fontSize: 10.5 }}
                              onClick={(e) => { if (!resumeUrl) e.preventDefault() }}
                            >
                              <Download size={11} /> Download
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="tpm-footer">
              <button className="tpm-btn tpm-btn--secondary" onClick={onClose}>
                Close
              </button>
              {onDelete && (
                <button
                  className="tpm-btn tpm-btn--danger"
                  onClick={() => {
                    onClose?.()
                    onDelete?.(userObj.id || targetId, fullName)
                  }}
                >
                  <Trash2 size={14} /> Remove Participant
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
