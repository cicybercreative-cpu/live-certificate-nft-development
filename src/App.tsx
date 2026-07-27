/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { MintingPage } from './components/MintingPage';
import { TransferPage } from './components/TransferPage';
import { MyCertificatesPage } from './components/MyCertificatesPage';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Session error:", error.message);
        // If the refresh token is invalid or not found, sign out to clear stale session
        supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(session);
      }
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to get session:", err);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed successfully');
      }
      
      if (_event === 'SIGNED_OUT') {
        setSession(null);
      } else {
        setSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={
            session ? <Navigate to="/dashboard" replace /> : (
              <div className="min-h-screen w-full bg-[#FFFFFF] relative overflow-hidden flex items-center justify-center p-4 md:p-6">
                {/* Background Orbs */}
                <div className="fixed top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#7AE2CF]/15 rounded-full blur-[120px] pointer-events-none z-0"></div>
                <div className="fixed bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#FDEB9E]/25 rounded-full blur-[120px] pointer-events-none z-0"></div>
                <div className="relative z-10 w-full flex justify-center items-center">
                  <Auth />
                </div>
              </div>
            )
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            session ? <Dashboard /> : <Navigate to="/" replace />
          } 
        />
        <Route 
          path="/admin/mint-nft" 
          element={
            session ? <MintingPage /> : <Navigate to="/" replace />
          } 
        />
        <Route 
          path="/user/transfer-gold" 
          element={
            session ? <TransferPage /> : <Navigate to="/" replace />
          } 
        />
        <Route 
          path="/user/my-certificates" 
          element={
            session ? <MyCertificatesPage /> : <Navigate to="/" replace />
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}


