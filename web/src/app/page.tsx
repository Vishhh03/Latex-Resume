'use client'; // Required for state and effects

import { useState, useEffect } from 'react';
import Dashboard from '@/components/Dashboard';

// Configuration - Move to .env.local later
const WAKE_UP_LAMBDA_URL = "YOUR_LAMBDA_FUNCTION_URL"; 
const BACKEND_API_URL = "https://api.yourdomain.com";

type BackendStatus = 'offline' | 'booting' | 'online';

export default function Home() {
  const [status, setStatus] = useState<BackendStatus>('offline');
  const [loadingProgress, setLoadingProgress] = useState(0);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_API_URL}/health`, { method: 'GET' });
      if (res.ok) setStatus('online');
    } catch (e) {
      // Backend is down/idle
    }
  };

  const handleWakeUp = async () => {
    setStatus('booting');
    setLoadingProgress(10);
    
    try {
      // 1. Trigger the starter pistol
      await fetch(WAKE_UP_LAMBDA_URL, { method: 'POST' });
      setLoadingProgress(30);

      // 2. Poll every 3 seconds until DNS and SOCI lazy-loading are ready
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${BACKEND_API_URL}/health`);
          if (res.ok) {
            setStatus('online');
            clearInterval(interval);
          } else {
            setLoadingProgress((prev) => Math.min(prev + 5, 95));
          }
        } catch (err) {
          setLoadingProgress((prev) => Math.min(prev + 2, 90));
        }
      }, 3000);

    } catch (err) {
      console.error("Failed to wake backend", err);
      setStatus('offline');
    }
  };

  // Check if backend is already warm on load
  useEffect(() => {
    checkStatus();
  }, []);

  return (
    <main className="h-screen bg-zinc-950 flex flex-col overflow-hidden relative">
      {/* Header */}
      <div className="z-10 w-full flex items-center justify-between font-mono text-sm p-4 border-b border-zinc-900 bg-zinc-950">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-lg tracking-tight">Agentic Resume Editor</span>
          <span className="px-2 py-0.5 bg-zinc-900 text-zinc-500 rounded text-xs border border-zinc-800">v2.0</span>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-emerald-500' : 'bg-zinc-700 animate-pulse'}`} />
                <span className="text-zinc-500 text-xs uppercase tracking-widest">{status}</span>
            </div>
            <div className="text-zinc-600 text-xs italic">Powered by Bedrock Qwen3 32B</div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {status === 'online' ? (
          <Dashboard />
        ) : (
          <div className="absolute inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="w-full max-w-md p-8 border border-zinc-900 bg-zinc-900/50 rounded-xl text-center space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-white">
                  {status === 'offline' ? 'Backend Idle' : 'Initializing Phantom Backend'}
                </h2>
                <p className="text-zinc-500 text-sm">
                  {status === 'offline' 
                    ? 'The containerized LaTeX engine is currently sleeping to save costs.' 
                    : 'Lazy-loading Docker layers via SOCI indexing...'}
                </p>
              </div>

              {status === 'offline' ? (
                <button 
                  onClick={handleWakeUp}
                  className="w-full py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-lg transition-all active:scale-95"
                >
                  Wake Up System
                </button>
              ) : (
                <div className="w-full space-y-2">
                   <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-full transition-all duration-500 ease-out" 
                        style={{ width: `${loadingProgress}%` }}
                      />
                   </div>
                   <p className="text-[10px] font-mono text-zinc-600 animate-pulse">ESTABLISHING TUNNEL: {BACKEND_API_URL}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}