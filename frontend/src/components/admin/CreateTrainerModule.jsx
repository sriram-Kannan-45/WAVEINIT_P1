import { useState, useRef, useMemo } from 'react'
import {
  Camera, Users, Eye, Trash2, UserPlus, ShieldCheck,
  User as UserIcon, Mail, Phone, IdCard, KeyRound,
} from 'lucide-react'
import {
  Card, CardHeader, CardBody,
  Input, Select, Button, Badge, Avatar,
  SearchBar, Pagination, EmptyState, Skeleton, Tooltip, PageHeader, Table,
} from '../ui'
import { useToast } from '../Toast'
import { API_BASE, assetUrl } from '../../api/api'
import { colors, radius, spacing, typography, transitions } from '../../theme/tokens'

const DEPARTMENTS = [
  'Technology', 'Engineering', 'Design', 'Data Science', 'Marketing',
  'Sales', 'Human Resources', 'Finance', 'Operations',
  'Training & Development', 'Other',
].map(v => ({ value: v, label: v }))

const DESIGNATIONS = [
  'Senior Trainer', 'Trainer', 'Associate Trainer', 'Lead Trainer',
  'Faculty', 'Subject Matter Expert', 'Technical Instructor',
  'Software Engineer', 'Senior Software Engineer', 'Consultant', 'Other',
].map(v => ({ value: v, label: v }))

const EXPERIENCE_LEVELS = [
  'Fresher', '1-3 years', '3-5 years', '5-10 years', '10+ years',
].map(v => ({ value: v, label: v }))

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  employeeId: '',
  department: '',
  designation: '',
  experience: '',
  password: '',
  confirmPassword: '',
  status: 'APPROVED',
}

function StatusBadge({ status }) {
  if (status === 'APPROVED') return <Badge color="success">Active</Badge>
  return <Badge color="neutral">Inactive</Badge>
}

function TrainersTableSkeleton({ rows = 5 }) {
  return (
    <div style={{ padding: '8px 0' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '14px 4px',
          borderBottom: i < rows - 1 ? `1px solid ${colors.border.light}` : 'none',
        }}>
          <Skeleton style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <Skeleton style={{ width: '55%', height: 14, marginBottom: 8 }} />
            <Skeleton style={{ width: '35%', height: 10 }} />
          </div>
          <Skeleton style={{ width: 72, height: 22, borderRadius: 8 }} />
          <Skeleton style={{ width: 64, height: 22, borderRadius: 8 }} />
          <Skeleton style={{ width: 24, height: 24, borderRadius: 8 }} />
        </div>
      ))}
    </div>
  )
}

