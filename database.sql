-- Supabase SQL Database Schema
-- Eksekusi semua script di bawah ini di SQL Editor Supabase Anda.

-- ==========================================
-- 1. TABEL: user_profiles
-- Menyimpan data profil tambahan pengguna termasuk username unik dan role
-- ==========================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY, -- Menggunakan ID bawaan dari auth.users
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  role TEXT,
  nickname TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Menonaktifkan Row-Level Security (RLS) sementara untuk memudahkan operasi CRUD dari klien.
-- Catatan: Untuk masuk ke Production yang aman, Anda harus mengaktifkan RLS dan membuat Policies-nya.
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;


-- ==========================================
-- 2. TABEL: otp_codes
-- Menyimpan data OTP sementara untuk fitur reset/lupa sandi
-- ==========================================
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Menonaktifkan Row-Level Security (RLS)
ALTER TABLE otp_codes DISABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. TABEL: hidden_certificates
-- Menyimpan ID token sertifikat yang tidak ingin ditampilkan
-- ==========================================
CREATE TABLE IF NOT EXISTS public.hidden_certificates (
  id SERIAL PRIMARY KEY,
  token_id TEXT UNIQUE NOT NULL
);

-- Memberikan akses baca/tulis penuh ke semua pengguna untuk kemudahan development
-- Catatan: Untuk masuk ke Production yang aman, Anda harus mengatur hak akses yang lebih ketat.
GRANT ALL ON TABLE public.hidden_certificates TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.hidden_certificates_id_seq TO postgres, anon, authenticated, service_role;

-- Menonaktifkan Row-Level Security (RLS) agar tidak diblokir saat Insert/Select
ALTER TABLE public.hidden_certificates DISABLE ROW LEVEL SECURITY;


-- ==========================================
-- 4. TABEL: certificate_metadata_overrides
-- Menyimpan pemetaan nama pemilik baru (override) pasca transfer (Balik Nama)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.certificate_metadata_overrides (
  id SERIAL PRIMARY KEY,
  token_id TEXT UNIQUE NOT NULL,
  owner_name TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Memberikan akses baca/tulis penuh ke semua pengguna untuk kemudahan development
GRANT ALL ON TABLE public.certificate_metadata_overrides TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.certificate_metadata_overrides_id_seq TO postgres, anon, authenticated, service_role;

-- Menonaktifkan Row-Level Security (RLS) agar tidak diblokir saat Insert/Select
ALTER TABLE public.certificate_metadata_overrides DISABLE ROW LEVEL SECURITY;

