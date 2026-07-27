import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ethers } from 'ethers';
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft, PlayCircle, Copy, X, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract';
import { CONTRACT_BYTECODE, CONTRACT_ABI as COMPILED_ABI } from '../lib/contractData';
import { motion, AnimatePresence } from 'framer-motion';

export function MintingPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Emas Tua');
  const [productType, setProductType] = useState('Kalung');
  const [recipient, setRecipient] = useState('');
  const [gram, setGram] = useState('');
  const [currentWallet, setCurrentWallet] = useState('');
  
  const [isValidAddress, setIsValidAddress] = useState<boolean | null>(null);
  const [addressError, setAddressError] = useState('');
  
  const [minting, setMinting] = useState(false);
  const [dateStr, setDateStr] = useState('');

  // Toast Notification State & Handlers
  interface Toast {
    id: string;
    type: 'success' | 'error' | 'info' | 'loading';
    text: string;
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (type: 'success' | 'error' | 'info' | 'loading', text: string) => {
    setToasts((prev) => {
      // Clear previous loading or info toasts to keep it clean and non-cluttered
      let filtered = prev;
      if (type === 'loading' || type === 'info' || type === 'success' || type === 'error') {
        filtered = prev.filter((t) => t.type !== 'loading' && t.type !== 'info');
      }

      const id = Math.random().toString(36).substring(2, 9);
      
      // Auto-remove temporary toasts
      if (type === 'success') {
        setTimeout(() => {
          setToasts((current) => current.filter((t) => t.id !== id));
        }, 6500);
      } else if (type === 'error') {
        setTimeout(() => {
          setToasts((current) => current.filter((t) => t.id !== id));
        }, 8500);
      }

      return [...filtered, { id, type, text }];
    });
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Deploy states
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState<string | null>(null);
  const [newContractAddress, setNewContractAddress] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [activeContractAddress, setActiveContractAddress] = useState<string>(
    CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" 
      ? CONTRACT_ADDRESS 
      : ''
  );

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const dateCode = `${dd}${mm}${yy}`;

  const tokenDisplayName = `${category} - ${productType}`;
  const tokenIdPreview = `${name || '[Nama]'} - ${dateCode} - [ID]`;

  useEffect(() => {
    const updateDate = () => {
      setDateStr(new Date().toLocaleString());
    };
    updateDate();
    const interval = setInterval(updateDate, 1000);
    
    // Cek wallet yg sedang terhubung
    const checkWallet = async () => {
      if (window.ethereum) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const accounts = await provider.listAccounts();
          if (accounts.length > 0) {
            setCurrentWallet(accounts[0].address);
          }
        } catch(e) {}
      }
    };
    checkWallet();
    
    return () => clearInterval(interval);
  }, []);

  const handleUseCurrentWallet = () => {
    if (currentWallet) {
      setRecipient(currentWallet);
      setIsValidAddress(true);
      setAddressError('');
    } else {
      showToast('error', 'Wallet belum terhubung. Pastikan MetaMask Anda aktif.');
    }
  };

  const validateAddress = () => {
    if (!recipient) {
      setIsValidAddress(false);
      setAddressError('Alamat dompet tidak boleh kosong');
      return;
    }
    const isValid = ethers.isAddress(recipient);
    if (!isValid) {
      setIsValidAddress(false);
      setAddressError('Alamat tersebut Belum ada / Tidak terdeteksi. Mohon Menggunakan Alamat Lain');
    } else {
      setIsValidAddress(true);
      setAddressError('');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deployContract = async () => {
    if (!isValidAddress) {
      showToast('error', 'Harap validasi Alamat Wallet Pemilik (Recipient) terlebih dahulu. Alamat ini akan menjadi Owner dari Smart Contract tersebut.');
      return;
    }
    
    try {
      setIsDeploying(true);
      setDeploySuccess(null);
      setNewContractAddress('');

      if (!window.ethereum) throw new Error('MetaMask tidak terdeteksi.');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      if (network.chainId !== 11155111n) {
        throw new Error('Harap ganti jaringan ke Sepolia Testnet di MetaMask.');
      }

      const signer = await provider.getSigner();
      const factory = new ethers.ContractFactory(COMPILED_ABI, CONTRACT_BYTECODE, signer);
      
      setDeploySuccess("Mohon konfirmasi transaksi deploy di MetaMask Anda. Menunggu block...");
      
      // Deploy contract dengan menjadikan currentWallet (toko/admin) sebagai initialOwner
      const contract = await factory.deploy(currentWallet || await signer.getAddress());
      
      setDeploySuccess("Transaksi terkirim... Menunggu block dimasukkan ke jaringan Sepolia.");
      await contract.waitForDeployment();
      
      const deployedAddress = await contract.getAddress();
      setNewContractAddress(deployedAddress);
      setActiveContractAddress(deployedAddress);
      localStorage.setItem('deployedContractAddress', deployedAddress);
      setDeploySuccess("Smart Contract Berhasil Dideploy! Anda sekarang dapat langsung mencetak (Mint) NFT di bawah.");

    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || 'Terjadi kesalahan saat deploy.';
      if (err.code === 'ACTION_REJECTED' || err.message.includes('user rejected')) {
        errorMsg = 'Deploy dibatalkan oleh pengguna (User rejected the request).';
      } else if (err.code === 'INSUFFICIENT_FUNDS' || err.message.includes('insufficient funds')) {
        errorMsg = 'Saldo Sepolia ETH Anda tidak cukup untuk membayar Gas Fee deploy.';
      } else if (err.message.includes('network')) {
        errorMsg = 'Jaringan tidak sesuai. Minta hubungkan MetaMask ke Sepolia Testnet.';
      }
      setDeploySuccess(null);
      showToast('error', "Error Deploy: " + errorMsg);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAddress) {
      showToast('error', 'Harap validasi alamat wallet terlebih dahulu sebelum mencetak NFT.');
      return;
    }
    if (!gram || parseFloat(gram) <= 0) {
      showToast('error', 'Harap masukkan berat emas (gram) yang valid.');
      return;
    }

    setMinting(true);

    try {
      let runBlockchain = true;
      let signer = null;
      let provider = null;

      try {
        if (!window.ethereum) {
          throw new Error('MetaMask tidak terdeteksi.');
        }
        provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        if (network.chainId !== 11155111n) {
          throw new Error('Harap ganti jaringan ke Sepolia Testnet di MetaMask.');
        }
        signer = await provider.getSigner();
      } catch (err: any) {
        console.warn("Gagal terhubung ke Web3, menggunakan mode Database: ", err);
        if (err.message.includes('fetch') || err.message.includes('MetaMask')) {
           runBlockchain = false;
        } else {
           throw err;
        }
      }

      let tokenIdGenerated = "";
      let tokenURI = `ipfs://dummy-hash-sepolia-${Date.now()}`;

      try {
        showToast('loading', 'Mengunggah metadata ke Pinata (IPFS)...');
        // Siapkan Metadata JSON (Standar OpenSea)
        const metadataJSON = {
          name: tokenDisplayName,
          description: `Sertifikat NFT Emas Fisik: ${tokenDisplayName} dengan berat ${gram} gram.`,
          image: "ipfs://QmDummyImageHashSertifikatEmas", // Placeholder gambar
          attributes: [
            { trait_type: "Pemilik", value: name },
            { trait_type: "Kategori", value: category },
            { trait_type: "Tipe Produk", value: productType },
            { display_type: "number", trait_type: "Gram Emas", value: parseFloat(gram) },
            { display_type: "date", trait_type: "Tanggal Cetak", value: Math.floor(Date.now() / 1000) }
          ]
        };

        const resUpload = await fetch('/api/pinata/upload-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metadataJSON)
        });
        
        if (resUpload.ok) {
          const dat = await resUpload.json();
          if (dat.success && dat.ipfsUri) {
            tokenURI = dat.ipfsUri;
            showToast('loading', `Metadata tersimpan di IPFS. Menunggu konfirmasi Dompet...`);
          }
        }
      } catch (err) {
        console.error("Gagal Pinata", err);
      }

      if (!activeContractAddress) {
        throw new Error("Smart Contract belum terdeteksi. Silakan deploy contract terlebih dahulu.");
      }

      if (runBlockchain && signer && provider) {
        const contract = new ethers.Contract(activeContractAddress, CONTRACT_ABI, signer);
        
        // 1. Estimasi gas fee
        showToast('loading', 'Mengestimasi gas fee...');
        let estimatedGas;
        try {
          estimatedGas = await contract.safeMint.estimateGas(recipient, tokenURI);
        } catch (gasError: any) {
          console.error("Estimasi gas gagal:", gasError);
          const errorData = gasError.data || (gasError.info && gasError.info.error && gasError.info.error.data) || (gasError.error && gasError.error.data) || "";
          const errorString = JSON.stringify(gasError);
          
          if (errorString.includes("0x118cdaa7") || errorData.includes("0x118cdaa7")) {
            throw new Error("Gagal: Anda bukan pemilik (Owner) dari Smart Contract ini. Minting hanya bisa dilakukan oleh dompet yang mendeploy contract.");
          }
          throw new Error("Gagal mengestimasi gas. Pastikan alamat recipient dan tokenURI valid, atau saldo Sepolia ETH mencukupi.");
        }

        const gasLimit = (estimatedGas * 110n) / 100n;
        const feeData = await provider.getFeeData();

        showToast('loading', 'Silakan konfirmasi transaksi di popup MetaMask Anda...');

        const tx = await contract.safeMint(recipient, tokenURI, {
          gasLimit: gasLimit,
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        });

        showToast('loading', 'Transaksi dikirim ke Blockchain, memotong gas fee. Menunggu konfirmasi block...');
        const receipt = await tx.wait();

        for (const log of receipt.logs) {
          // In ethers v6, logs might already be parsed if they match the contract ABI
          if ((log as any).eventName === 'Transfer' || (log as any).name === 'Transfer') {
             tokenIdGenerated = (log as any).args[2].toString();
             break;
          }
          try {
            const parsedLog = contract.interface.parseLog({
               topics: [...log.topics],
               data: log.data
            });
            if (parsedLog && parsedLog.name === "Transfer") {
              tokenIdGenerated = parsedLog.args[2].toString();
              break;
            }
          } catch (e) {
            // ignore
          }
        }

        if (!tokenIdGenerated) {
          console.warn("Receipt logs:", receipt.logs);
          tokenIdGenerated = "Tersembunyi (Cek di Explorer/My Certificates)";
        }
      } else {
        throw new Error("Koneksi Blockchain tidak tersedia. Pastikan MetaMask terhubung ke Sepolia.");
      }

      const finalFormattedId = `${name} - ${dateCode} - ${tokenIdGenerated}`;
      showToast('success', `Sertifikat NFT "${tokenDisplayName}" (${gram} Gram) berhasil dicetak!\n\nBlockchain Token ID: ${finalFormattedId}\n\nData disimpan sepenuhnya secara on-chain di Sepolia.`);
      
      // Reset Form
      setName('');
      setRecipient('');
      setGram('');
      setIsValidAddress(null);
    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || 'Terjadi kesalahan saat mencetak NFT.';
      
      // Deteksi error spesifik MetaMask / Blockchain
      if (err.code === 'ACTION_REJECTED' || err.message.includes('user rejected')) {
        errorMsg = 'Transaksi dibatalkan oleh pengguna (User rejected the request).';
      } else if (err.code === 'INSUFFICIENT_FUNDS' || err.message.includes('insufficient funds')) {
        errorMsg = 'Saldo Sepolia ETH Anda tidak cukup untuk membayar Gas Fee (Insufficient funds).';
      } else if (err.message.includes('network')) {
        errorMsg = 'Jaringan tidak sesuai. Harap pastikan MetaMask terhubung ke Sepolia Testnet.';
      } else if (err.message.includes('execution reverted')) {
        errorMsg = 'Transaksi ditolak oleh Smart Contract (Execution reverted). Pastikan Anda memiliki hak akses (sebagai Owner kontrak).';
      }

      showToast('error', errorMsg);
    } finally {
      setMinting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF] font-sans selection:bg-[#7AE2CF] selection:text-[#000000] relative overflow-hidden">
      {/* Background Orbs */}
      <div className="fixed top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#7AE2CF]/20 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FDEB9E]/30 rounded-full blur-[120px] pointer-events-none z-0"></div>

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
            <h1 className="text-xl font-extrabold text-[#000000] leading-tight flex tracking-tight">Arca Golden's Generation</h1>
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

      <main className="p-4 md:p-8 relative z-10">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white/40 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.04)] border border-white/60 overflow-hidden mt-4 relative">
          
          <div className="border-b border-white/50 bg-gradient-to-r from-white/60 to-white/20 p-8">
            <h1 className="text-3xl font-extrabold text-[#000000] tracking-tight">Minting Sertifikat Emas</h1>
            <p className="text-[#000000]/70 mt-1.5 font-medium">Cetak sertifikat kepemilikan emas digital dalam bentuk NFT secara On-Chain</p>
          </div>

          <div className="p-6 md:p-8">
            <form onSubmit={handleMint} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Lengkap Pemilik</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                  placeholder="Masukkan nama lengkap"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tanggal & Waktu Transaksi</label>
                <input
                  type="text"
                  readOnly
                  value={dateStr}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 outline-none cursor-not-allowed font-medium"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Kategori Emas</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none bg-white"
                  >
                    <option value="Emas Tua">Emas Tua</option>
                    <option value="Emas Muda">Emas Muda</option>
                    <option value="White Gold">White Gold</option>
                    <option value="Rose Gold">Rose Gold</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Jenis Produk</label>
                  <select
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none bg-white"
                  >
                    <option value="Kalung">Kalung</option>
                    <option value="Cincin">Cincin</option>
                    <option value="Anting">Anting</option>
                    <option value="Gelang">Gelang</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Berat Emas (Gram)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={gram}
                  onChange={(e) => setGram(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                  placeholder="Masukkan berat dalam gram (contoh: 5.5)"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Pratinjau Token Name:</span>
                  <div className="mt-1 font-mono text-sm font-bold text-blue-900">{tokenDisplayName}</div>
                </div>
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Pratinjau Token ID:</span>
                  <div className="mt-1 font-mono text-sm font-bold text-amber-900">{tokenIdPreview}</div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Alamat Wallet Pemilik (Recipient)</label>
                  {currentWallet && (
                    <button 
                      type="button" 
                      onClick={handleUseCurrentWallet}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + Gunakan Wallet Saya
                    </button>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      required
                      value={recipient}
                      onChange={(e) => {
                        setRecipient(e.target.value);
                        setIsValidAddress(null); // Reset validation mark when typing
                      }}
                      className={`w-full pl-4 pr-10 py-2.5 rounded-xl border outline-none transition-all ${
                        isValidAddress === true 
                          ? 'border-green-400 focus:ring-2 focus:ring-green-500/20 bg-green-50/30' 
                          : isValidAddress === false
                          ? 'border-red-400 focus:ring-2 focus:ring-red-500/20 bg-red-50/30'
                          : 'border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                      }`}
                      placeholder="0x..."
                    />
                    {isValidAddress === true && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={validateAddress}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl border border-slate-200 transition-colors whitespace-nowrap"
                  >
                    Validasi Alamat
                  </button>
                </div>
                {isValidAddress === false && (
                  <p className="mt-2 text-sm font-medium text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {addressError}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100">
                {!activeContractAddress ? (
                  <div className="mb-6 p-6 bg-slate-50 border border-slate-200 rounded-2xl">
                    <h3 className="text-lg font-bold text-slate-900 mb-2">Smart Contract Belum Dideploy</h3>
                    <p className="text-slate-500 text-sm mb-4">
                      Sistem mendeteksi bahwa Smart Contract belum dikonfigurasi. Anda harus melakukan deploy terlebih dahulu sebelum mencetak NFT. Alamat dompet pada kolom <strong>Recipient</strong> di atas akan secara otomatis di-set sebagai Owner (Pemilik Utama) dari kontrak ini.
                    </p>

                    {deploySuccess && (
                      <div className="mb-4 p-4 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-sm">
                        {deploySuccess}
                      </div>
                    )}

                    {newContractAddress && (
                      <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
                          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                          <span>Contract Dideploy:</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <code className="flex-1 bg-white px-3 py-2 rounded border border-green-100 text-sm text-green-900 break-all">
                            {newContractAddress}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(newContractAddress)}
                            className="p-2 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-lg transition-colors"
                            title="Salin Alamat"
                          >
                            {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                          </button>
                        </div>
                        <p className="text-xs text-green-700 mt-3">
                          Buka halaman <strong>Pengaturan</strong> atau simpan alamat ini ke file <code>.env</code> aplikasi untuk mengaktifkan Minting dan Transfer.
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={deployContract}
                      disabled={isDeploying || isValidAddress !== true}
                      className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isDeploying ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Memproses Deploy...
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-5 h-5" />
                          Mulai Deploy Contract
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={minting || !name.trim() || !category.trim() || !productType.trim() || !gram.trim() || !recipient.trim() || isValidAddress !== true}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 px-4 rounded-xl transition-all shadow-sm shadow-blue-600/20 hover:shadow-md flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed"
                  >
                    {minting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Mencetak di Blockchain...
                      </>
                    ) : (
                      'Mint NFT'
                    )}
                  </button>
                )}
                
                <p className="text-center text-xs text-slate-500 mt-4 leading-relaxed">
                  Harap periksa kembali detail sertifikat sebelum melakukan transaksi.<br/>
                  Transaksi di blockchain tidak dapat dibatalkan.
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>

    {/* Toast Notification Container */}
    <div className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-3 max-w-sm w-[calc(100vw-3rem)] pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 30, scale: 0.9, x: -10 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
            exit={{ opacity: 0, y: 15, scale: 0.95, transition: { duration: 0.2 } }}
            layout
            className={`pointer-events-auto w-full p-4 rounded-2xl shadow-xl flex items-start gap-3 border backdrop-blur-md transition-all relative overflow-hidden ${
              toast.type === 'success'
                ? 'bg-white/95 border-[#7AE2CF] text-[#000000] shadow-[#7AE2CF]/10 shadow-lg'
                : toast.type === 'error'
                ? 'bg-white/95 border-red-200 text-[#000000] shadow-red-500/5 shadow-lg'
                : toast.type === 'loading'
                ? 'bg-white/95 border-[#FDEB9E] text-[#000000] shadow-[#FDEB9E]/10 shadow-lg'
                : 'bg-white/95 border-slate-200 text-[#000000] shadow-slate-200/20 shadow-lg'
            }`}
          >
            {/* Elegant visual ambient glow indicator */}
            {toast.type === 'success' && (
              <div className="absolute top-0 left-0 w-16 h-16 rounded-full bg-[#7AE2CF]/10 blur-xl pointer-events-none -translate-x-4 -translate-y-4"></div>
            )}
            {toast.type === 'loading' && (
              <div className="absolute top-0 left-0 w-16 h-16 rounded-full bg-[#FDEB9E]/20 blur-xl pointer-events-none -translate-x-4 -translate-y-4"></div>
            )}
            {toast.type === 'error' && (
              <div className="absolute top-0 left-0 w-16 h-16 rounded-full bg-red-400/5 blur-xl pointer-events-none -translate-x-4 -translate-y-4"></div>
            )}

            <div className="relative z-10 shrink-0">
              {toast.type === 'success' && (
                <div className="p-2 bg-[#7AE2CF]/15 rounded-xl border border-[#7AE2CF]/25 text-[#077A7D]">
                  <CheckCircle2 className="w-5 h-5 text-[#077A7D]" />
                </div>
              )}
              {toast.type === 'error' && (
                <div className="p-2 bg-red-50 rounded-xl border border-red-100 text-red-500">
                  <AlertCircle className="w-5 h-5" />
                </div>
              )}
              {toast.type === 'loading' && (
                <div className="p-2 bg-[#FDEB9E]/20 rounded-xl border border-[#FDEB9E]/40 text-[#b59218]">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}
              {toast.type === 'info' && (
                <div className="p-2 bg-blue-50 rounded-xl border border-blue-100 text-blue-500">
                  <Info className="w-5 h-5" />
                </div>
              )}
            </div>

            <div className="relative z-10 flex-1 min-w-0 pt-0.5">
              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 leading-none">
                {toast.type === 'success' && 'Berhasil'}
                {toast.type === 'error' && 'Kesalahan'}
                {toast.type === 'loading' && 'Proses Blockchain'}
                {toast.type === 'info' && 'Informasi'}
              </span>
              <p className="text-xs font-semibold leading-relaxed text-slate-800 whitespace-pre-wrap select-all">
                {toast.text}
              </p>
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="relative z-10 shrink-0 text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Dynamic matching linear shrinking timer bar */}
            {(toast.type === 'success' || toast.type === 'error') && (
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: toast.type === 'success' ? 6.5 : 8.5, ease: 'linear' }}
                className={`absolute bottom-0 left-0 h-[3px] ${
                  toast.type === 'success' ? 'bg-[#7AE2CF]' : 'bg-red-400'
                }`}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  </div>
  );
}
