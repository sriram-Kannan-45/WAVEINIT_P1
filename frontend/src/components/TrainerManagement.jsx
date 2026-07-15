import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, Mail, Lock, CheckCircle, Trash2, Edit2, 
  Shield, Eye, EyeOff, Loader2, Phone, Calendar, AlertCircle, User, Search
} from 'lucide-react';

// Generates initials from name
const getInitials = (name) => {
  if (!name) return 'TR';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

// Password strength calculator
const checkStrength = (pass) => {
  let score = 0;
  if (!pass) return 0;
  if (pass.length > 5) score += 1;
  if (pass.length > 8) score += 1;
  if (/[A-Z]/.test(pass)) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;
  return Math.min(score, 4);
};

export default function TrainerManagement({ 
  trainers = [], 
  onCreateTrainer, 
  onDeleteTrainer, 
  loading = false 
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const passStrength = checkStrength(form.password);
  const strengthColors = ['bg-gray-200', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];
  const strengthLabels = ['Too Weak', 'Weak', 'Fair', 'Good', 'Strong'];

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      showToast('Please fill all fields', 'error');
      return;
    }
    if (form.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    try {
      await onCreateTrainer(form);
      setForm({ name: '', email: '', password: '' });
      showToast('Trainer created successfully');
    } catch (error) {
      showToast(error.message || 'Failed to create trainer', 'error');
    }
  };

  const filteredTrainers = trainers.filter(t => 
    t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-[80vh] bg-gray-50/50 p-6 md:p-8 rounded-2xl relative overflow-hidden">
      {/* Decorative Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={`fixed top-6 left-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-full shadow-lg border backdrop-blur-md text-sm font-medium
              ${toast.type === 'error' 
                ? 'bg-red-50/90 border-red-200 text-red-700' 
                : 'bg-green-50/90 border-green-200 text-green-700'
              }`}
          >
            {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="mb-10 text-center md:text-left">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Trainer Management</h1>
          <p className="text-gray-500 mt-2">Add, modify, and manage your instruction team</p>
        </div>

        <div className="grid lg:grid-cols-[1fr_2fr] gap-8 xl:gap-12 items-start">
          
          {/* LEFT PANEL: TRAINER FORM */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-8"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                <UserPlus size={20} />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Add New Trainer</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name Input */}
              <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${focused === 'name' ? 'text-primary-600' : 'text-gray-400'}`}>
                  <Shield size={18} />
                </div>
                <input
                  type="text"
                  required
                  placeholder=" "
                  value={form.name}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused('')}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="peer w-full pl-11 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all placeholder-transparent"
                />
                <label className="absolute left-11 -top-2.5 bg-white px-1 text-xs font-semibold text-gray-500 transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3.5 peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary-600 peer-focus:bg-white rounded">
                  Full Name
                </label>
              </div>

              {/* Email Input */}
              <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${focused === 'email' ? 'text-primary-600' : 'text-gray-400'}`}>
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  placeholder=" "
                  value={form.email}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused('')}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="peer w-full pl-11 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all placeholder-transparent"
                />
                <label className="absolute left-11 -top-2.5 bg-white px-1 text-xs font-semibold text-gray-500 transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3.5 peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary-600 peer-focus:bg-white rounded">
                  Email Address
                </label>
              </div>

              {/* Password Input */}
              <div className="relative group mb-2">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${focused === 'password' ? 'text-primary-600' : 'text-gray-400'}`}>
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder=" "
                  value={form.password}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused('')}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="peer w-full pl-11 pr-12 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all placeholder-transparent"
                />
                <label className="absolute left-11 -top-2.5 bg-white px-1 text-xs font-semibold text-gray-500 transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3.5 peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary-600 peer-focus:bg-white rounded">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-primary-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {form.password && (
                <div className="space-y-1.5 mt-2">
                  <div className="flex gap-1 h-1.5">
                    {[1, 2, 3, 4].map(idx => (
                      <div 
                        key={idx} 
                        className={`flex-1 rounded-full transition-colors duration-500 ${
                          passStrength >= idx ? strengthColors[passStrength] : 'bg-gray-100'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs font-medium text-right ${
                    passStrength < 2 ? 'text-red-500' : passStrength < 4 ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {strengthLabels[passStrength]}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_8px_20px_rgb(13,148,136,0.25)] hover:shadow-[0_8px_25px_rgb(13,148,136,0.35)] transition-all hover:-translate-y-0.5 overflow-hidden"
              >
                <span className="absolute w-0 h-0 transition-all duration-500 ease-out bg-white rounded-full group-hover:w-56 group-hover:h-56 opacity-10"></span>
                <span className="relative flex items-center gap-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                  {loading ? 'Creating Trainer...' : 'Create Trainer Account'}
                </span>
              </button>
            </form>
          </motion.div>

          {/* RIGHT PANEL: TRAINER CARDS */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                Active Trainers 
                <span className="bg-primary-100 text-primary-700 py-0.5 px-2.5 rounded-full text-sm font-semibold">
                  {filteredTrainers.length}
                </span>
              </h3>
              
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search trainers..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none w-full sm:w-64"
                />
              </div>
            </div>

            {filteredTrainers.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white border border-gray-100 border-dashed rounded-3xl p-12 text-center shadow-sm flex flex-col items-center justify-center min-h-[300px]"
              >
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 mb-4">
                  <UserPlus size={24} />
                </div>
                <h3 className="text-gray-900 font-semibold mb-1">No trainers found</h3>
                <p className="text-gray-500 text-sm">Add your first trainer using the form on the left.</p>
              </motion.div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-5 auto-rows-max h-[calc(100vh-280px)] overflow-y-auto pr-2 pb-10 scrollbar-hide">
                <AnimatePresence>
                  {filteredTrainers.map((trainer, index) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.05, duration: 0.2 }}
                      key={trainer.id}
                      className="group bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-[0_15px_30px_rgb(0,0,0,0.06)] transition-all hover:-translate-y-1 relative"
                    >
                      {/* Status Badge */}
                      <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-green-50 text-green-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Active
                      </div>

                      <div className="flex flex-col h-full">
                        <div className="flex items-center gap-4 mb-5">
                          {trainer.profile?.imagePath ? (
                            <img 
                              src={assetUrl(trainer.profile.imagePath)} 
                              alt={trainer.name} 
                              className="w-14 h-14 rounded-full object-cover ring-2 ring-primary-50"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 flex items-center justify-center text-lg font-bold shadow-inner">
                              {getInitials(trainer.name)}
                            </div>
                          )}
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-primary-600 transition-colors">{trainer.name}</h4>
                            <p className="text-gray-500 text-sm mt-0.5">Trainer</p>
                          </div>
                        </div>

                        <div className="space-y-3 mt-auto border-t border-gray-50 pt-4">
                          <div className="flex items-center gap-2.5 text-sm text-gray-600">
                            <Mail size={15} className="text-gray-400" />
                            <span className="truncate">{trainer.email}</span>
                          </div>
                          {trainer.profile?.phone && (
                            <div className="flex items-center gap-2.5 text-sm text-gray-600">
                              <Phone size={15} className="text-gray-400" />
                              <span>{trainer.profile.phone}</span>
                            </div>
                          )}
                          {trainer.profile?.dob && (
                            <div className="flex items-center gap-2.5 text-sm text-gray-600">
                              <Calendar size={15} className="text-gray-400" />
                              <span>{trainer.profile.dob}</span>
                            </div>
                          )}
                        </div>

                        <div className="mt-6 flex items-center gap-2">
                          <button 
                            onClick={() => navigate(`/admin/trainer/${trainer.id}`)}
                            className="flex-1 flex justify-center items-center gap-2 bg-primary-50 text-primary-700 hover:bg-primary-100 py-2 rounded-lg text-sm font-semibold transition-colors"
                          >
                            <User size={14} /> View Profile
                          </button>
                          <button 
                            onClick={() => onDeleteTrainer && onDeleteTrainer(trainer.id, trainer.name)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Trainer"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
