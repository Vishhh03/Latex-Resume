'use client';
import { useState } from 'react';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  const [status, setStatus] = useState<'idle' | 'booting' | 'ready'>('idle');
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const wakeUp = async () => {
    setStatus('booting');
    setMessage('Waking up Resume Backend...');

    const poll = setInterval(async () => {
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_WAKE_UP_URL!);
        const data = await res.json();

        if (data.status === 'ready' && data.url) {
          // Double check health
          try {
            const health = await fetch(`${data.url}/health`);
            if (health.ok) {
              setApiUrl(data.url);
              setStatus('ready');
              clearInterval(poll);
            }
          } catch (e) {
            setMessage(`Backend found at ${data.ip}, waiting for web server...`);
          }
        } else {
          setMessage(data.message || "Booting...");
        }
      } catch (e) {
        setMessage("Error contacting wake-up lambda...");
      }
    }, 5000); // Poll every 5s
  };

  if (status === 'ready' && apiUrl) return <Dashboard apiUrl={apiUrl} />;

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold">Backend Status: {status}</h1>
        <p className="mb-6 text-zinc-400">{message}</p>

        {status === 'idle' && (
          <button onClick={wakeUp} className="bg-white px-6 py-2 text-black rounded hover:bg-zinc-200 transition">
            Wake Up Backend
          </button>
        )}

        {status === 'booting' && (
          <div className="flex justify-center mt-4">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  );
}