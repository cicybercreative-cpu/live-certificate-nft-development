import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { sendWelcomeEmail } from '../lib/emailService';
import { Loader2, AlertCircle, CheckCircle2, Store, User, Lock, Mail, ChevronRight, Sparkles, UserPlus, KeyRound, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type AuthState = 'login' | 'register' | 'register_otp' | 'forgot_password' | 'forgot_password_otp' | 'forgot_password_reset';
type Role = 'customer' | 'shop';

export function Auth() {
  const [authState, setAuthState] = useState<AuthState>('login');
  const [role, setRole] = useState<Role>('shop');
  const navigate = useNavigate();

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');

  // Registration & Visibility states
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Recovery states
  const [recoveryInput, setRecoveryInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');

  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleAuthStateChange = (newState: AuthState) => {
    setAuthState(newState);
    clearMessages();
    setRegisterStep(1);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowNewPassword(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('Akun tidak ditemukan atau kata sandi salah. Silakan periksa kembali email dan kata sandi Anda.');
        } else {
          setError(error.message);
        }
        return;
      }

      if (data.user) {
        // Cek apakah role sesuai dengan yang dipilih
        const userRole = data.user.user_metadata?.role || 'customer';
        
        if (role === 'shop' && userRole !== 'shop') {
           setError('Akses Ditolak: Akun ini tidak memiliki hak akses sebagai Admin Toko');
           await supabase.auth.signOut();
           return;
        } else if (role === 'customer' && userRole === 'shop') {
           setError('Akses Ditolak: Akun ini terdaftar sebagai Admin Toko. Silakan pilih tab "Akun Toko" untuk login.');
           await supabase.auth.signOut();
           return;
        }
        
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (password !== confirmPassword) {
      setError('Kata sandi dan konfirmasi kata sandi tidak cocok!');
      return;
    }

    if (password.length < 6) {
      setError('Kata sandi harus memiliki minimal 6 karakter!');
      return;
    }

    setLoading(true);

    try {
      // Cek keunikan username di database (memerlukan tabel user_profiles)
      const { data: existingUser, error: checkError } = await supabase
        .from('user_profiles')
        .select('username')
        .ilike('username', username)
        .limit(1);

      if (checkError) {
         if (checkError.code === '42P01' || checkError.message.includes('find the table') || checkError.code === 'PGRST205') {
            setError(`Database Gagal: Tabel 'user_profiles' belum ada di Supabase untuk validasi username.`);
            setLoading(false);
            return;
         } else if (checkError.code === '42501' || checkError.message.includes('row-level security')) {
            setError(`Terhalang oleh RLS. Silakan nonaktifkan RLS sementara.`);
            setLoading(false);
            return;
         }
      }

      if (existingUser && existingUser.length > 0) {
         setError('Username ini sudah digunakan, silakan gunakan Username lain');
         setLoading(false);
         return;
      }

      // Memanggil API backend untuk pendaftaran dan mengirim link konfirmasi via EmailJS
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username, nickname, role })
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         const text = await res.text();
         throw new Error("Gagal terhubung ke server backend. Respons server: " + text.substring(0, 50) + "...");
      }

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Gagal mendaftar dan mengirim email.');

      setResolvedEmail(email); // Simpan email untuk verifikasi OTP
      setSuccess('Registrasi berhasil! Kode OTP aktivasi akun telah dikirim ke email Anda.');
      setAuthState('register_otp');
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegisterOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/confirm-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resolvedEmail, otp: otpCode })
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error("Gagal memverifikasi OTP registrasi.");
      }

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Kode aktivasi tidak valid');

      setSuccess('Akun Anda telah berhasil diaktifkan! Silakan login.');
      setTimeout(() => {
        setAuthState('login');
        setOtpCode('');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      let targetEmail = recoveryInput;
      const isEmail = recoveryInput.includes('@');

      // Jika user menginput username (tidak ada @), coba cari email di db
      if (!isEmail) {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('email')
          .eq('username', recoveryInput)
          .single();

        if (error || !data?.email) {
           setError(error?.message?.includes('email') 
             ? "Sistem memerlukan pembaruan database untuk mencari via Username. Silakan gunakan alamat Email Anda, atau infokan ke Admin untuk menjalankan: ALTER TABLE user_profiles ADD COLUMN email TEXT;" 
             : 'Username tidak ditemukan atau email belum tertaut pada profil ini. Harap gunakan alamat Email yang terdaftar.');
           setLoading(false);
           return;
        }
        targetEmail = data.email;
      }

      setResolvedEmail(targetEmail);
      
      const res = await fetch('/api/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         const text = await res.text();
         throw new Error("Gagal terhubung ke server backend OTP. Respons server: " + text.substring(0, 50) + "...");
      }

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Gagal mengirim kode OTP.');

      setSuccess('Kode OTP 6-digit telah dikirim melalui EmailJS ke email Anda.');
      setAuthState('forgot_password_otp');
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resolvedEmail, otp: otpCode })
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error("Gagal memverifikasi OTP, server bermasalah.");
      }

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Kode tidak valid');

      setSuccess('Kode verifikasi berhasil divalidasi. Silakan masukkan kata sandi baru.');
      setAuthState('forgot_password_reset');
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    
    if (newPassword.length < 6) {
      setError('Password harus memiliki minimal 6 karakter');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resolvedEmail, otp: otpCode, newPassword })
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error("Gagal mereset kata sandi, server bermasalah.");
      }

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Gagal mengubah password');

      setSuccess('Kata sandi berhasil diubah! Silakan login dengan kata sandi baru Anda.');
      setTimeout(() => {
        setAuthState('login');
        setRecoveryInput('');
        setOtpCode('');
        setNewPassword('');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md bg-white/40 backdrop-blur-2xl p-6 md:p-8 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.03)] border border-white/60 relative overflow-hidden"
    >
      {/* Decorative background glows inside card */}
      <div className="absolute top-0 right-0 -mr-24 -mt-24 w-48 h-48 rounded-full bg-[#7AE2CF]/10 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-48 h-48 rounded-full bg-[#FDEB9E]/20 blur-3xl pointer-events-none"></div>

      <div className="flex flex-col items-center justify-center text-center mb-6 relative z-10 group">
        <div className="relative mb-3.5">
          <div className="absolute inset-0 bg-[#7AE2CF]/20 blur-md rounded-full scale-110 group-hover:scale-125 transition-transform duration-500"></div>
          <img 
            src="https://ik.imagekit.io/0aqwhtubzo/New%20Folder/Untitled%20design%20(1).png" 
            alt="Logo" 
            className="w-16 h-16 object-contain rounded-full p-1 border-2 border-[#FDEB9E]/50 relative z-10 bg-white/50 backdrop-blur-sm shadow-sm"
          />
        </div>
        <h2 className="text-2xl font-black text-[#000000] tracking-tight leading-tight">
          {authState === 'login' && 'Masuk ke Akun'}
          {authState === 'register' && 'Buat Akun Baru'}
          {authState === 'forgot_password' && 'Reset Password'}
          {authState === 'register_otp' && 'Verifikasi Akun'}
          {authState === 'forgot_password_otp' && 'Verifikasi OTP'}
          {authState === 'forgot_password_reset' && 'Sandi Baru'}
        </h2>
        <p className="text-[10px] font-black text-[#7AE2CF] uppercase tracking-widest mt-1.5 bg-[#7AE2CF]/10 px-2.5 py-0.5 rounded-full inline-block">
          Arca Golden's Generation
        </p>
      </div>

      {/* Role selection is hidden: Customer (Pengguna) is hidden for now */}

      {error && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-5 p-3.5 bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-2xl flex items-start gap-3 relative z-10"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs font-bold text-red-800 whitespace-pre-wrap leading-relaxed">{error}</p>
        </motion.div>
      )}

      {success && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-5 p-3.5 bg-green-50/80 backdrop-blur-sm border border-green-200 rounded-2xl flex items-start gap-3 relative z-10"
        >
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <p className="text-xs font-bold text-green-800 leading-relaxed">{success}</p>
        </motion.div>
      )}

      <form 
        onSubmit={(e) => {
          e.preventDefault();
          if (authState === 'login') {
            handleLogin(e);
          } else if (authState === 'register') {
            if (registerStep === 1) {
              if (!username.trim() || !nickname.trim() || !email.trim()) {
                setError('Harap isi semua kolom informasi dasar!');
                return;
              }
              if (!email.includes('@')) {
                setError('Format email tidak valid!');
                return;
              }
              clearMessages();
              setRegisterStep(2);
            } else {
              handleRegister(e);
            }
          } else if (authState === 'register_otp') {
            handleVerifyRegisterOtp(e);
          } else if (authState === 'forgot_password') {
            handleForgotPassword(e);
          } else if (authState === 'forgot_password_otp') {
            handleVerifyOtp(e);
          } else {
            handleResetPassword(e);
          }
        }}
        className="space-y-4"
      >
        {authState === 'register' && registerStep === 1 && (
          <motion.div
            key="register-step-1"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div className="space-y-1.5 relative z-10">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#000000]/50 ml-1">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#000000]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-white/60 backdrop-blur-sm border border-slate-200 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-xs font-semibold text-[#000000]"
                  placeholder="Contoh: john_doe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5 relative z-10">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#000000]/50 ml-1">Nama Panggilan</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#000000]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-white/60 backdrop-blur-sm border border-slate-200 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-xs font-semibold text-[#000000]"
                  placeholder="Contoh: John"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5 relative z-10">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#000000]/50 ml-1">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#000000]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-white/60 backdrop-blur-sm border border-slate-200 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-xs font-semibold text-[#000000]"
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
          </motion.div>
        )}

        {authState === 'register' && registerStep === 2 && (
          <motion.div
            key="register-step-2"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div className="space-y-1.5 relative z-10">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#000000]/50 ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#000000]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-white/60 backdrop-blur-sm border border-slate-200 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-xs font-semibold text-[#000000]"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#000000]/50 hover:text-[#000000]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5 relative z-10">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#000000]/50 ml-1">Konfirmasi Kata Sandi</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#000000]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-white/60 backdrop-blur-sm border border-slate-200 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-xs font-semibold text-[#000000]"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#000000]/50 hover:text-[#000000]"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {authState === 'login' && (
          <div className="space-y-4">
            <div className="space-y-1.5 relative z-10">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#000000]/50 ml-1">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#000000]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-white/60 backdrop-blur-sm border border-slate-200 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-xs font-semibold text-[#000000]"
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5 relative z-10">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#000000]/50 ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#000000]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-white/60 backdrop-blur-sm border border-slate-200 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-xs font-semibold text-[#000000]"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#000000]/50 hover:text-[#000000]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {authState === 'forgot_password' && (
          <div className="space-y-1.5 relative z-10">
            <label className="block text-[10px] font-black uppercase tracking-wider text-[#000000]/50 ml-1">Email atau Username</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#000000]">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-white/60 backdrop-blur-sm border border-slate-200 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-xs font-semibold text-[#000000]"
                placeholder="Masukkan Email atau Username Anda"
                value={recoveryInput}
                onChange={(e) => setRecoveryInput(e.target.value)}
              />
            </div>
          </div>
        )}

        {(authState === 'forgot_password_otp' || authState === 'register_otp') && (
          <div className="space-y-1.5 relative z-10">
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#000000]/50 ml-1">Kode OTP 6-Digit</label>
              {authState === 'register_otp' && (
                <button 
                  type="button"
                  onClick={() => handleAuthStateChange('register')}
                  className="text-[10px] font-bold text-[#7AE2CF] hover:underline"
                >
                  Ganti Email?
                </button>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#000000]">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                maxLength={6}
                className="w-full pl-10 pr-4 py-2.5 bg-white/60 backdrop-blur-sm border border-slate-200 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 rounded-xl outline-none transition-all placeholder:text-slate-400 tracking-[0.4em] text-center text-sm font-black uppercase text-[#000000]"
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
              />
            </div>
          </div>
        )}

        {authState === 'forgot_password_reset' && (
          <div className="space-y-1.5 relative z-10">
            <label className="block text-[10px] font-black uppercase tracking-wider text-[#000000]/50 ml-1">Password Baru</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#000000]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showNewPassword ? "text" : "password"}
                required
                className="w-full pl-10 pr-10 py-2.5 bg-white/60 backdrop-blur-sm border border-slate-200 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-xs font-semibold text-[#000000]"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#000000]/50 hover:text-[#000000]"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#7AE2CF] hover:bg-[#68d0bd] text-[#000000] font-black uppercase tracking-widest py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(122,226,207,0.3)] hover:-translate-y-0.5 active:translate-y-0 relative z-10 text-[10px]"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              {authState === 'login' && 'Masuk'}
              {authState === 'register' && (registerStep === 1 ? 'Selanjutnya' : 'Daftar')}
              {authState === 'register_otp' && 'Aktifkan Akun'}
              {authState === 'forgot_password' && 'Kirim Kode OTP'}
              {authState === 'forgot_password_otp' && 'Verifikasi Kode OTP'}
              {authState === 'forgot_password_reset' && 'Simpan Password Baru'}
              <ChevronRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>

        {authState === 'register' && registerStep === 2 && (
          <button
            type="button"
            onClick={() => {
              clearMessages();
              setRegisterStep(1);
            }}
            className="w-full bg-black/5 hover:bg-black/10 border border-black/10 text-[#000000]/70 font-black uppercase tracking-widest py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 relative z-10 text-[10px]"
          >
            Kembali
          </button>
        )}
      </form>

      <div className="mt-6 text-center text-xs space-y-2 relative z-10 pt-4 border-t border-[#FDEB9E]/20">
        {authState === 'login' && (
          <>
            <p>
              <button 
                onClick={() => handleAuthStateChange('forgot_password')}
                className="text-[#000000]/60 hover:text-[#000000] font-black uppercase tracking-wider text-[9px]"
                type="button"
              >
                Lupa password?
              </button>
            </p>
            <p className="text-[#000000]/65 font-semibold text-[11px]">
              Belum punya akun?{' '}
              <button 
                onClick={() => handleAuthStateChange('register')}
                className="text-[#7AE2CF] hover:text-[#5bc4b1] font-bold hover:underline"
                type="button"
              >
                Daftar sekarang
              </button>
            </p>
          </>
        )}

        {authState === 'register' && (
          <p className="text-[#000000]/65 font-semibold text-[11px]">
            Sudah punya akun?{' '}
            <button 
              onClick={() => handleAuthStateChange('login')}
              className="text-[#7AE2CF] hover:text-[#5bc4b1] font-bold hover:underline"
              type="button"
            >
              Masuk
            </button>
          </p>
        )}

        {authState.startsWith('forgot_password') && (
          <p className="text-[#000000]/65 font-semibold text-[11px]">
            Ingat password Anda?{' '}
            <button 
              onClick={() => handleAuthStateChange('login')}
              className="text-[#7AE2CF] hover:text-[#5bc4b1] font-bold hover:underline"
              type="button"
            >
              Kembali ke Login
            </button>
          </p>
        )}
      </div>
    </motion.div>
  );
}
