import emailjs from '@emailjs/browser';

/**
 * Service untuk mengirim email notifikasi pendaftaran menggunakan EmailJS.
 * Ini adalah alternatif independen dari Supabase.
 */
export const sendWelcomeEmail = async (userEmail: string, username: string) => {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_sertifikat_nft';
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_REGISTER || 
                     import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 
                     'template-sign';
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'DFtb3YCdv7x_aIKrk';

  if (!serviceId || !templateId || !publicKey) {
    console.warn("[EmailJS] Konfigurasi EmailJS tidak lengkap! Pastikan .env sudah diatur.");
    return false;
  }

  try {
    const templateParams = {
      to_email: userEmail,
      username: username,
      message: "Terima kasih telah mendaftar di Sistem Informasi Kepemilikan Emas NFT. Akun Anda berhasil dibuat!",
    };

    const response = await emailjs.send(
      serviceId,
      templateId,
      templateParams,
      publicKey
    );

    console.log('[EmailJS] Email berhasil dikirim!', response.status, response.text);
    return true;
  } catch (error) {
    console.error('[EmailJS] Gagal mengirim email:', error);
    return false;
  }
};
