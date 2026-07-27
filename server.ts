import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import FormData from 'form-data';

const __filename = typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '';
const __dirname = __filename ? path.dirname(__filename) : process.cwd();
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API Route: Registrasi Baru dengan Konfirmasi EmailJS
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, username, nickname, role } = req.body;
      if (!email || !password || !username || !nickname) {
        return res.status(400).json({ error: 'Semua field wajib diisi' });
      }

      let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xfoocscvcsgpxgiqfmba.supabase.co';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmb29jc2N2Y3NncHhnaXFmbWJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc3MDY5OCwiZXhwIjoyMDkzMzQ2Njk4fQ.lCU8vgRzjBixEtem54eI6ZzXCLZ16nfS6scA8gPrMQc';
      if (supabaseUrl && !supabaseUrl.startsWith('http')) supabaseUrl = 'https://xfoocscvcsgpxgiqfmba.supabase.co';

      if (!supabaseServiceKey || !supabaseUrl) {
         throw new Error('Supabase konfigurasi backend belum diatur.');
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // Pastikan email atau username belum terdaftar
      const listResponse = await supabaseAdmin.auth.admin.listUsers();
      if (listResponse.error) throw listResponse.error;
      const users: any[] = listResponse.data.users || [];
      if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Oops, email ini sudah terdaftar di sistem. Silakan login atau gunakan email lain.' });
      }

      // Generate 6 digit OTP untuk Registrasi
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // Berlaku 15 menit

      // Simpan user ke Auth (tetap perlu untuk login nantinya)
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: false, // Belum dikonfirmasi sampai OTP dimasukkan
        user_metadata: {
          username: username,
          nama_panggilan: nickname,
          role: role
        }
      });

      if (userError) {
        if (userError.message.includes('already registered')) {
          return res.status(400).json({ error: 'Email sudah terdaftar.' });
        }
        throw userError;
      }

      // Simpan profile ke dalam tabel user_profiles
      if (userData.user) {
         await supabaseAdmin.from('user_profiles').insert([
           {
             id: userData.user.id,
             username: username,
             email: email,
             role: role,
             nickname: nickname
           }
         ]);
         
         // Simpan OTP ke tabel otp_codes
         await supabaseAdmin.from('otp_codes').insert([
           { email: email, otp: otpCode, expires_at: expiresAt }
         ]);
      }

      // Tentukan URL App secara dinamis
      const origin = process.env.APP_URL || req.get('origin') || req.get('referer') || 'https://anda-domain.com';
      const dashboardUrl = `${origin}/dashboard`;

      // Kirim Email konfirmasi OTP melalui EmailJS
      const serviceId = process.env.VITE_EMAILJS_SERVICE_ID || process.env.EMAILJS_SERVICE_ID || 'service_sertifikat_nft';
      const templateId = process.env.VITE_EMAILJS_TEMPLATE_ID_REGISTER || process.env.EMAILJS_TEMPLATE_ID_REGISTER || 'template-sign';
      const publicKey = process.env.VITE_EMAILJS_PUBLIC_KEY || process.env.EMAILJS_PUBLIC_KEY || 'DFtb3YCdv7x_aIKrk';
      const privateKey = process.env.EMAILJS_PRIVATE_KEY || '1Fj1TTnxzDPS0XlICLBOC';

      if (serviceId && templateId && publicKey) {
        try {
          await axios.post('https://api.emailjs.com/api/v1.0/email/send', {
            service_id: serviceId,
            template_id: templateId,
            user_id: publicKey,
            accessToken: privateKey,
            template_params: {
              to_email: email,
              from_name: "Sistem Emas NFT",
              subject: "Aktivasi Akun Emas NFT - Kode OTP",
              to_name: username,
              username: username,
              otp: otpCode,
              app_url: origin,
              dashboard_url: dashboardUrl,
              // Fallback parameters untuk template lama
              email: email,
              user_email: email,
              action_link: `${origin}/auth` // Link ke halaman login/auth
            }
          });
          console.log(`[EmailJS] Registrasi OTP berhasil dikirim ke ${email}`);
        } catch (emailErr: any) {
          console.error('[EmailJS ERROR] Gagal mengirim email registrasi:', emailErr.response?.data || emailErr.message);
          // Kita tidak throw agar user tetap terdaftar di DB, tapi kita beri tahu di log
          // Atau jika ini kritikal, kita throw:
          throw new Error(`Gagal mengirim email aktivasi: ${emailErr.response?.data || emailErr.message}`);
        }
      }

      res.json({ success: true, message: 'Kode OTP registrasi telah dikirim ke email Anda.' });
    } catch (err: any) {
      console.error('/api/auth/register error:', err);
      // Jika error dari axios
      if (err.response && err.response.data) {
        return res.status(err.response.status || 500).json({ 
          error: `EmailJS Error: ${err.response.data}`,
          details: 'Pastikan Service ID, Template ID, dan Keys sudah benar di EmailJS dan "Allow non-browser applications" sudah diaktifkan.'
        });
      }
      res.status(500).json({ error: err.message || 'Gagal mendaftar' });
    }
  });

  // API Route: Konfirmasi Registrasi dengan OTP
  app.post('/api/auth/confirm-register', async (req, res) => {
    try {
      const { email, otp } = req.body;
      
      let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xfoocscvcsgpxgiqfmba.supabase.co';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmb29jc2N2Y3NncHhnaXFmbWJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc3MDY5OCwiZXhwIjoyMDkzMzQ2Njk4fQ.lCU8vgRzjBixEtem54eI6ZzXCLZ16nfS6scA8gPrMQc';

      if (supabaseUrl && !supabaseUrl.startsWith('http')) supabaseUrl = 'https://xfoocscvcsgpxgiqfmba.supabase.co';
      if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: 'Konfigurasi Supabase bermasalah.' });

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });

      // 1. Verifikasi OTP
      const { data: records, error: fetchError } = await supabaseAdmin
        .from('otp_codes')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1);

      if (fetchError || !records || records.length === 0) return res.status(400).json({ error: 'Kode OTP tidak ditemukan.' });

      const record = records[0];
      if (record.otp !== otp || new Date() > new Date(record.expires_at)) {
        return res.status(400).json({ error: 'Kode OTP tidak valid atau kadaluarsa.' });
      }

      // 2. Cari User di Auth
      const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;
      const user = userList.users.find(u => u.email === email);
      if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

      // 3. Aktifkan User
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, { email_confirm: true });
      if (updateError) throw updateError;

      // 4. Bersihkan OTP
      await supabaseAdmin.from('otp_codes').delete().eq('id', record.id);

      res.json({ success: true, message: 'Akun berhasil diaktifkan. Silakan login.' });
    } catch (err: any) {
      console.error('/api/auth/confirm-register error:', err);
      res.status(500).json({ error: err.message || 'Gagal aktivasi akun.' });
    }
  });

  // API Route: Meminta OTP untuk Lupa Password
  app.post('/api/request-otp', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email diperlukan' });

      // Cek ketersediaan user di Supabase Auth melalui Supabase Admin API
      let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xfoocscvcsgpxgiqfmba.supabase.co';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmb29jc2N2Y3NncHhnaXFmbWJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc3MDY5OCwiZXhwIjoyMDkzMzQ2Njk4fQ.lCU8vgRzjBixEtem54eI6ZzXCLZ16nfS6scA8gPrMQc';

      // Handle the case where user accidentally put the publishable key in the URL field
      if (supabaseUrl && !supabaseUrl.startsWith('http')) {
        supabaseUrl = 'https://xfoocscvcsgpxgiqfmba.supabase.co';
      }

      if (!supabaseServiceKey || !supabaseUrl) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY atau VITE_SUPABASE_URL belum dikonfigurasi di backend. Silakan tambahkan di Settings > Secrets.');
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const listResponse = await supabaseAdmin.auth.admin.listUsers();
      if (listResponse.error) throw listResponse.error;
      
      const users: any[] = listResponse.data.users || [];
      const user = users.find(u => u.email === email);
      if (!user) {
        return res.status(404).json({ error: 'Email tidak ditemukan di sistem' });
      }

      // Generate 6 digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // Berlaku 10 menit

      // Simpan ke database (Supabase)
      const { error: insertError } = await supabaseAdmin.from('otp_codes').insert([
        { email, otp: otpCode, expires_at: expiresAt }
      ]);

      if (insertError) {
         if (insertError.code === '42P01' || insertError.message.includes('find the table')) {
            throw new Error(`Tabel 'otp_codes' belum dibuat di Supabase. Silakan jalankan kueri SQL untuk membuat tabel tersebut.`);
         }
         throw insertError;
      }

      // Kirim EmailJS secara server-side
      const serviceId = process.env.VITE_EMAILJS_SERVICE_ID || process.env.EMAILJS_SERVICE_ID || 'service_sertifikat_nft';
      const templateId = process.env.EMAILJS_TEMPLATE_ID_OTP || process.env.VITE_EMAILJS_TEMPLATE_ID_OTP || 'template-otp';
      const publicKey = process.env.VITE_EMAILJS_PUBLIC_KEY || process.env.EMAILJS_PUBLIC_KEY || 'DFtb3YCdv7x_aIKrk';
      const privateKey = process.env.EMAILJS_PRIVATE_KEY || '1Fj1TTnxzDPS0XlICLBOC';

      if (serviceId && templateId && publicKey) {
        await axios.post('https://api.emailjs.com/api/v1.0/email/send', {
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,
          accessToken: privateKey, // Optional backend private key
          template_params: {
            to_email: email,
            email: email,
            user_email: email,
            send_to: email,
            recipient: email,
            to_name: email.split('@')[0],
            username: email.split('@')[0],
            Token: otpCode, // Menyesuaikan dengan {{ .Token }} di template OTP sebelumnya
            otp: otpCode    
          }
        });
        console.log(`[EmailJS] OTP reset sandi berhasil dikirim ke ${email}`);
      } else {
        console.warn(`[WARNING] Konfigurasi EmailJS tidak lengkap. OTP adalah: ${otpCode}`);
      }

      res.json({ success: true, message: 'OTP dikirim' });
    } catch (err: any) {
      if (err.response && err.response.data) {
        console.error('/api/request-otp EmailJS API error data:', err.response.data);
        let errorMsg = err.response.data;
        if (typeof errorMsg === 'string' && errorMsg.includes('non-browser')) {
           errorMsg = 'Akses API dari backend (Node.js) dinonaktifkan di akun EmailJS Anda. Anda harus mengizinkannya di "Account > Security > Allow non-browser applications" pada dashboard EmailJS ATAU menambahkan EMAILJS_PRIVATE_KEY di Settings / Secrets aplikasi ini.';
        }
        return res.status(500).json({ error: `Gagal dari EmailJS: ${errorMsg}` });
      }
      console.error('/api/request-otp error:', err);
      res.status(500).json({ error: err.message || 'Gagal mengirim OTP' });
    }
  });

  // API Route: Verifikasi ringan sebelum mengganti sandi
  app.post('/api/verify-otp', async (req, res) => {
    try {
      const { email, otp } = req.body;
      
      let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xfoocscvcsgpxgiqfmba.supabase.co';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmb29jc2N2Y3NncHhnaXFmbWJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc3MDY5OCwiZXhwIjoyMDkzMzQ2Njk4fQ.lCU8vgRzjBixEtem54eI6ZzXCLZ16nfS6scA8gPrMQc';

      if (supabaseUrl && !supabaseUrl.startsWith('http')) {
        supabaseUrl = 'https://xfoocscvcsgpxgiqfmba.supabase.co';
      }

      if (!supabaseUrl || !supabaseServiceKey) {
         return res.status(500).json({ error: 'Supabase URL atau Service Key belum diatur.' });
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
  
      // Cari record OTP terbaru untuk email ini
      const { data: records, error } = await supabaseAdmin
        .from('otp_codes')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1);
  
      if (error || !records || records.length === 0) {
        return res.status(400).json({ error: 'Kode OTP tidak ditemukan.' });
      }
  
      const record = records[0];
      const now = new Date();
      const expiresAt = new Date(record.expires_at);
  
      if (record.otp !== otp || now > expiresAt) {
        return res.status(400).json({ error: 'Kode OTP tidak valid atau sudah kadaluarsa.' });
      }
  
      res.json({ success: true });
    } catch (err: any) {
      console.error('/api/verify-otp error:', err);
      res.status(500).json({ error: 'Terjadi kesalahan sistem' });
    }
  });

  // API Route: Reset Password dengan OTP
  app.post('/api/reset-password', async (req, res) => {
    try {
      const { email, otp, newPassword } = req.body;
      
      let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xfoocscvcsgpxgiqfmba.supabase.co';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmb29jc2N2Y3NncHhnaXFmbWJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc3MDY5OCwiZXhwIjoyMDkzMzQ2Njk4fQ.lCU8vgRzjBixEtem54eI6ZzXCLZ16nfS6scA8gPrMQc';

      if (supabaseUrl && !supabaseUrl.startsWith('http')) {
        supabaseUrl = 'https://xfoocscvcsgpxgiqfmba.supabase.co';
      }

      if (!supabaseUrl || !supabaseServiceKey) {
         return res.status(500).json({ error: 'Supabase URL atau Service Key belum diatur.' });
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // Verify OTP anew
      const { data: records, error: fetchError } = await supabaseAdmin
        .from('otp_codes')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1);

      if (fetchError || !records || records.length === 0) {
        return res.status(400).json({ error: 'Kode OTP tidak ditemukan.' });
      }

      const record = records[0];
      const now = new Date();
      const expiresAt = new Date(record.expires_at);

      if (record.otp !== otp || now > expiresAt) {
        return res.status(400).json({ error: 'Kode OTP tidak valid atau sudah kadaluarsa.' });
      }

      // Lakukan pencarian user untuk diupdate
      const listResponse = await supabaseAdmin.auth.admin.listUsers();
      if (listResponse.error) throw listResponse.error;
      
      const users: any[] = listResponse.data.users || [];
      const user = users.find(u => u.email === email);
      if (!user) {
        return res.status(404).json({ error: 'User tidak ditemukan' });
      }

      // Update password (MEMBUTUHKAN SERVICE ROLE KEY)
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
      );

      if (updateError) throw updateError;

      // Hapus OTP setelah berhasil mengubah password
      await supabaseAdmin.from('otp_codes').delete().eq('id', record.id);

      res.json({ success: true, message: 'Password berhasil diperbarui' });
    } catch (err: any) {
      console.error('/api/reset-password error:', err);
      res.status(500).json({ error: err.message || 'Gagal mengubah password' });
    }
  });

  // API Route: Mengunggah Metadata ke Pinata (IPFS)
  app.post('/api/pinata/upload-json', async (req, res) => {
    try {
      const metadataJSON = req.body;
      const PINATA_JWT = process.env.VITE_PINATA_JWT || process.env.PINATA_JWT || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJmYWQxNDMwOS1hZDcxLTQ5YTktOTIxMy1kZmM1YzdjZDdjOTEiLCJlbWFpbCI6IjIyMDgzMDAwMDI2QHN0dWRlbnQudW5tZXIuYWMuaWQiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiZjMxYjY2MzE5ZmM4OTQwNGYwNjYiLCJzY29wZWRLZXlTZWNyZXQiOiJiMTQyOThlNDNiNzBhOTZjNmM5ZjFlODZkZDA4OTE5OThmMDhkYTYxMTFiZmQ1NWI0MjFkZjRjZDlmMTkyZWU0IiwiZXhwIjoxODEwMTE5Mzc2fQ.7ggp9dh1Ut-PjgcMUfBvhcyyv4tabvFD0Gn-1XNfcP8';

      if (!PINATA_JWT) {
        return res.status(500).json({ error: 'PINATA_JWT belum dikonfigurasi di environment variables' });
      }

      // Cari kategori dan tipe produk di attributes metadata
      let category = '';
      let productType = '';
      if (metadataJSON.attributes && Array.isArray(metadataJSON.attributes)) {
        const catAttr = metadataJSON.attributes.find((a: any) => a.trait_type === 'Kategori');
        if (catAttr) category = catAttr.value;
        const prodAttr = metadataJSON.attributes.find((a: any) => a.trait_type === 'Tipe Produk');
        if (prodAttr) productType = prodAttr.value;
      }

      // Tentukan file gambar lokal dari assets/images
      if (category && productType) {
        const imageDir = path.join(process.cwd(), 'assets', 'images');
        if (fs.existsSync(imageDir)) {
          const files = fs.readdirSync(imageDir);
          let searchCategory = category.toLowerCase().replace(/\s+/g, '_');
          if (searchCategory === 'emas_tua') searchCategory = 'emas_tua';
          if (searchCategory === 'emas_muda') searchCategory = 'emas_muda';
          
          let searchProduct = productType.toLowerCase();
          
          const productEnMap: Record<string, string> = { 'kalung': 'necklace', 'cincin': 'ring', 'anting': 'earrings', 'gelang': 'bracelet' };
          const categoryEnMap: Record<string, string> = { 'emas_tua': 'yellow_gold', 'emas_muda': 'yellow_gold', 'white_gold': 'white_gold', 'rose_gold': 'rose_gold' };
          
          const pId = searchProduct;
          const pEn = productEnMap[pId] || pId;
          const cId = searchCategory;
          const cEn = categoryEnMap[cId] || cId;
          
          let selectedFile = null;
          for (const file of files) {
            const f = file.toLowerCase();
            const hasCat = f.includes(cId) || f.includes(cEn) || (cId.includes('emas') && f.includes('gold'));
            const hasProd = f.includes(pId) || f.includes(pEn) || f.includes(pEn.replace(/s$/, ''));
            if (hasCat && hasProd) {
              selectedFile = file;
              break;
            }
          }
          if (!selectedFile) {
            for (const file of files) {
              const f = file.toLowerCase();
              if (f.includes(pId) || f.includes(pEn) || f.includes(pEn.replace(/s$/, ''))) {
                selectedFile = file;
                break;
              }
            }
          }
          if (!selectedFile && files.length > 0) selectedFile = files[0];

          if (selectedFile) {
            console.log(`[Pinata] Found matching image for ${category} ${productType}: ${selectedFile}`);
            const filePath = path.join(imageDir, selectedFile);
            
            // Upload file ke IPFS
            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath));
            const metadataFile = JSON.stringify({ name: selectedFile });
            formData.append('pinataMetadata', metadataFile);
            const optionsFile = JSON.stringify({ cidVersion: 0 });
            formData.append('pinataOptions', optionsFile);
            
            console.log('[Pinata] Uploading image to IPFS...');
            const imageRes = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
              maxBodyLength: Infinity,
              headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${PINATA_JWT}`
              }
            });
            const imageCid = imageRes.data.IpfsHash;
            console.log(`[Pinata] Image uploaded. CID: ${imageCid}`);
            
            // Ganti image di JSON dengan CID gambar aslinya
            metadataJSON.image = `ipfs://${imageCid}`;
          }
        }
      }

      console.log('[Pinata] Uploading metadata to IPFS...');
      const response = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadataJSON, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PINATA_JWT}`
        }
      });

      const cid = response.data.IpfsHash;
      console.log(`[Pinata] Metadata uploaded. CID: ${cid}`);
      res.json({ success: true, ipfsUri: `ipfs://${cid}` });
    } catch (err: any) {
      console.error('/api/pinata/upload-json error:', err.response?.data || err.message);
      res.status(500).json({ error: 'Gagal mengunggah metadata ke IPFS melalui Pinata' });
    }
  });

  // API Route: Mengambil metadata IPFS (Proxy untuk mengatasi CORS)
  app.get('/api/ipfs/fetch', async (req, res) => {
    try {
      const { uri } = req.query;
      if (!uri || typeof uri !== 'string') {
        return res.status(400).json({ error: 'URI IPFS diperlukan' });
      }

      console.log(`[Server IPFS Proxy] Request URI: ${uri}`);

      // Ekstrak CID
      let cid = uri;
      if (uri.includes('ipfs/')) {
        cid = uri.split('ipfs/').pop() || uri;
      } else if (uri.startsWith('ipfs://')) {
        cid = uri.replace('ipfs://', '');
      }

      // Pastikan CID tidak kosong dan tidak mengandung path lain jika hanya butuh metadata
      cid = cid.split('?')[0].split('#')[0];

      console.log(`[Server IPFS Proxy] Extracted CID: ${cid}`);

      const IPFS_GATEWAYS = [
        'https://gateway.pinata.cloud/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/',
        'https://ipfs.io/ipfs/',
        'https://dweb.link/ipfs/'
      ];

      let lastError = null;
      for (const gateway of IPFS_GATEWAYS) {
        try {
          const fetchUrl = `${gateway}${cid}`;
          console.log(`[Server IPFS Proxy] Trying gateway: ${fetchUrl}`);
          
          const response = await axios.get(fetchUrl, { 
            timeout: 10000, // 10 detik per gateway
            headers: { 'Accept': 'application/json' }
          });
          
          if (response.data && typeof response.data === 'object') {
            console.log(`[Server IPFS Proxy] SUCCESS from ${gateway}`);
            return res.json(response.data);
          } else {
             console.log(`[Server IPFS Proxy] Gateway ${gateway} returned non-JSON data:`, typeof response.data);
          }
        } catch (err: any) {
          lastError = err.response?.statusText || err.message;
          console.warn(`[Server IPFS Proxy] FAILED from ${gateway}: ${err.message}${err.response ? ` (${err.response.status})` : ''}`);
        }
      }

      res.status(502).json({ 
        error: 'Gagal mengambil metadata dari semua gateway IPFS', 
        details: lastError,
        cid: cid
      });
    } catch (err: any) {
      console.error('/api/ipfs/fetch error:', err);
      res.status(500).json({ error: 'Terjadi kesalahan internal saat mengambil metadata', message: err.message });
    }
  });

  // Vite middleware for development (SPAs)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server backend siap dan berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('CRITICAL: Server gagal dijalankan:', err);
  process.exit(1);
});
