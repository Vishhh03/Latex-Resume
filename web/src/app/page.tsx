import Dashboard from '@/components/Dashboard';

export default function Home() {
  return (
    <main className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
      <div className="z-10 w-full flex items-center justify-between font-mono text-sm p-4 border-b border-zinc-900 bg-zinc-950">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-lg tracking-tight">Agentic Resume Editor</span>
          <span className="px-2 py-0.5 bg-zinc-900 text-zinc-500 rounded text-xs border border-zinc-800">v2.0</span>
        </div>
        <div className="text-zinc-600 text-xs">
          Powered by Bedrock Qwen3 32B
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Dashboard />
      </div>
    </main>
  );
}
