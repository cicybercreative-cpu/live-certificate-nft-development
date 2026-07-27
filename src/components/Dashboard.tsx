import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ethers } from 'ethers';
import { LogOut, Wallet, AlertCircle, Loader2, Award, Sparkles, ShieldCheck, Coins, Check, Copy } from 'lucide-react';
import { CONTRACT_ADDRESS } from '../lib/contract';
declare global {
  interface Window {
    ethereum?: any;
  }
}

const SEPOLIA_CHAIN_ID = 11155111n; // 11155111 as BigInt
const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7';

export function Dashboard() {
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('customer');
  const [userName, setUserName] = useState<string>('Pengguna');

  const [certCount, setCertCount] = useState<number | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fetchCertCount = async (address: string, role: string) => {
    try {
      if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
        setCertCount(0);
        return;
      }
      
      if (!window.ethereum) return;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, [
        "function balanceOf(address owner) view returns (uint256)",
        "function totalSupply() view returns (uint256)",
        "function ownerOf(uint256 tokenId) view returns (address)"
      ], provider);

      if (role === 'shop') {
        const supply = await contract.totalSupply();
        let count = Number(supply);
        
        let hiddenTokens: string[] = [];
        try {
          const { data } = await supabase.from('hidden_certificates').select('token_id');
          if (data) hiddenTokens = data.map(d => String(d.token_id));
        } catch(e) {}
        
        // Hanya kurangi token tersembunyi yang masih aktif di blockchain (bukan yang sudah dibakar).
        // Jika token sudah dibakar, totalSupply() sudah otomatis berkurang, jadi tidak boleh dikurangi 2 kali.
        let activeHiddenCount = 0;
        for (const tid of hiddenTokens) {
          try {
            await contract.ownerOf(tid);
            activeHiddenCount++;
          } catch (ownerErr) {
            // Token sudah tidak ada / telah dibakar di blockchain
          }
        }
        
        setCertCount(Math.max(0, count - activeHiddenCount));
      } else if (address) {
        let count = Number(await contract.balanceOf(address));
        
        // Cek jika hidden tokens dimiliki user
        let hiddenTokens: string[] = [];
        try {
          const { data } = await supabase.from('hidden_certificates').select('token_id');
          if (data) hiddenTokens = data.map(d => String(d.token_id));
        } catch(e) {}
        
        let hiddenOwned = 0;
        for (const tid of hiddenTokens) {
           try {
             const owner = await contract.ownerOf(tid);
             if (owner.toLowerCase() === address.toLowerCase()) {
               hiddenOwned++;
             }
           } catch(e) {}
        }
        
        setCertCount(Math.max(0, count - hiddenOwned));
      }
    } catch (e: any) {
      if (e.code === 'BAD_DATA' || e.code === 'CALL_EXCEPTION' || (e.message && e.message.includes('BAD_DATA'))) {
        console.warn('Smart Contract belum terdeploy atau alamat salah di jaringan ini.');
      } else if (e.code === 'UNCONFIGURED_NAME' || e.code === 'INVALID_ARGUMENT') {
        console.warn('Alamat contract tidak valid. Pastikan itu Contract Address, bukan Transaction Hash.');
      } else {
        console.error('Error fetching on-chain cert count', e);
      }
      setCertCount(0);
    }
  };

  useEffect(() => {
    // Get user role
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.user_metadata) {
        const role = session.user.user_metadata.role || 'customer';
        setUserRole(role);
        setUserName(session.user.user_metadata.nama_panggilan || session.user.user_metadata.username || 'Pengguna');
        
        if (role === 'shop') {
          fetchCertCount('', role);
        }
      }
    });

    checkIfWalletIsConnected();

    // Listen to account and network changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, []);

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      // User disconnected their wallet
      setWalletAddress('');
      setBalance('');
    } else {
      setWalletAddress(accounts[0]);
      fetchBalance(accounts[0]);
      fetchCertCount(accounts[0], userRole);
    }
  };

  const handleChainChanged = () => {
    // Reload the page whenever the chain changes, as recommended by MetaMask
    window.location.reload();
  };

  const checkIfWalletIsConnected = async () => {
    if (!window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        const network = await provider.getNetwork();
        if (network.chainId === SEPOLIA_CHAIN_ID) {
          setWalletAddress(accounts[0].address);
          fetchBalance(accounts[0].address);
          
          supabase.auth.getSession().then(({ data: { session } }) => {
            const role = session?.user?.user_metadata?.role || 'customer';
            fetchCertCount(accounts[0].address, role);
          });
        }
      }
    } catch (err) {
      console.error('Error checking wallet connection:', err);
    }
  };

  const fetchBalance = async (address: string) => {
    if (!window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const balanceWei = await provider.getBalance(address);
      const balanceEth = ethers.formatEther(balanceWei);
      // Limit to 4 decimal places for cleaner UI
      setBalance(Number(balanceEth).toFixed(4));
    } catch (err) {
      console.error('Error fetching balance:', err);
      // We don't necessarily set error state here to avoid interrupting the user too aggressively
    }
  };

  const connectWallet = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!window.ethereum) {
        throw new Error('MetaMask tidak terdeteksi. Silakan install ekstensi MetaMask di browser Anda.');
      }

      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];

      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();

      if (network.chainId !== SEPOLIA_CHAIN_ID) {
        // Try to switch to Sepolia
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
          });
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to MetaMask.
          // MetaMask will typically prompt the user to add the Sepolia network.
          if (switchError.code === 4902) {
             throw new Error('Jaringan Sepolia Testnet belum ada di MetaMask. Silakan tambahkan terlebih dahulu.');
          } else {
             throw new Error('Gagal beralih ke jaringan Sepolia. Harap pilih jaringan Sepolia di MetaMask Anda.');
          }
        }
      }

      setWalletAddress(address);
      await fetchBalance(address);
      fetchCertCount(address, userRole);

    } catch (err: any) {
      console.error(err);
      if (err.code === 4001) {
        // EIP-1193 userRejectedRequest error
        setError('Anda menolak koneksi ke MetaMask.');
      } else {
        setError(err.message || 'Terjadi kesalahan saat menghubungkan dompet kripto.');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: 'Hi, Good Morning,', emoji: '☀️' };
    if (hour < 18) return { text: 'Hi, Good Afternoon,', emoji: '🌤️' };
    return { text: 'Hi, Good Evening,', emoji: '🌙' };
  };

  const greeting = getGreeting();

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
            <h1 className="text-xl font-extrabold text-[#000000] leading-tight font-sans tracking-tight">Arca Golden's Generation</h1>
            <p className="text-[10px] font-bold text-[#7AE2CF] uppercase tracking-widest">Sertifikat NFT by Blockchain</p>
          </div>
        </div>
        <button 
          onClick={async () => await supabase.auth.signOut()}
          className="flex items-center gap-2 text-sm font-bold text-[#000000]/70 hover:text-[#000000] hover:bg-white/50 px-4 py-2 rounded-xl transition-all border border-transparent hover:border-white/50 hover:shadow-sm"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </nav>

      {/* Konten Utama */}
      <main className="max-w-4xl mx-auto p-6 mt-8 relative z-10">
        <div className="bg-white/40 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.04)] border border-white/60 overflow-hidden relative">
          <div className="p-8 border-b border-white/50 bg-gradient-to-r from-white/60 to-white/20">
            <h2 className="text-3xl font-extrabold text-[#000000] mb-2 tracking-tight">{greeting.text} {userName} {greeting.emoji}</h2>
            <p className="text-[#000000]/70 font-medium">
              Hubungkan MetaMask Anda ke jaringan Sepolia untuk memulai transaksi kepemilikan emas digital Anda.
            </p>
          </div>
          
          <div className="p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            )}

            {!walletAddress ? (
              <div className="flex flex-col items-center justify-center p-14 bg-[#FFFFFF] shadow-inner rounded-3xl border-2 border-dashed border-[#7AE2CF]">
                <Wallet className="w-14 h-14 text-[#7AE2CF] mb-5 animate-bounce" />
                <button
                  onClick={connectWallet}
                  disabled={loading}
                  className="bg-[#7AE2CF] hover:bg-[#68d0bd] text-[#000000] font-extrabold py-4 px-10 rounded-2xl transition-all shadow-[0_4px_14px_0_rgba(122,226,207,0.39)] hover:shadow-[0_6px_20px_0_rgba(122,226,207,0.39)] hover:-translate-y-1 flex items-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-[#000000]" />
                  ) : (
                    <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6" />
                  )}
                  {loading ? 'Menghubungkan...' : 'Hubungkan ke MetaMask'}
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Card 1: ID Token (Wallet Address) */}
                  <div className="bg-[#FFFFFF] rounded-3xl border border-[#FDEB9E] p-7 flex flex-col justify-between h-44 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#FDEB9E]/20 rounded-full blur-2xl group-hover:bg-[#FDEB9E]/40 transition-all duration-500"></div>
                    <div className="flex items-start justify-between relative z-10">
                      <div>
                        <div className="text-[11px] font-black tracking-widest uppercase text-[#7AE2CF] mb-1.5">Alamat Wallet Anda (ID Token)</div>
                        <div className="text-lg font-bold font-mono text-[#000000] break-all leading-tight">
                          {formatAddress(walletAddress)}
                        </div>
                      </div>
                      <button 
                        onClick={copyAddress}
                        className="p-3 rounded-xl bg-[#FDEB9E]/20 text-[#000000] hover:bg-[#FDEB9E] transition-all shrink-0 active:scale-95 cursor-pointer shadow-sm"
                        title="Salin Alamat Wallet"
                      >
                        {copied ? <Check className="w-5 h-5 text-[#000000] font-bold" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-[#FDEB9E]/30 pt-4 relative z-10">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7AE2CF] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#7AE2CF]"></span>
                        </span>
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#000000]">Online & Terhubung</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#000000] bg-[#FDEB9E] px-3 py-1 rounded-lg">Sepolia Testnet</span>
                    </div>
                  </div>

                  {/* Card 2: Coin Sepolia */}
                  <div className="bg-[#FFFFFF] rounded-3xl border border-[#FDEB9E] p-7 flex flex-col justify-between h-44 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-[#7AE2CF]/10 rounded-full blur-2xl group-hover:bg-[#7AE2CF]/20 transition-all duration-500"></div>
                    <div className="flex items-start justify-between relative z-10">
                      <div>
                        <div className="text-[11px] font-black tracking-widest uppercase text-[#7AE2CF] mb-1.5">Koin Sepolia Tersedia</div>
                        <div className="text-xl font-extrabold text-[#000000] tracking-tight flex items-baseline gap-1 mt-1">
                          {balance ? balance : '0.000'}
                          <span className="text-xs font-bold text-[#7AE2CF] tracking-normal ml-1">ETH</span>
                        </div>
                      </div>
                      <div className="p-3 bg-[#7AE2CF]/20 rounded-xl text-[#000000] shrink-0 border border-[#7AE2CF]/30">
                        <Coins className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-[#FDEB9E]/30 pt-4 relative z-10">
                      <span className="text-[11px] font-medium text-[#000000]/60 leading-none">Untuk melakukan Gas Fee transaksi</span>
                      <span className="bg-[#7AE2CF]/10 text-[#000000] text-[9px] px-3 py-1 rounded-lg font-extrabold uppercase tracking-wider">Gas Optimizer</span>
                    </div>
                  </div>
                  
                  {/* Card 3: Total Sertifikat NFT Anda */}
                  {certCount !== null && (
                    <div className="bg-[#FDEB9E] rounded-3xl p-8 md:col-span-2 relative overflow-hidden shadow-lg shadow-[#FDEB9E]/30 group text-[#000000]">
                      <div className="absolute right-0 top-0 w-64 h-64 bg-white/40 rounded-full blur-3xl opacity-50 group-hover:scale-110 transition-transform duration-700 pointer-events-none"></div>
                      <div className="absolute left-1/4 bottom-0 w-40 h-40 bg-[#7AE2CF]/30 rounded-full blur-2xl pointer-events-none"></div>
                      
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                        <div className="space-y-4">
                          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[#FFFFFF]/60 backdrop-blur-sm border border-white text-[10px] font-extrabold uppercase tracking-widest text-[#000000]">
                            <Sparkles className="w-4 h-4 text-[#7AE2CF]" />
                            <span>Aset Terverifikasi On-Chain</span>
                          </div>
                          <h4 className="text-2xl font-black tracking-tight text-[#000000]">
                            Total Sertifikat NFT Anda
                          </h4>
                          <p className="text-sm font-medium text-[#000000]/80 max-w-md leading-relaxed">
                            Sertifikat hak kepemilikan emas digital eksklusif Anda dicetak langsung secara aman & terdesentralisasi di jaringan blockchain.
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-5 bg-[#FFFFFF]/80 backdrop-blur-md rounded-3xl p-6 shrink-0 hover:bg-[#FFFFFF] transition-all duration-300 hover:-translate-y-1 shadow-lg shadow-[#077A7D]/5 border-2 border-white">
                          <div className="w-16 h-16 bg-[#7AE2CF] rounded-2xl flex items-center justify-center shadow-inner relative group-hover:rotate-12 transition-transform duration-500">
                            <Award className="w-8 h-8 text-[#000000]" />
                          </div>
                          <div>
                            <div className="text-3xl font-black text-[#000000] tracking-tight flex items-baseline gap-2">
                              {certCount}
                              <span className="text-xs font-extrabold text-[#7AE2CF] uppercase tracking-widest bg-white px-1.5 py-0.5 rounded-md">Keping</span>
                            </div>
                            <div className="text-[11px] font-black text-[#000000] tracking-widest uppercase mt-2 opacity-70">
                              NFT Aktif di Dompet
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-8 pt-6 border-t-2 border-[#077A7D]/10 flex flex-wrap items-center justify-between gap-4 text-xs relative z-10">
                        <div className="flex items-center gap-2 bg-[#FFFFFF]/50 px-4 py-2 rounded-xl backdrop-blur-sm">
                          <ShieldCheck className="w-5 h-5 text-[#7AE2CF]" />
                          <span className="text-[#000000] font-medium">Smart Contract: <span className="font-mono font-black">{CONTRACT_ADDRESS.substring(0,8)}...{CONTRACT_ADDRESS.substring(CONTRACT_ADDRESS.length-6)}</span></span>
                        </div>
                        <Link 
                          to="/user/my-certificates" 
                          className="bg-[#077A7D] text-white px-5 py-2.5 rounded-xl font-bold inline-flex items-center gap-2 hover:bg-[#066164] hover:shadow-lg transition-all duration-300 active:scale-95"
                        >
                          Lihat Detail Sertifikat &rarr;
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t-2 border-[#FDEB9E]/30">
                  <Link 
                    to="/user/my-certificates"
                    className="block group bg-[#FFFFFF] border-2 border-[#FDEB9E] p-8 rounded-3xl hover:border-[#7AE2CF] hover:shadow-[0_8px_30px_rgb(122,226,207,0.15)] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#7AE2CF]/10 rounded-bl-full -mr-4 -mt-4 transition-all duration-500 group-hover:scale-150"></div>
                    <div className="w-14 h-14 bg-[#FDEB9E]/40 text-[#000000] rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#7AE2CF] group-hover:text-white transition-colors shadow-sm relative z-10">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h3 className="text-xl font-black text-[#000000] mb-2 tracking-tight relative z-10">
                      {userRole === 'shop' ? 'Semua Sertifikat' : 'Sertifikat Saya'}
                    </h3>
                    <p className="text-sm font-medium text-[#000000]/70 leading-relaxed relative z-10">
                      {userRole === 'shop' ? 'Kelola dan lihat semua NFT Sertifikat Emas.' : 'Lihat NFT Sertifikat yang ada di wallet Anda.'}
                    </p>
                  </Link>

                  {userRole === 'shop' && (
                    <Link 
                      to="/admin/mint-nft"
                      className="block group bg-[#FFFFFF] border-2 border-[#FDEB9E] p-8 rounded-3xl hover:border-[#7AE2CF] hover:shadow-[0_8px_30px_rgb(122,226,207,0.15)] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#7AE2CF]/10 rounded-bl-full -mr-4 -mt-4 transition-all duration-500 group-hover:scale-150"></div>
                      <div className="w-14 h-14 bg-[#FDEB9E]/40 text-[#000000] rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#7AE2CF] group-hover:text-white transition-colors shadow-sm relative z-10">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      </div>
                      <h3 className="text-xl font-black text-[#000000] mb-2 tracking-tight relative z-10">Minting Sertifikat</h3>
                      <p className="text-sm font-medium text-[#000000]/70 leading-relaxed relative z-10">Input pendataan baru dan cetak Sertifikat NFT Emas.</p>
                    </Link>
                  )}
                  
                  <Link 
                    to="/user/transfer-gold"
                    className="block group bg-[#FFFFFF] border-2 border-[#FDEB9E] p-8 rounded-3xl hover:border-[#7AE2CF] hover:shadow-[0_8px_30px_rgb(122,226,207,0.15)] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#7AE2CF]/10 rounded-bl-full -mr-4 -mt-4 transition-all duration-500 group-hover:scale-150"></div>
                    <div className="w-14 h-14 bg-[#FDEB9E]/40 text-[#000000] rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#7AE2CF] group-hover:text-white transition-colors shadow-sm relative z-10">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                    </div>
                    <h3 className="text-xl font-black text-[#000000] mb-2 tracking-tight relative z-10">Balik Nama (Transfer)</h3>
                    <p className="text-sm font-medium text-[#000000]/70 leading-relaxed relative z-10">Pemindahan kepemilikan NFT Emas ke wallet lain secara aman.</p>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
