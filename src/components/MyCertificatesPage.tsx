import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ethers } from 'ethers';
import { ArrowLeft, Loader2, Award, AlertCircle, Trash2, Replace, ShieldCheck, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract';
import { motion } from 'framer-motion';

export function MyCertificatesPage() {
  const navigate = useNavigate();
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('customer');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{ [key: string]: { status: 'success' | 'error', owner?: string, error?: string } }>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const role = session?.user?.user_metadata?.role || 'customer';
      setUserRole(role);
      checkWalletAndFetch(role);
    });
  }, []);

  const checkWalletAndFetch = async (role: string) => {
    try {
      let address = '';
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          address = accounts[0].address;
          setWalletAddress(address);
        }
      }
      
      // Jika pengguna adalah Toko, mereka bisa melihat semua tanpa dompet terhubung
      if (!address && role !== 'shop') {
        throw new Error('Wallet belum terhubung. Silakan kembali ke Dashboard dan hubungkan wallet Anda.');
      }
      
      await fetchCertificates(address, role);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchCertificates = async (address: string, role: string) => {
    try {
      if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
        setCertificates([]);
        setLoading(false);
        return;
      }

      if (!window.ethereum) throw new Error('MetaMask tidak terdeteksi.');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      // Ambil total supply untuk iterasi
      let total = 0;
      try {
        const supply = await contract.totalSupply();
        total = Number(supply);
      } catch (err: any) {
        if (err.code === 'BAD_DATA' || err.code === 'CALL_EXCEPTION' || (err.message && err.message.includes('BAD_DATA'))) {
            console.warn("Smart contract tidak ditemukan atau alamat contract salah di Sepolia.");
        } else if (err.code === 'UNCONFIGURED_NAME' || err.code === 'INVALID_ARGUMENT') {
            console.warn('Alamat contract tidak valid. Pastikan itu Contract Address, bukan Transaction Hash.');
        } else {
            console.warn("Gagal mengambil totalSupply, mungkin contract belum memiliki token atau fungsi tsb.", err);
        }
      }

      // Fetch hidden tokens
      let hiddenTokens: string[] = [];
      try {
        const { data } = await supabase.from('hidden_certificates').select('token_id');
        if (data) {
          hiddenTokens = data.map(d => String(d.token_id));
        }
      } catch (e) {
        console.warn("Table hidden_certificates tidak ditemukan.");
      }

      // Fetch metadata overrides (nama pemilik baru)
      let overrides: any[] = [];
      try {
        const { data } = await supabase.from('certificate_metadata_overrides').select('*');
        if (data) {
          overrides = data;
        }
      } catch (e) {
        console.warn("Table certificate_metadata_overrides tidak ditemukan.");
      }

      const fetchWithFallback = async (uri: string) => {
        if (uri.includes('dummy-hash') || uri.includes('undefined') || !uri || uri === 'ipfs://') {
          return {
            name: "Sertifikat Emas (Default / Syncing)",
            attributes: [
              { trait_type: "Pemilik", value: "Menunggu Sinkronisasi" },
              { trait_type: "Kategori", value: "Kategori" },
              { trait_type: "Gram Emas", value: 0 },
              { trait_type: "Tanggal Cetak", value: Math.floor(Date.now() / 1000) }
            ]
          };
        }

        // Handle Base64 encoded JSON
        if (uri.startsWith('data:application/json;base64,')) {
           try {
             return JSON.parse(atob(uri.split(',')[1]));
           } catch(e) {}
        }

        // Handle raw JSON string
        if (uri.trim().startsWith('{') && uri.trim().endsWith('}')) {
           try {
             return JSON.parse(uri);
           } catch(e) {}
        }


        try {
          const res = await fetch(`/api/ipfs/fetch?uri=${encodeURIComponent(uri)}`);
          const contentType = res.headers.get("content-type");
          
          if (!res.ok) {
            if (contentType && contentType.includes("application/json")) {
              const errData = await res.json();
              throw new Error(errData.error || `HTTP ${res.status}`);
            }
            throw new Error(`Server returned non-JSON error: ${res.status}`);
          }

          const text = await res.text();
          try {
             return JSON.parse(text);
          } catch(e) {
             console.error("fetchWithFallback received 200 OK but invalid JSON. Text:", text.substring(0, 200));
             throw new Error(`Metadata bukan JSON yang valid. HTML returned? ${text.substring(0, 20)}`);
          }
        } catch (err: any) {
          console.error("Kesalahan fetch IPFS:", err);
          throw err;
        }
      };
      
      // Dapatkan daftar Token ID yang akan diproses
      const tokenIds: number[] = [];
      let isEnumerable = false;
      try {
        const indexPromises = [];
        for (let idx = 0; idx < total; idx++) {
          indexPromises.push(contract.tokenByIndex(idx));
        }
        const tids = await Promise.all(indexPromises);
        tokenIds.push(...tids.map(Number));
        // Urutkan dari yang terbaru (token ID terbesar) di bagian atas
        tokenIds.reverse();
        isEnumerable = true;
      } catch (enumerableErr) {
        console.warn("Smart contract tidak mendukung ERC721Enumerable or tokenByIndex:", enumerableErr);
      }

      if (!isEnumerable || tokenIds.length === 0) {
        // Fallback: Iterasi tradisional jika tidak mendukung Enumerable
        // Masukkan token ID dari total - 1 ke bawah hingga 0
        for (let i = total - 1; i >= 0; i--) {
          tokenIds.push(i);
        }
      }

      // Filter token ID yang relevan berdasarkan kepemilikan
      const relevantTokens: { id: number, owner: string }[] = [];
      
      // Matikan loading utama secepatnya setelah kita tahu jumlah total sertifikat yang harus di-cek
      // Namun, ownerOf sangat cepat karena RPC call, kita bisa filter dulu
      const ownerPromises = tokenIds.map(async (tokenId) => {
        if (hiddenTokens.includes(String(tokenId))) return;
        try {
          const owner = await contract.ownerOf(tokenId);
          if (role === 'shop' || (address && owner.toLowerCase() === address.toLowerCase())) {
            relevantTokens.push({ id: tokenId, owner });
          }
        } catch (e) {
          // Token burned or nonexistent
        }
      });
      
      await Promise.all(ownerPromises);
      
      // Sort back descending
      relevantTokens.sort((a, b) => b.id - a.id);

      // Pre-populate certificates with skeletons for the exact amount owned
      const initialCerts = relevantTokens.map(t => ({
        id: t.id.toString(),
        token_id: t.id,
        isLoading: true
      }));
      
      setCertificates(initialCerts);
      setLoading(false);

      // Proses setiap token metadata secara chunk (10 sertifikat per batch) agar lebih cepat
      const CHUNK_SIZE = 10;
      for (let i = 0; i < relevantTokens.length; i += CHUNK_SIZE) {
        const chunk = relevantTokens.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (token) => {
          const { id: tokenId, owner } = token;
          try {
            const uri = await contract.tokenURI(tokenId);
            try {
              const meta = await fetchWithFallback(uri);
              
              // Ekstrak atribut dari metadata standar OpenSea
              const findAttr = (trait: string) => meta.attributes?.find((a: any) => a.trait_type === trait)?.value;
              const onChainOwnerName = findAttr("Pemilik") || "Unknown";
              
              // Cari apakah ada override (Nama Pemilik Baru) di database atau di localStorage
              const dbOverride = overrides.find(o => String(o.token_id) === String(tokenId));
              const localOverride = localStorage.getItem(`override_owner_name_${tokenId}`);
              const ownerName = dbOverride?.owner_name || localOverride || onChainOwnerName;
              
              const mintDateVal = findAttr("Tanggal Cetak");
              const mintDate = mintDateVal ? new Date(mintDateVal * 1000) : new Date();

              // Format Token ID Sesuai Request: [Nama Depan] - [DDMMYY] - [Nomor Urut]
              const firstWordOwnerName = ownerName.trim().split(' ')[0];
              const dd = String(mintDate.getDate()).padStart(2, '0');
              const mm = String(mintDate.getMonth() + 1).padStart(2, '0');
              const yy = String(mintDate.getFullYear()).slice(-2);
              
              const formattedId = `${firstWordOwnerName} - ${dd}${mm}${yy} - ${tokenId}`;
              
              const newCert = {
                id: tokenId.toString(),
                token_id: tokenId,
                formatted_id: formattedId,
                token_name: meta.name,
                owner_name: ownerName,
                category: findAttr("Kategori") || "-",
                product_type: findAttr("Tipe Produk") || "-",
                weight_gram: findAttr("Gram Emas") || 0,
                mint_date: mintDate.toISOString(),
                owner_address: owner,
                is_on_chain: true,
                isLoading: false
              };
              
              setCertificates(prev => prev.map(c => c.token_id === tokenId ? newCert : c));
            } catch (err) {
              console.warn(`Gagal mengambil metadata Token ${tokenId}:`, err);
              const dbOverride = overrides.find(o => String(o.token_id) === String(tokenId));
              const localOverride = localStorage.getItem(`override_owner_name_${tokenId}`);
              const ownerName = dbOverride?.owner_name || localOverride || "Memproses Blockchain...";
              const firstWord = ownerName.trim().split(' ')[0];
              
              const errorCert = {
                id: tokenId.toString(),
                token_id: tokenId,
                formatted_id: `${firstWord} - Syncing... - #${tokenId}`,
                token_name: `Token #${tokenId}`,
                owner_name: ownerName,
                owner_address: owner,
                mint_date: new Date().toISOString(),
                is_on_chain: true,
                isLoading: false
              };
              
              setCertificates(prev => prev.map(c => c.token_id === tokenId ? errorCert : c));
            }
          } catch (err: any) {
            console.warn(`Gagal memproses Token ID ${tokenId}:`, err.message);
          }
        }));
      }
    } catch (err: any) {
      setError('Gagal mengambil data dari Blockchain: ' + err.message);
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, tokenName: string) => {
    if (userRole !== 'shop' && userRole !== 'admin') {
      setError("Hanya Admin/Toko yang dapat membakar/menghapus sertifikat!");
      return;
    }
    
    if (confirm(`PERINGATAN: Apakah Anda yakin ingin MEMBAKAR (BURN) sertifikat ${tokenName} (Token #${id}) secara permanen di Blockchain?\n• Token akan dihancurkan (Burn) dari Smart Contract.\n• Tindakan ini tidak dapat dibatalkan.`)) {
      setDeletingId(id);
      try {
        if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
          throw new Error("Smart Contract belum terhubung");
        }
        if (!window.ethereum) throw new Error("MetaMask tidak terdeteksi");
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        
        setError(null);
        // Execute Burn Transaction
        const tx = await contract.burnByAdmin(id);
        await tx.wait();

        // Also add to hidden_certificates as a fallback
        try {
          await supabase.from('hidden_certificates').insert([{ token_id: id }]);
        } catch (dbErr) {
          console.warn("Gagal menyembunyikan di database, namun token telah dibakar di blockchain", dbErr);
        }
        
        alert(`Sertifikat (Token #${id}) berhasil dibakar dari Blockchain!`);
        
        // Refresh certificates
        checkWalletAndFetch(userRole);
      } catch (err: any) {
        console.error("Error burning certificate:", err);
        let errorMsg = err.message;
        if (err.message.includes('user rejected action')) {
          errorMsg = "Transaksi dibatalkan oleh pengguna (MetaMask).";
        } else if (err.message.includes('OwnableUnauthorizedAccount')) {
          errorMsg = "Gagal Membakar: Akun wallet Anda bukan pemilik Smart Contract (Admin). Hanya akun pembuat kontrak yang dapat membakar token ini.";
        } else if (err.message.includes('ERC721NonexistentToken')) {
          errorMsg = "Token sudah tidak ada / sudah dibakar.";
        } else if (err.message.includes('CALL_EXCEPTION') || err.message.includes('missing revert data')) {
          errorMsg = "Fungsi Burn tidak ditemukan di Smart Contract ini. Anda harus men-deploy ulang smart contract (GoldCertificateNFT.sol) yang terbaru dan memperbarui VITE_CONTRACT_ADDRESS di Settings > Secrets.";
        }
        setError("Gagal membakar (burn) sertifikat: " + errorMsg);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleValidateOnChain = async (cert: any) => {
    setValidatingId(cert.id);
    setValidationResult(prev => ({ ...prev, [cert.id]: { status: 'success', owner: '' } })); // Reset
    
    try {
      if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
        setTimeout(() => {
          setValidationResult(prev => ({
            ...prev,
            [cert.id]: { status: 'error', error: 'Simulasi: Smart Contract belum dideploy. Validasi gagal.' }
          }));
          setValidatingId(null);
        }, 1000);
        return;
      }

      if (!window.ethereum) throw new Error('MetaMask tidak terdeteksi.');
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const onChainTokenId = cert.token_id != null ? cert.token_id : parseInt(cert.id, 10) || 0;
      
      // Validasi On-Chain: Membaca siapa pemilik sesungguhnya dari Blockchain (Tanpa melalui DB Admin Pusat)
      const actualOwner = await contract.ownerOf(onChainTokenId);
      
      setValidationResult(prev => ({
        ...prev,
        [cert.id]: { status: 'success', owner: actualOwner }
      }));
    } catch (err: any) {
      console.error(err);
      let errorMsg = 'Gagal memvalidasi di blockchain.';
      if (err.message.includes('fetch') || err.message.includes('MetaMask')) {
        errorMsg = 'Gagal terhubung ke RPC/MetaMask (Koneksi jaringan bermasalah).';
      } else if (err.message.includes('ERC721NonexistentToken') || err.message.includes('reverted')) {
        errorMsg = 'Token tidak ditemukan di Smart Contract.';
      } else {
        errorMsg = err.message || errorMsg;
      }
      
      setValidationResult(prev => ({
        ...prev,
        [cert.id]: { status: 'error', error: errorMsg }
      }));
    } finally {
      if (CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
        setValidatingId(null);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF] font-sans selection:bg-[#7AE2CF] selection:text-[#000000] relative overflow-hidden">
      {/* Background Orbs */}
      <div className="fixed top-0 left-[20%] w-[30%] h-[30%] bg-[#7AE2CF]/20 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[10%] w-[40%] h-[40%] bg-[#FDEB9E]/30 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* Navbar Glassmorphism */}
      <nav className="bg-[#FFFFFF]/60 backdrop-blur-xl border-b border-white/50 px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-[0_4px_30px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3 relative group">
          <div className="absolute inset-0 bg-[#7AE2CF]/20 blur-md rounded-full scale-110 group-hover:scale-125 transition-transform duration-500"></div>
          <img 
            src="https://ik.imagekit.io/0aqwhtubzo/New%20Folder/Untitled%20design%20(1).png" 
            alt="Logo" 
            className="w-12 h-12 object-contain rounded-full p-1 border-2 border-[#FDEB9E]/50 relative z-10 bg-white/50 backdrop-blur-sm"
          />
          <div className="relative z-10">
            <h1 className="text-xl font-extrabold text-[#000000] leading-tight tracking-tight">Arca Golden's Generation</h1>
            <p className="text-[10px] font-bold text-[#7AE2CF] uppercase tracking-widest">Sertifikat NFT by Blockchain</p>
          </div>
        </div>
        <button 
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-sm font-bold text-[#000000]/70 hover:text-[#000000] hover:bg-white/50 px-4 py-2 rounded-xl transition-all border border-transparent hover:border-white/50 hover:shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </button>
      </nav>

      <main className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white/40 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.04)] border border-white/60 overflow-hidden mt-4 relative">
          <div className="border-b border-white/50 bg-gradient-to-r from-white/60 to-white/20 p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-white/60 flex items-center justify-center shrink-0 border border-white/80 shadow-sm backdrop-blur-sm">
                <Award className="w-7 h-7 text-[#000000]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-[#000000] tracking-tight">
                  {userRole === 'shop' ? 'Manajemen Sertifikat' : 'Sertifikat Saya'}
                </h1>
                <p className="text-[#000000]/70 mt-1.5 text-sm font-medium">
                  {userRole === 'shop' ? 'Kelola semua NFT Emas yang terdaftar di sistem' : 'Daftar kepemilikan NFT Emas di wallet Anda'}
                </p>
              </div>
            </div>
            
            {walletAddress && (
              <div className="bg-white/50 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/80 inline-flex items-center gap-3 max-w-fit shadow-sm">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7AE2CF] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#7AE2CF]"></span>
                </span>
                <span className="font-mono text-sm font-bold text-[#000000]">
                  {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 4)}
                </span>
              </div>
            )}
          </div>

          <div className="p-6 md:p-10 min-h-[50vh]">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse bg-[#FFFFFF] p-3 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] border-2 border-[#FDEB9E]/50 h-[480px]">
                    <div className="bg-gradient-to-br from-[#FFFFFF] to-[#f8f9fa] h-full rounded-2xl border-2 border-[#7AE2CF]/10 p-6 flex flex-col relative overflow-hidden">
                      <div className="flex flex-col items-center justify-center h-full space-y-6">
                        <div className="w-16 h-16 bg-slate-200 rounded-full"></div>
                        <div className="w-3/4 h-6 bg-slate-200 rounded-md"></div>
                        <div className="w-1/2 h-4 bg-slate-200 rounded-md"></div>
                        <div className="w-full h-24 bg-slate-100 rounded-xl mt-4"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-red-800 break-words whitespace-pre-wrap">{error}</p>
                </div>
                {error.includes("hidden_certificates") && (
                  <div className="mt-4 bg-white p-4 rounded-lg border border-red-100 overflow-x-auto w-full">
                    <p className="text-xs font-bold text-slate-700 mb-2">Jalankan SQL berikut di Dashboard Supabase {'>'} SQL Editor:</p>
                    <pre className="text-[10px] sm:text-xs text-slate-800 bg-slate-50 p-3 rounded font-mono border border-slate-200">
{`CREATE TABLE IF NOT EXISTS public.hidden_certificates (
  id SERIAL PRIMARY KEY,
  token_id TEXT UNIQUE NOT NULL
);

GRANT ALL ON TABLE public.hidden_certificates TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.hidden_certificates_id_seq TO postgres, anon, authenticated, service_role;

ALTER TABLE public.hidden_certificates DISABLE ROW LEVEL SECURITY;`}
                    </pre>
                  </div>
                )}
                <div className="mt-2 text-right w-full">
                   <button onClick={() => {setError(null); checkWalletAndFetch(userRole);}} className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 font-medium transition-colors">Tutup & Coba Lagi</button>
                </div>
              </div>
            ) : certificates.length === 0 ? (
              <div className="text-center py-16 px-6 border-2 border-dashed border-[#7AE2CF]/50 rounded-3xl bg-[#FFFFFF] shadow-inner max-w-2xl mx-auto">
                <div className="w-20 h-20 bg-[#FDEB9E]/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Award className="w-10 h-10 text-[#000000]" />
                </div>
                <h3 className="text-2xl font-black text-[#000000] mb-3 tracking-tight">Belum ada Sertifikat</h3>
                <p className="text-[#000000]/70 text-sm font-medium leading-relaxed max-w-md mx-auto">
                  {userRole === 'shop' 
                    ? 'Belum ada data sertifikat NFT Emas yang diterbitkan di dalam sistem.' 
                    : `Wallet Anda (${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}) belum memiliki NFT Sertifikat Emas. Sertifikat akan muncul di sini setelah alamat dompet ini didaftarkan.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {certificates.map((cert) => (
                  cert.isLoading ? (
                    <div key={`skeleton-${cert.id}`} className="animate-pulse bg-[#FFFFFF] p-3 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] border-2 border-[#FDEB9E]/50 h-[480px]">
                      <div className="bg-gradient-to-br from-[#FFFFFF] to-[#f8f9fa] h-full rounded-2xl border-2 border-[#7AE2CF]/10 p-6 flex flex-col relative overflow-hidden">
                        <div className="flex flex-col items-center justify-center h-full space-y-6">
                          <div className="w-16 h-16 bg-slate-200 rounded-full"></div>
                          <div className="w-3/4 h-6 bg-slate-200 rounded-md"></div>
                          <div className="w-1/2 h-4 bg-slate-200 rounded-md"></div>
                          <div className="w-full h-24 bg-slate-100 rounded-xl mt-4"></div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div 
                      key={cert.id} 
                      className="relative group transition-all duration-300 hover:-translate-y-1"
                    >
                    {/* Floating Action Buttons */}
                    <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <button
                        onClick={() => navigate(`/user/transfer-gold?tokenId=${cert.id}`)}
                        className="bg-white/90 hover:bg-white text-blue-600 border border-blue-100 p-2 rounded-lg shadow-lg backdrop-blur-sm transition-all hover:scale-110"
                        title="Balik Nama (Transfer)"
                      >
                        <Replace className="w-5 h-5" />
                      </button>
                      {userRole === 'shop' && (
                        <button
                          onClick={() => handleDelete(cert.id, cert.token_name)}
                          disabled={deletingId === cert.id}
                          className="bg-white/90 hover:bg-white text-red-600 border border-red-100 p-2 rounded-lg shadow-lg backdrop-blur-sm transition-all hover:scale-110"
                          title="Hapus Sertifikat"
                        >
                          {deletingId === cert.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                        </button>
                      )}
                    </div>

                    {/* Certificate Outer Container */}
                    <div className="bg-[#FFFFFF] p-3 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(122,226,207,0.15)] border-2 border-[#FDEB9E]/50 h-full transition-all duration-300">
                      {/* Certificate Inner Frame */}
                      <div className="bg-gradient-to-br from-[#FFFFFF] to-[#FFFFFF] h-full rounded-2xl border-2 border-[#7AE2CF]/30 p-6 flex flex-col relative overflow-hidden">
                        
                        {/* Decorative Background Elements */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FDEB9E]/30 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#7AE2CF]/20 rounded-full -ml-16 -mb-16 blur-2xl"></div>
                        
                        {/* Header */}
                        <div className="text-center mb-6 relative">
                          <div className="inline-block p-1 bg-[#FDEB9E]/30 rounded-full mb-3 border border-[#FDEB9E]">
                            <div className="w-12 h-12 rounded-full bg-[#7AE2CF] flex items-center justify-center shadow-inner">
                              <Award className="w-6 h-6 text-[#000000]" />
                            </div>
                          </div>
                          <h4 className="text-[10px] font-black text-[#7AE2CF] uppercase tracking-[0.3em] font-sans">Official Certificate</h4>
                          <h3 className="text-xl font-sans font-black text-[#000000] mt-1 uppercase tracking-tight">Authenticity Token</h3>
                        </div>

                        {/* Content Body */}
                        <div className="flex-1 flex flex-col items-center text-center">
                          <div className="w-3/4 h-[2px] bg-gradient-to-r from-transparent via-[#FDEB9E] to-transparent mb-6"></div>
                          
                          <div className="mb-6 w-full">
                            <span className="block text-[10px] uppercase font-black text-[#000000]/40 tracking-widest mb-1.5 font-sans">Diterbitkan Untuk</span>
                            <div className="text-3xl font-serif italic text-[#000000] font-medium leading-tight px-2 break-words">
                              {cert.owner_name}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 w-full mb-6">
                            <div className="bg-[#FFFFFF]/60 border border-[#FDEB9E] p-3 rounded-xl shadow-sm backdrop-blur-sm">
                              <span className="block text-[9px] uppercase font-black text-[#000000]/50 tracking-wider mb-1 font-sans text-left">Spesifikasi</span>
                              <div className="text-sm font-bold text-[#000000] text-left truncate">{cert.token_name}</div>
                              <div className="text-[10px] text-[#7AE2CF] font-extrabold tracking-wide text-left mt-0.5">{cert.product_type} - {cert.category}</div>
                            </div>
                            <div className="bg-[#FFFFFF]/60 border border-[#FDEB9E] p-3 rounded-xl shadow-sm backdrop-blur-sm">
                              <span className="block text-[9px] uppercase font-black text-[#000000]/50 tracking-wider mb-1 font-sans text-right">Berat Murni</span>
                              <div className="text-2xl font-sans font-black text-[#000000] text-right">
                                {cert.weight_gram}<span className="text-xs ml-1 font-bold text-[#7AE2CF]">g</span>
                              </div>
                            </div>
                          </div>

                          {/* Validation Section */}
                          <div className="w-full space-y-3 mb-6">
                            <button 
                              onClick={() => handleValidateOnChain(cert)}
                              disabled={validatingId === cert.id}
                              className="w-full group/btn bg-[#7AE2CF] hover:bg-[#68d0bd] text-[#000000] py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(122,226,207,0.39)] hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0"
                            >
                              {validatingId === cert.id ? (
                                <><Loader2 className="w-4 h-4 animate-spin text-[#000000]"/> Verifikasi...</>
                              ) : (
                                <><ShieldCheck className="w-4 h-4 text-[#000000]" /> Verifikasi On-Chain</>
                              )}
                            </button>

                            {validationResult[cert.id] && (
                              <div className={`p-3 rounded-xl border-2 text-left animate-in fade-in slide-in-from-top-2 duration-300 ${
                                validationResult[cert.id].status === 'success' 
                                  ? 'bg-[#FFFFFF] border-[#7AE2CF] text-[#000000] shadow-[0_0_15px_rgba(122,226,207,0.15)]' 
                                  : 'bg-red-50 border-red-200 text-red-800'
                              }`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                                    validationResult[cert.id].status === 'success' ? 'bg-[#7AE2CF]' : 'bg-red-500'
                                  }`}></div>
                                  <span className="text-[11px] font-black uppercase tracking-widest text-[#000000]">
                                    {validationResult[cert.id].status === 'success' ? 'Terverifikasi ✓' : 'Gagal Verifikasi ✗'}
                                  </span>
                                </div>
                                {validationResult[cert.id].status === 'success' ? (
                                  <p className="text-[10px] font-mono leading-tight font-bold text-[#000000]/70 break-all">
                                    Owner: {validationResult[cert.id].owner}
                                  </p>
                                ) : (
                                  <p className="text-[10px] font-medium leading-tight opacity-90">
                                    {validationResult[cert.id].error}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Footer Info */}
                        <div className="mt-auto pt-4 border-t-2 border-[#FDEB9E]/40 flex items-end justify-between gap-4">
                          <div className="text-left overflow-hidden max-w-[60%]">
                            <span className="block text-[8px] uppercase font-black text-[#000000]/40 tracking-[0.1em] mb-1.5 font-sans">Token Identifier</span>
                            <div className="font-mono text-[9px] font-bold text-[#000000] truncate bg-[#FDEB9E]/20 px-2 py-1.5 rounded-lg border border-[#FDEB9E]" title={cert.formatted_id}>
                              {cert.formatted_id}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="block text-[8px] uppercase font-black text-[#000000]/40 tracking-[0.1em] mb-1.5 font-sans">Issue Date</span>
                            <div className="text-[10px] font-bold text-[#000000] bg-[#7AE2CF]/10 px-2 py-1.5 rounded-lg border border-[#7AE2CF]/30">
                              {new Date(cert.mint_date).toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric'})}
                            </div>
                          </div>
                        </div>

                        {/* Holographic-like Seal Overlay (Bottom Right) */}
                        <div className="absolute -bottom-6 -right-6 w-24 h-24 border-[6px] border-[#FDEB9E] rounded-full pointer-events-none opacity-40"></div>
                      </div>
                    </div>
                  </div>
                  )
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  </div>
  );
}
