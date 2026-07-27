import { createClient } from '@supabase/supabase-js';

// Mengambil environment variables dari konfigurasi Vite (menggunakan awalan VITE_)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xfoocscvcsgpxgiqfmba.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 
                        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
                        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmb29jc2N2Y3NncHhnaXFmbWJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NzA2OTgsImV4cCI6MjA5MzM0NjY5OH0.ylfac7tPL__YT5hK2O56D3FlT1sDxgh0r-fpEaGtZqc';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL atau Anon Key tidak ditemukan. Menggunakan default fallback.');
}

// Inisialisasi dan export client Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
