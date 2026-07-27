import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ethers } from 'ethers';
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowLeft, 
  Replace, 
  ChevronDown, 
  User, 
  Wallet, 
  Award, 
  Info, 
  X, 
  ShieldCheck, 
  Sparkles, 
  ArrowRight,
  TrendingDown,
  Lock,
  Globe
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract';
import { motion, AnimatePresence } from 'framer-motion';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'loading';
  text: string;
}

export function TransferPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tokenId, setTokenId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  
  const [isValidAddress, setIsValidAddress] = useState<boolean | null>(null);
  const [addressError, setAddressError] = useState('');
  
  const [transferring, setTransferring] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [walletAddress, setWalletAddress] = useState<string>('');
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loadingCerts, setLoadingCerts] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [currentWallet, setCurrentWallet] = useState('');

  const [onChainTokenId, setOnChainTokenId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string>('customer');

  // Unified Toast Dispatcher
  const showToast = (type: 'success' | 'error' | 'info' | 'loading', text: string) => {
    setToasts((prev) => {
      // Clear dynamic/loading toasts to avoid messy accumulation
      let filtered = prev;
      if (type === 'loading' || type === 'success' || type === 'error' || type === 'info') {
        filtered = prev.filter((t) => t.type !== 'loading');
      }

      const id = Math.random().toString(36).substring(2, 9);
      
      // Auto dismiss complete states after a few seconds
      if (type === 'success') {
        setTimeout(() => {
          setToasts((current) => current.filter((t) => t.id !== id));
        }, 6500);
      } else if (type === 'error') {
        setTimeout(() => {
          setToasts((current) => current.filter((t) => t.id !== id));
        }, 8500);
      } else if (type === 'info') {
        setTimeout(() => {
          setToasts((current) => current.filter((t) => t.id !== id));
        }, 6500);
      }

      return [...filtered, { id, type, text }];
    });
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const role = session?.user?.user_metadata?.role || 'customer';
      setUserRole(role);
      checkWalletAndFetch(role);
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleUseCurrentWallet = () => {
    if (currentWallet) {
      setNewAddress(currentWallet);
      setIsValidAddress(true);
      setAddressError('');
      showToast('info', 'Berhasil menyalin dompet aktif MetaMask Anda.');
    } else {
      showToast('error', 'Wallet belum terhubung. Pastikan MetaMask Anda aktif.');
    }
  };

  const checkWalletAndFetch = async (role: string) => {
    setLoadingCerts(true);
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask tidak terdeteksi.');
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        const address = accounts[0].address;
        setWalletAddress(address);
        setCurrentWallet(address);
        await fetchCertificates(address, role);
      } else {
        if (role === 'shop') {
          await fetchCertificates('', role);
        } else {
          setLoadingCerts(false);
        }
      }
    } catch (err: any) {
      console.error(err.message);
      if (role === 'shop') {
        await fetchCertificates('', role);
      } else {
        setLoadingCerts(false);
      }
    }
  };

  const fetchCertificates = async (address: string, role: string) => {
    try {
      if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
        setCertificates([]);
        setLoadingCerts(false);
        return;
      }

      if (!window.ethereum) throw new Error('MetaMask tidak terdeteksi.');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

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
          console.warn("Gagal ambil totalSupply", err);
        }
      }

      let hiddenTokens: string[] = [];
      try {
        const { data } = await supabase.from('hidden_certificates').select('token_id');
        if (data) hiddenTokens = data.map(d => String(d.token_id));
      } catch(e) {}

      let overrides: any[] = [];
      try {
        const { data } = await supabase.from('certificate_metadata_overrides').select('*');
        if (data) overrides = data;
      } catch(e) {}

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

        if (uri.startsWith('data:application/json;base64,')) {
          try {
            return JSON.parse(atob(uri.split(',')[1]));
          } catch(e) {}
        }

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

      const tokenIds: number[] = [];
      let isEnumerable = false;
      try {
        const indexPromises = [];
        for (let idx = 0; idx < total; idx++) {
          indexPromises.push(contract.tokenByIndex(idx));
        }
        const tids = await Promise.all(indexPromises);
        tokenIds.push(...tids.map(Number));
        isEnumerable = true;
      } catch (enumerableErr) {
        console.warn("Smart contract tidak mendukung ERC721Enumerable or tokenByIndex:", enumerableErr);
      }

      if (!isEnumerable || tokenIds.length === 0) {
        for (let i = total - 1; i >= 0; i--) {
          tokenIds.push(i);
        }
      }

      // Proses setiap token ID secara paralel
      const certPromises = tokenIds.map(async (tokenId) => {
        try {
          if (hiddenTokens.includes(String(tokenId))) return null;
          
          let owner;
          try {
            owner = await contract.ownerOf(tokenId);
          } catch (ownerErr: any) {
            console.warn(`Token ID ${tokenId} tidak ditemukan atau sudah dibakar. Skip.`);
            return null;
          }
          
          if (role === 'shop' || (address && owner.toLowerCase() === address.toLowerCase())) {
            const uri = await contract.tokenURI(tokenId);
            try {
              const meta = await fetchWithFallback(uri);
              
              const findAttr = (trait: string) => meta.attributes?.find((a: any) => a.trait_type === trait)?.value;
              const onChainOwnerName = findAttr("Pemilik") || "Unknown";
              const dbOverride = overrides.find(o => String(o.token_id) === String(tokenId));
              const localOverride = localStorage.getItem(`override_owner_name_${tokenId}`);
              const ownerName = dbOverride?.owner_name || localOverride || onChainOwnerName;

              return {
                id: tokenId.toString(),
                token_id: tokenId,
                token_name: meta.name,
                owner_name: ownerName,
                weight_gram: meta.attributes?.find((a: any) => a.trait_type === "Gram Emas")?.value || 0,
                owner_address: owner,
                raw_metadata: meta,
                category: findAttr("Kategori") || "Logam Mulia",
                product_type: findAttr("Tipe Produk") || "Emas Fisik"
              };
            } catch (e) {
              console.warn(`Gagal ambil metadata Token ${tokenId}`, e);
              return {
                id: tokenId.toString(),
                token_id: tokenId,
                token_name: `Token #${tokenId} (IPFS Syncing)`,
                weight_gram: 0,
                owner_name: "Memproses...",
                owner_address: owner
              };
            }
          }
        } catch (e) {
          console.warn(`Gagal memproses Token ID ${tokenId}:`, e);
        }
        return null;
      });

      const results = await Promise.all(certPromises);
      const allCerts = results.filter((cert): cert is any => cert !== null);

      setCertificates(allCerts);
      const preselectedId = searchParams.get('tokenId');
      if (preselectedId) {
        const certToSelect = allCerts.find((c: any) => c.id === preselectedId);
        if (certToSelect) {
          handleSelectCert(certToSelect);
        }
      }
    } catch (err: any) {
      console.error('Error fetching certs on-chain:', err);
    } finally {
      setLoadingCerts(false);
    }
  };

  const handleSelectCert = (cert: any) => {
    setTokenId(cert.id);
    setOnChainTokenId(Number(cert.token_id));
    setSearchQuery(`${cert.token_name} - ${cert.weight_gram ? cert.weight_gram + 'g' : ''} (ID: ${cert.id})`);
    setIsDropdownOpen(false);
    showToast('info', `Sertifikat ID: ${cert.id} berhasil dipilih.`);
  };

  const validateAddress = () => {
    if (!newAddress) {
      setIsValidAddress(false);
      setAddressError('Alamat dompet tidak boleh kosong');
      showToast('error', 'Alamat dompet tidak boleh kosong.');
      return;
    }
    const isValid = ethers.isAddress(newAddress);
    if (!isValid) {
      setIsValidAddress(false);
      setAddressError('Alamat tersebut Belum ada / Tidak terdeteksi. Mohon Menggunakan Alamat Lain');
      showToast('error', 'Format alamat wallet pembeli tidak valid.');
    } else {
      setIsValidAddress(true);
      setAddressError('');
      showToast('success', 'Alamat wallet pembeli sah & terdeteksi.');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenId) {
      showToast('error', 'Token ID / ID Sertifikat tidak boleh kosong.');
      return;
    }
    if (!newOwnerName?.trim()) {
      showToast('error', 'Nama pemilik baru tidak boleh kosong.');
      return;
    }
    if (!isValidAddress) {
      showToast('error', 'Harap lakukan validasi alamat wallet pembeli terlebih dahulu.');
      return;
    }

    setTransferring(true);

    try {
      if (!window.ethereum) throw new Error('MetaMask tidak terdeteksi.');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      if (network.chainId !== 11155111n) {
        throw new Error('Harap ganti jaringan ke Sepolia Testnet di MetaMask.');
      }
      
      const signer = await provider.getSigner();
      if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
        throw new Error("Smart Contract belum terdeteksi.");
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const fromAddress = await signer.getAddress();

      const selectedCert = certificates.find((c: any) => c.id === tokenId);
      if (!selectedCert) throw new Error("Sertifikat tidak lengkap di database.");

      // 1. Metadata IPFS upload
      showToast('loading', 'Menyiapkan & mengunggah metadata Pemilik Baru ke IPFS (Pinata)...');
      let newIpfsUri = "";

      try {
        let updatedMetadata = selectedCert.raw_metadata ? JSON.parse(JSON.stringify(selectedCert.raw_metadata)) : null;
        if (!updatedMetadata) {
          updatedMetadata = {
            name: selectedCert.token_name || `Sertifikat Emas #${tokenId}`,
            description: `Sertifikat NFT Emas Fisik: ${selectedCert.token_name || 'Emas'} untuk ${newOwnerName}.`,
            image: "ipfs://QmDummyImageHashSertifikatEmas",
            attributes: [
              { trait_type: "Pemilik", value: newOwnerName },
              { trait_type: "Kategori", value: "Logam Mulia" },
              { display_type: "number", trait_type: "Gram Emas", value: selectedCert.weight_gram || 0 },
              { display_type: "date", trait_type: "Tanggal Cetak", value: Math.floor(Date.now() / 1000) }
            ]
          };
        } else {
          // Perbarui value Pemilik
          let hasPemilik = false;
          if (updatedMetadata.attributes && Array.isArray(updatedMetadata.attributes)) {
            updatedMetadata.attributes = updatedMetadata.attributes.map((attr: any) => {
              if (attr.trait_type === "Pemilik") {
                hasPemilik = true;
                return { ...attr, value: newOwnerName };
              }
              return attr;
            });
          } else {
            updatedMetadata.attributes = [];
          }
          if (!hasPemilik) {
            updatedMetadata.attributes.push({ trait_type: "Pemilik", value: newOwnerName });
          }
          updatedMetadata.description = `Sertifikat NFT Emas Fisik: ${selectedCert.token_name || 'Emas'} dengan pemilik baru: ${newOwnerName}.`;
        }

        const resUpload = await fetch('/api/pinata/upload-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedMetadata)
        });
        const uploadResData = await resUpload.json();
        if (uploadResData.success && uploadResData.ipfsUri) {
          newIpfsUri = uploadResData.ipfsUri;
        }
      } catch (uploadErr) {
        console.warn("Gagal mengunggah metadata ter-update ke IPFS, akan lanjut menggunakan fallback database:", uploadErr);
      }

      showToast('loading', 'Mengestimasi kebutuhan gas fee di Blockchain Sepolia...');
      let estimatedGas;
      try {
        estimatedGas = await contract.safeTransferFrom.estimateGas(fromAddress, newAddress, onChainTokenId);
      } catch (gasError: any) {
        throw new Error(`Gagal mengestimasi gas. Pastikan Anda adalah pemilik sah NFT ini.`);
      }

      const gasLimit = (estimatedGas * 110n) / 100n;
      const feeData = await provider.getFeeData();

      showToast('info', 'Harap setujui transaksi Balik Nama (safeTransferFrom) di dompet MetaMask Anda.');

      const tx = await contract.safeTransferFrom(fromAddress, newAddress, onChainTokenId, {
        gasLimit: gasLimit,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      });
      
      showToast('loading', 'Menunggu konfirmasi block transaksi Balik Nama dari Blockchain...');
      await tx.wait();

      // 2. Set Token URI if supported
      if (newIpfsUri) {
        try {
          if (typeof contract.setTokenURI === 'function') {
            showToast('loading', 'Menautkan data pemilik baru secara On-Chain (Set Token URI)...');
            const txUri = await contract.setTokenURI(onChainTokenId, newIpfsUri);
            await txUri.wait();
          }
        } catch (contractErr) {
          console.warn("Contract belum mendukung setTokenURI atau transaksi gagal. Lanjut menyimpan ke database override:", contractErr);
        }
      }

      // 3. Database & LocalStorageSync fallback write
      showToast('loading', 'Sinkronisasi pemutakhiran data pemilik baru ke Database...');
      
      localStorage.setItem(`override_owner_name_${tokenId}`, newOwnerName);

      try {
        const { error: dbErr } = await supabase
          .from('certificate_metadata_overrides')
          .upsert([
            { token_id: tokenId, owner_name: newOwnerName }
          ], { onConflict: 'token_id' });
        if (dbErr) console.warn("Supabase upsert override error:", dbErr);
      } catch (dbEx) {
        console.warn("Supabase upsert override exception:", dbEx);
      }

      showToast('success', `Berhasil! Balik nama Token #${tokenId} selesai. Pemilik baru sah: "${newOwnerName}".`);
      
      setTokenId('');
      setSearchQuery('');
      setNewAddress('');
      setNewOwnerName('');
      setIsValidAddress(null);
      if (walletAddress) {
        checkWalletAndFetch(userRole);
      }
    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || 'Terjadi kesalahan saat memproses balik nama.';
      
      if (err.code === 'ACTION_REJECTED' || err.message.includes('user rejected')) {
        errorMsg = 'Transaksi dibatalkan oleh pengguna (User rejected the request).';
      } else if (err.code === 'INSUFFICIENT_FUNDS' || err.message.includes('insufficient funds')) {
        errorMsg = 'Saldo Sepolia ETH Anda tidak cukup untuk membayar Gas Fee.';
      } else if (err.message.includes('network')) {
        errorMsg = 'Jaringan tidak sesuai. Harap pastikan MetaMask terhubung ke Sepolia Testnet.';
      } else if (err.message.includes('execution reverted') || err.message.includes('0x177e802f')) {
        errorMsg = 'Transaksi ditolak blockchain. Pastikan Anda adalah pemilik sah (owner) dari ID Token ini.';
      }

      showToast('error', errorMsg);
    } finally {
      setTransferring(false);
    }
  };

  const filteredCerts = certificates.filter(cert => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return cert.token_name?.toLowerCase().includes(searchLower) ||
           cert.category?.toLowerCase().includes(searchLower) ||
           cert.product_type?.toLowerCase().includes(searchLower) ||
           cert.id?.toLowerCase().includes(searchLower);
  });

  const selectedCert = certificates.find((c: any) => c.id === tokenId);

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-[#7AE2CF] selection:text-[#000000] relative overflow-hidden flex flex-col">
      {/* Background Orbs */}
      <div className="fixed top-[20%] left-[-10%] w-[45%] h-[45%] bg-[#7AE2CF]/15 rounded-full blur-[130px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[10%] right-[-10%] w-[45%] h-[45%] bg-[#FDEB9E]/20 rounded-full blur-[130px] pointer-events-none z-0"></div>

      {/* Navbar Glassmorphism */}
      <nav className="bg-[#FFFFFF]/75 backdrop-blur-xl border-b border-slate-200/50 px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3 relative group">
          <div className="absolute inset-0 bg-[#7AE2CF]/10 blur-md rounded-full scale-110 group-hover:scale-125 transition-transform duration-500"></div>
          <img 
            src="https://ik.imagekit.io/0aqwhtubzo/New%20Folder/Untitled%20design%20(1).png" 
            alt="Logo" 
            className="w-11 h-11 object-contain rounded-full p-1 border border-[#FDEB9E] relative z-10 bg-white"
          />
          <div className="relative z-10">
            <h1 className="text-lg font-black text-slate-800 leading-tight tracking-tight">Arca Golden's Generation</h1>
            <p className="text-[9px] font-bold text-[#56ccb6] uppercase tracking-widest">Sertifikat NFT by Blockchain</p>
          </div>
        </div>
        <button 
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-4 py-2 rounded-xl border border-slate-200 transition-all shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </button>
      </nav>

      <main className="p-4 md:p-8 relative z-10 flex-1 flex flex-col justify-center">
        <div className="max-w-6xl w-full mx-auto">
          
          {/* Main Layout Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Form Control Panel */}
            <div className="lg:col-span-7 bg-white/80 backdrop-blur-md rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.03)] border border-white p-6 md:p-8 space-y-6">
              
              {/* Box Description Header */}
              <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
                <div className="w-12 h-12 rounded-2xl bg-[#7AE2CF]/10 border border-[#7AE2CF]/25 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                  <Replace className="w-6 h-6 text-[#45b7a1]" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-slate-800 tracking-tight">Balik Nama (Transfer Aset)</h1>
                  <p className="text-slate-500 text-xs font-semibold mt-0.5">Metode mutasi kepemilikan emas on-chain & rebranding sertifikasi.</p>
                </div>
              </div>

              <form onSubmit={handleTransfer} className="space-y-6">
                
                {/* 1. Selector Dropdown of Certificate */}
                <div className="relative" ref={dropdownRef}>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-slate-400" />
                    Pilih Sertifikat Milik Anda
                  </label>
                  
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (e.target.value !== tokenId) {
                          setTokenId('');
                        }
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      className="w-full pl-4 pr-10 py-3 rounded-2xl border-2 border-slate-200/80 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 outline-none transition-all placeholder:text-slate-400 text-sm font-semibold text-slate-700 bg-white"
                      placeholder="Cari atau pilih emas Anda... (Contoh: Arca 2g)"
                    />
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none transition-transform" />
                  </div>
                  
                  {isDropdownOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-md border-2 border-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.08)] rounded-2xl max-h-60 overflow-auto divide-y divide-slate-100">
                      {loadingCerts ? (
                        <div className="p-5 text-center text-xs font-semibold text-slate-500 flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-[#7AE2CF]" /> Mengamankan data dari blockchain...
                        </div>
                      ) : filteredCerts.length > 0 ? (
                        <ul>
                          {filteredCerts.map((cert) => (
                            <li 
                              key={cert.id}
                              onClick={() => handleSelectCert(cert)}
                              className="px-4 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between"
                            >
                              <div className="flex-1 min-w-0 pr-6">
                                <div className="font-extrabold text-[#000000] text-sm truncate flex items-center gap-1.5">
                                  <span>{cert.token_name}</span>
                                  {cert.weight_gram && <span className="text-[10px] font-black text-[#58ceb8] bg-[#7AE2CF]/10 px-2 py-0.5 rounded-full">{cert.weight_gram} Gram</span>}
                                </div>
                                <div className="text-[11px] text-slate-400 font-bold mt-1 tracking-wide flex items-center gap-1 truncate font-mono">
                                  ID: {cert.id} • {cert.product_type}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap block max-w-[120px] truncate">
                                  O: {cert.owner_name}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="p-5 text-center text-xs font-bold text-slate-400">
                          {certificates.length === 0 
                            ? walletAddress ? 'Sertifikat tidak terdeteksi di wallet ini.' : 'Sambungkan dompet MetaMask Anda.'
                            : 'Pencarian tidak ditemukan.'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Token Snapshot Bubble */}
                  {selectedCert && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between"
                    >
                      <div className="text-xs text-slate-600 flex items-center gap-2 font-medium">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Terpilih: <strong>ID {selectedCert.id}</strong> (On-Chain)</span>
                      </div>
                      <div className="text-[11px] text-[#42b5a0] bg-[#7AE2CF]/5 border border-[#7AE2CF]/20 font-black tracking-wide uppercase px-2 py-0.5 rounded-lg">
                        Pemilik Lama: {selectedCert.owner_name}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* 2. New Owner Name Fields */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Nama Pemilik Baru (New Owner Name)
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!tokenId}
                    value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200/80 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 outline-none transition-all placeholder:text-slate-400 text-sm font-semibold text-slate-700 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed"
                    placeholder={tokenId ? "Ketik nama lengkap pemilik baru (contoh: Ahmad Farhan)" : "Pilih sertifikat terlebih dahulu"}
                  />
                  <p className="text-[10px] text-slate-400 font-medium mt-1.5">Nama ini akan diunggah ke metadata IPFS IPFS dan dikunci di blockchain.</p>
                </div>

                {/* 3. Recipient Wallet Address Field */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-slate-400" />
                      Alamat Wallet Pembeli (New Owner)
                    </label>
                    {currentWallet && tokenId && (
                      <button 
                        type="button" 
                        onClick={handleUseCurrentWallet}
                        className="text-[11px] text-[#44bca4] hover:text-[#2d917d] font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        + Gunakan Wallet Saya (Pengujian)
                      </button>
                    )}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        required
                        disabled={!tokenId}
                        value={newAddress}
                        onChange={(e) => {
                          setNewAddress(e.target.value);
                          setIsValidAddress(null);
                        }}
                        className={`w-full pl-4 pr-10 py-3 rounded-2xl border-2 outline-none text-sm font-mono transition-all ${
                          isValidAddress === true 
                            ? 'border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 bg-emerald-50/10' 
                            : isValidAddress === false
                            ? 'border-rose-400 focus:ring-4 focus:ring-rose-400/10 bg-rose-50/10'
                            : 'border-slate-200/80 focus:border-[#7AE2CF] focus:ring-4 focus:ring-[#7AE2CF]/10 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed'
                        }`}
                        placeholder={tokenId ? "0x..." : "Pilih sertifikat terlebih dahulu"}
                      />
                      {isValidAddress === true && (
                        <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={!tokenId}
                      onClick={validateAddress}
                      className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-2xl border-2 border-slate-200 transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Validasi Alamat
                    </button>
                  </div>
                  {isValidAddress === false && (
                    <p className="mt-2 text-xs font-semibold text-rose-500 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {addressError}
                    </p>
                  )}
                </div>

                {/* Sign and Trigger Process buttons */}
                <div className="pt-6 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={transferring || isValidAddress === false || !tokenId}
                    className="w-full bg-gradient-to-r from-[#7AE2CF] to-[#b3edd1] hover:from-[#65cca8] hover:to-[#9ee7c3] text-slate-900 font-black text-xs uppercase tracking-widest py-4 px-4 rounded-2xl transition-all shadow-md shadow-[#7AE2CF]/10 hover:shadow-lg hover:shadow-[#7AE2CF]/15 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                  >
                    {transferring ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                        SINKRONISASI BLOCKCHAIN...
                      </>
                    ) : (
                      <>
                        <Replace className="w-4 h-4 text-slate-900" />
                        EKSEKUSI BALIK NAMA
                      </>
                    )}
                  </button>
                  
                  <div className="flex items-center gap-2 justify-center mt-5">
                    <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Metamask Sepolia Testnet Gateway</p>
                  </div>
                </div>
              </form>
            </div>

            {/* Right Column: Visual NFT Dynamic Certificate Preview */}
            <div className="lg:col-span-5 flex justify-center">
              <AnimatePresence mode="wait">
                {selectedCert ? (
                  <motion.div 
                    key="active-cert"
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -15 }}
                    className="w-full max-w-sm"
                  >
                    {/* Shadow Layer Accent */}
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-tr from-[#7AE2CF]/30 to-[#FDEB9E]/20 rounded-3xl blur-2xl opacity-60 scale-95 group-hover:scale-100 transition-all duration-500"></div>
                      
                      {/* NFT Certificate Box */}
                      <div className="bg-[#FFFFFF] p-3 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.03)] border-2 border-[#FDEB9E]/60 relative z-10 transition-transform duration-300">
                        {/* Frame Border Canvas */}
                        <div className="bg-gradient-to-br from-[#FFFFFF] to-[#FDFDFD] rounded-2xl border-2 border-[#7AE2CF]/30 p-6 flex flex-col relative overflow-hidden">
                          
                          {/* Top Right Luxury Seals */}
                          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FDEB9E]/20 rounded-full -mr-16 -mt-16 blur-xl pointer-events-none"></div>
                          <div className="absolute bottom-0 left-0 w-28 h-28 bg-[#7AE2CF]/10 rounded-full -ml-14 -mb-14 blur-xl pointer-events-none"></div>

                          {/* Decorative Holographic Badge */}
                          <div className="absolute top-4 right-4 bg-slate-50 border border-slate-100 p-1.5 rounded-xl flex items-center justify-center shadow-inner">
                            <Lock className="w-3.5 h-3.5 text-amber-500" />
                          </div>

                          {/* Headers */}
                          <div className="text-center mb-6">
                            <div className="inline-block p-1 bg-[#FDEB9E]/20 rounded-full mb-3 border border-[#FDEB9E]/40">
                              <div className="w-11 h-11 rounded-full bg-[#7AE2CF] flex items-center justify-center shadow-inner">
                                <Award className="w-5 h-5 text-slate-900" />
                              </div>
                            </div>
                            <h4 className="text-[9px] font-black text-[#50c2af] uppercase tracking-[0.25em]">Authentic NFT Asset</h4>
                            <h3 className="text-md font-black text-slate-800 leading-tight mt-1">EMAS CERTIFICATION</h3>
                          </div>

                          {/* Gold Divider */}
                          <div className="w-3/4 h-[1.5px] bg-gradient-to-r from-transparent via-[#FDEB9E] to-transparent mb-5 mx-auto"></div>

                          {/* Live Dynamic Name Display */}
                          <div className="text-center mb-5 w-full bg-slate-50/50 border border-slate-100/50 py-4 px-2 rounded-2xl relative">
                            <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-widest mb-1.5">MUTASI KEPEMILIKAN SEMENTARA</span>
                            
                            {newOwnerName.trim() ? (
                              <div className="space-y-1 animate-pulse">
                                <div className="text-xs line-through text-slate-400 font-bold tracking-wide">
                                  {selectedCert.owner_name}
                                </div>
                                <div className="flex items-center justify-center gap-1 text-[#42bca4] text-lg font-serif italic font-extrabold break-words px-3">
                                  <span>{newOwnerName}</span>
                                </div>
                                <span className="inline-block text-[8px] uppercase tracking-wider font-extrabold text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-full mt-1 animate-bounce">
                                  Calon Pemilik Baru
                                </span>
                              </div>
                            ) : (
                              <div className="text-md font-serif italic text-slate-700 font-extrabold break-words px-3 leading-snug">
                                {selectedCert.owner_name}
                                <span className="block text-[8px] tracking-normal uppercase font-black text-slate-400 mt-1 not-italic">
                                  (Pemilik On-Chain Saat Ini)
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Specs Grid */}
                          <div className="grid grid-cols-2 gap-3 w-full mb-5 text-left">
                            <div className="bg-slate-50/80 border border-slate-100 p-2.5 rounded-xl shadow-sm">
                              <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Spesifikasi</span>
                              <div className="text-xs font-black text-slate-800 truncate">{selectedCert.token_name}</div>
                              <div className="text-[9px] text-[#4dbdaf] font-semibold mt-0.5">{selectedCert.product_type}</div>
                            </div>
                            <div className="bg-slate-50/80 border border-slate-100 p-2.5 rounded-xl shadow-sm flex flex-col justify-center items-end text-right">
                              <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Berat Logam</span>
                              <div className="text-lg font-black text-slate-800">
                                {selectedCert.weight_gram}<span className="text-xs font-extrabold text-[#7AE2CF]">g</span>
                              </div>
                            </div>
                          </div>

                          {/* Security Stamp info */}
                          <div className="border border-emerald-100 bg-emerald-50/30 p-2.5 rounded-xl flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                            <p className="text-[10px] font-bold text-slate-500 tracking-wide text-left leading-normal">
                              Status: <span className="text-emerald-600">Terbuka untuk Balik Nama</span>. Aliran tanda tangan on-chain siap diverifikasi MetaMask Anda.
                            </p>
                          </div>

                          <div className="mt-4 flex items-center justify-between text-[10px] font-bold font-mono text-slate-400">
                            <span>Sertifikat ID: #{selectedCert.id}</span>
                            <span>ERC-721 Token</span>
                          </div>

                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="inactive-shell"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-sm h-full"
                  >
                    {/* Placeholder Crystal Glass Card */}
                    <div className="bg-[#FFFFFF]/40 backdrop-blur-md rounded-3xl border-2 border-dashed border-slate-200 p-8 h-full flex flex-col items-center justify-center text-center">
                      <div className="w-14 h-14 rounded-2xl bg-[#7AE2CF]/10 border border-[#7AE2CF]/10 text-[#45bba3] flex items-center justify-center mb-4">
                        <Sparkles className="w-6 h-6 animate-spin" style={{ animationDuration: '6s' }} />
                      </div>
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-2 font-sans">Live Preview Ready</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed max-w-[240px] font-medium grow-0">
                        Pilih salah satu Sertifikat Emas Milik Anda di sebelah kiri untuk melihat render visual serta melakukan simulasi balik nama secara langsung.
                      </p>

                      <div className="text-left w-full mt-8 bg-white border border-slate-100 p-4 rounded-2xl">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5">Panduan Balik Nama:</div>
                        <ul className="text-[11px] font-medium text-slate-500 space-y-2">
                          <li className="flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 text-[9px] font-black flex items-center justify-center mt-0.5">1</span>
                            <span>Sistem mengunggah metadata Pemilik Baru ke IPFS.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 text-[9px] font-black flex items-center justify-center mt-0.5">2</span>
                            <span>Metadata ditautkan secara on-chain menggunakan <code>setTokenURI</code>.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 text-[9px] font-black flex items-center justify-center mt-0.5">3</span>
                            <span>Token ERC-721 ditransfer ke alamat wallet pembeli.</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </main>

      {/* Elegant Toast Notification Stack (Bottom-Left) */}
      <div id="toast-container" className="fixed bottom-6 left-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 50, scale: 0.9, x: -20 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.85, x: -40, transition: { duration: 0.2 } }}
              className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl border-2 border-[#7AE2CF]/50 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] flex gap-3.5 items-start relative overflow-hidden group"
            >
              {/* Left Accent Bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                toast.type === 'success' ? 'bg-[#7AE2CF]' :
                toast.type === 'error' ? 'bg-rose-500' :
                toast.type === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-blue-500'
              }`} />
              
              <div className="shrink-0 mt-0.5 ml-1">
                {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#3eb7a0]" />}
                {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-500" />}
                {toast.type === 'loading' && <Loader2 className="w-5 h-5 animate-spin text-amber-500" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
              </div>
              
              <div className="flex-1 pr-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {toast.type === 'success' && 'Sukses'}
                  {toast.type === 'error' && 'Kesalahan'}
                  {toast.type === 'loading' && 'Memproses'}
                  {toast.type === 'info' && 'Metamask'}
                </p>
                <p className="text-xs font-semibold text-slate-700 leading-relaxed mt-0.5 break-words">
                  {toast.text}
                </p>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5 rounded-lg hover:bg-slate-100 transition-all self-start"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div>
  );
}