export default function CreateTrainerModule({
  trainers = [],
  initialLoading = false,
  token,
  onCreated,
  onDelete,
  onView,
  onBack,
}) {
  const { success, error: showError } = useToast()

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageError, setImageError] = useState('')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const nameInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const listCardRef = useRef(null)

  const isActive = form.status === 'APPROVED'

  const setField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }))
  }

  // ── Photo upload ────────────────────────────────────────────────────────
  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!/^image\/(jpeg|jpg|png)$/.test(file.type)) {
      setImageError('Only JPG and PNG images are allowed.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image must be smaller than 5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
    setImageError('')
  }

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Full name is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address'
    if (form.phone && !/^[\d\s+\-()]{7,15}$/.test(form.phone.trim())) errs.phone = 'Enter a valid phone number'
    if (!form.password) errs.password = 'Password is required'
    else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (!form.confirmPassword) errs.confirmPassword = 'Please confirm the password'
    else if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    return errs
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSubmitting(true)
    try {
      const body = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        employeeId: form.employeeId.trim() || undefined,
        department: form.department || undefined,
        designation: form.designation || undefined,
        experience: form.experience || undefined,
        status: form.status,
        profilePic: imagePreview || undefined,
      }
      const r = await fetch(`${API_BASE}/admin/create-trainer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to create trainer')

      success('Trainer account created successfully.')
      setForm(EMPTY_FORM)
      setImagePreview(null)
      setErrors({})
      setPage(1)
      onCreated?.()
      setTimeout(() => listCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250)
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── List filtering + pagination ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return trainers
    return trainers.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.department?.toLowerCase().includes(q) ||
      (t.employeeId || '').toLowerCase().includes(q)
    )
  }, [trainers, search])

  const itemsPerPage = 5
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)

  const focusForm = () => nameInputRef.current?.focus()

  const columns = [
    {
      key: 'trainer',
      header: 'Trainer',
      render: (t) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar size="md" src={assetUrl(t.profile?.imagePath)} name={t.name} />
          <div>
            <div style={{ fontWeight: 600, color: colors.text.primary, fontSize: '0.875rem' }}>{t.name}</div>
            <div style={{ fontSize: '0.75rem', color: colors.text.muted }}>
              {t.employeeId ? `ID · ${t.employeeId}` : t.username}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (t) => (
        <span style={{ fontSize: '0.8125rem', color: colors.text.secondary }}>{t.email}</span>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (t) => t.department || '—',
    },
    {
      key: 'experience',
      header: 'Experience',
      render: (t) => t.profile?.experience || '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (t) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tooltip content="View Details">
            <button
              type="button"
              aria-label={`View ${t.name}`}
              onClick={() => onView?.(t)}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: radius.md, border: 'none',
                background: colors.primary[50], color: colors.primary[700], cursor: 'pointer',
                transition: `background ${transitions.fast}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.primary[100] }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.primary[50] }}
            >
              <Eye size={15} />
            </button>
          </Tooltip>
          <Tooltip content="Delete Trainer">
            <button
              type="button"
              aria-label={`Delete ${t.name}`}
              onClick={() => onDelete?.(t.id, t.name)}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: radius.md, border: 'none',
                background: colors.danger[50], color: colors.danger[600], cursor: 'pointer',
                transition: `background ${transitions.fast}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.danger[100] }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.danger[50] }}
            >
              <Trash2 size={15} />
            </button>
          </Tooltip>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: spacing[6] }}>
        <PageHeader
          title="Create Trainer"
          subtitle="Set up a new trainer account and manage your trainer roster in one place"
          onBack={onBack}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 items-start">
        {/* ── Create Trainer Form ───────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: colors.text.primary, fontFamily: typography.fontFamily }}>
                  Create Trainer Account
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.text.muted, marginTop: 2 }}>
                  Add a new trainer to the platform
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <form onSubmit={handleSubmit} noValidate>

                {/* Profile photo */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16, marginBottom: spacing[5],
                  padding: spacing[4], background: colors.surface.secondary,
                  borderRadius: radius.xl, border: `1px dashed ${colors.border.dashed}`,
                }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar size="xl" src={imagePreview} name={form.name || 'TR'} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Upload profile photo"
                      title="Upload profile photo"
                      style={{
                        position: 'absolute', bottom: 0, right: 0, width: 28, height: 28,
                        borderRadius: '50%', border: `2px solid ${colors.surface.primary}`,
                        background: colors.primary[600], color: colors.text.inverse,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      }}
                    >
                      <Camera size={13} />
                    </button>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.text.primary }}>
                      Profile Photo
                    </div>
                    <div style={{ fontSize: '0.75rem', color: colors.text.muted, marginTop: 2 }}>
                      JPG or PNG, up to 5 MB
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ marginTop: 8 }}
                    >
                      {imagePreview ? 'Change Photo' : 'Upload Photo'}
                    </Button>
                    {imageError && (
                      <div style={{ fontSize: '0.75rem', color: colors.danger[600], marginTop: 6 }}>
                        {imageError}
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    style={{ display: 'none' }}
                    onChange={handleImageChange}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
                  <Input
                    ref={nameInputRef}
                    label="Full Name"
                    placeholder="e.g. Sarah Johnson"
                    icon={<UserIcon size={16} />}
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                    error={errors.name}
                  />
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="trainer@company.com"
                    icon={<Mail size={16} />}
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    error={errors.email}
                  />
                  <Input
                    label="Mobile Number"
                    type="tel"
                    placeholder="e.g. +91 98765 43210"
                    icon={<Phone size={16} />}
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    error={errors.phone}
                    helperText="Optional"
                  />
                  <Input
                    label="Employee ID"
                    placeholder="e.g. EMP-1024"
                    icon={<IdCard size={16} />}
                    value={form.employeeId}
                    onChange={(e) => setField('employeeId', e.target.value)}
                    helperText="Optional"
                  />
                  <Select
                    label="Department"
                    placeholder="Select department"
                    options={DEPARTMENTS}
                    value={form.department}
                    onChange={(e) => setField('department', e.target.value)}
                  />
                  <Select
                    label="Designation"
                    placeholder="Select designation"
                    options={DESIGNATIONS}
                    value={form.designation}
                    onChange={(e) => setField('designation', e.target.value)}
                  />
                  <Select
                    label="Experience"
                    placeholder="Select experience"
                    options={EXPERIENCE_LEVELS}
                    value={form.experience}
                    onChange={(e) => setField('experience', e.target.value)}
                  />

                  {/* Status toggle */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: spacing[4], background: colors.surface.secondary,
                    borderRadius: radius.xl, border: `1px solid ${colors.border.light}`,
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600, color: colors.text.primary }}>
                        <ShieldCheck size={16} style={{ color: isActive ? colors.success[600] : colors.text.muted }} />
                        Account Status
                      </div>
                      <div style={{ fontSize: '0.75rem', color: colors.text.muted, marginTop: 2 }}>
                        Immediately activate or deactivate login access
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <StatusBadge status={form.status} />
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isActive}
                        aria-label="Toggle account status"
                        className={`interview-toggle ${isActive ? 'interview-toggle--active' : ''}`}
                        onClick={() => setField('status', isActive ? 'INACTIVE' : 'APPROVED')}
                      >
                        <span className="interview-toggle-knob" />
                      </button>
                    </div>
                  </div>

                  <Input
                    label="Password"
                    type="password"
                    placeholder="Min. 8 characters"
                    icon={<KeyRound size={16} />}
                    value={form.password}
                    onChange={(e) => setField('password', e.target.value)}
                    error={errors.password}
                  />
                  <Input
                    label="Confirm Password"
                    type="password"
                    placeholder="Re-enter password"
                    icon={<KeyRound size={16} />}
                    value={form.confirmPassword}
                    onChange={(e) => setField('confirmPassword', e.target.value)}
                    error={errors.confirmPassword}
                  />
                </div>

                <div style={{ marginTop: spacing[6], display: 'flex', gap: spacing[3] }}>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    icon={UserPlus}
                    loading={submitting}
                    disabled={submitting}
                    style={{ flex: 1 }}
                  >
                    {submitting ? 'Creating Trainer...' : 'Create Trainer'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    onClick={() => {
                      setForm(EMPTY_FORM)
                      setImagePreview(null)
                      setErrors({})
                    }}
                    disabled={submitting}
                  >
                    Reset
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>

        {/* ── Trainer List ──────────────────────────────────────────────── */}
        <div className="lg:col-span-3" ref={listCardRef}>
          <Card>
            <CardHeader
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge color="primary">{trainers.length} total</Badge>
                </div>
              }
            >
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: colors.text.primary, fontFamily: typography.fontFamily }}>
                  All Trainers
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.text.muted, marginTop: 2 }}>
                  View, inspect and manage trainer accounts
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <div style={{ marginBottom: spacing[5] }}>
                <SearchBar
                  value={search}
                  onChange={(v) => { setSearch(v); setPage(1) }}
                  placeholder="Search by name, email, department or ID..."
                />
              </div>

              {initialLoading ? (
                <TrainersTableSkeleton />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={trainers.length === 0 ? 'No Trainers Yet' : 'No Trainers Found'}
                  description={
                    trainers.length === 0
                      ? 'Create your first trainer account using the form on the left.'
                      : 'No trainers match your current search. Try a different keyword.'
                  }
                  actionLabel={trainers.length === 0 ? 'Add First Trainer' : undefined}
                  onAction={trainers.length === 0 ? focusForm : undefined}
                />
              ) : (
                <div>
                  <Table columns={columns} data={paged} emptyMessage="No trainers match your search." />
                  <Pagination
                    totalItems={filtered.length}
                    itemsPerPage={itemsPerPage}
                    currentPage={safePage}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
