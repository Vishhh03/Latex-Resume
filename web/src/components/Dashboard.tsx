'use client';

import { useState, useCallback, useEffect } from 'react';
import ResumeForm from './ResumeForm';
import ResumeEditor from './ResumeEditor';
import PdfPreview from './PdfPreview';
import HistorySlider from './HistorySlider';
import { commitChanges } from '@/lib/api';

interface DashboardProps {
    apiUrl: string;
}

export default function Dashboard({ apiUrl }: DashboardProps) {
    const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');

    // -- State Management --
    const [latex, setLatex] = useState('');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    // Auto-fetch PDF and LaTeX on mount (same-origin API)
    useEffect(() => {
        // Fetch PDF for preview (direct same-origin call)
        const pdfUrl = `${apiUrl}/pdf`;
        fetch(pdfUrl).then(res => {
            if (res.ok) setPdfUrl(pdfUrl);
        }).catch(console.error);

        // Fetch LaTeX source for the manual editor
        fetch(`${apiUrl}/resume`).then(res => {
            if (res.ok) return res.text();
            return null;
        }).then(text => {
            if (text) setLatex(text);
        }).catch(console.error);
    }, [apiUrl]);
    const [history, setHistory] = useState<string[]>([]);
    const [future, setFuture] = useState<string[]>([]);

    const [commitMsg, setCommitMsg] = useState('');
    const [isCommitOpen, setIsCommitOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [isConnected, setIsConnected] = useState(true);

    // Health check - detect backend crashes
    useEffect(() => {
        const checkHealth = async () => {
            try {
                const res = await fetch(`${apiUrl}/health`, { method: 'GET' });
                setIsConnected(res.ok);
            } catch {
                setIsConnected(false);
            }
        };

        checkHealth(); // Initial check
        const interval = setInterval(checkHealth, 10000); // Every 10s
        return () => clearInterval(interval);
    }, [apiUrl]);

    // -- Undo/Redo Logic --
    const pushState = useCallback((newLatex: string) => {
        setHistory(prev => [...prev, latex]);
        setFuture([]);
        setLatex(newLatex);
    }, [latex]);

    const handleUndo = () => {
        if (history.length === 0) return;
        const previous = history[history.length - 1];
        setFuture(prev => [latex, ...prev]);
        setHistory(prev => prev.slice(0, -1));
        setLatex(previous);
    };

    const handleRedo = () => {
        if (future.length === 0) return;
        const next = future[0];
        setHistory(prev => [...prev, latex]);
        setFuture(prev => prev.slice(1));
        setLatex(next);
    };

    // -- Handlers --

    const handleAiSuccess = (newLatex: string, newPdfUrl: string) => {
        pushState(newLatex);
        if (newPdfUrl) setPdfUrl(newPdfUrl);
    };

    const handleManualChange = (val: string) => {
        // Debounced history push could go here, 
        // but for now we rely on explicit checkpoints or AI updates for "Undo" points
        // to avoid an undo step for every keystroke.
        setLatex(val);
    };

    const handleCommit = async () => {
        if (!commitMsg.trim()) return;
        setIsCommitting(true);
        try {
            await commitChanges(commitMsg, apiUrl);
            alert("Changes committed to GitHub!");
            setCommitMsg('');
            setIsCommitOpen(false);
        } catch (e) {
            alert("Commit failed: " + e);
        } finally {
            setIsCommitting(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-100px)] w-full max-w-7xl mx-auto gap-4 p-4 relative">

            {/* Disconnected Overlay */}
            {!isConnected && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                    <div className="text-center p-8">
                        <div className="text-6xl mb-4">⚡</div>
                        <h2 className="text-2xl font-bold text-white mb-2">Backend Disconnected</h2>
                        <p className="text-zinc-400 mb-6">The container has stopped or crashed.</p>
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors"
                            >
                                Retry Connection
                            </button>
                            <a
                                href="https://github.com/Vishhh03/Latex-Resume"
                                target="_blank"
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
                            >
                                View on GitHub
                            </a>
                        </div>
                        <p className="text-zinc-500 text-sm mt-6">Run <code className="bg-zinc-800 px-2 py-1 rounded">npx vishhh03</code> to restart</p>
                    </div>
                </div>
            )}

            {/* LEFT PANE: Input (Tabs) */}
            <div className="w-1/2 flex flex-col gap-4">

                {/* Top Bar: Tabs + Undo/Redo/Commit/Stop */}
                <div className="flex justify-between items-center bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                    <div className="flex gap-1">
                        <button
                            onClick={() => setActiveTab('ai')}
                            className={`px-3 py-1 text-sm rounded transition-all ${activeTab === 'ai' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}
                        >
                            AI
                        </button>
                        <button
                            onClick={() => setActiveTab('manual')}
                            className={`px-3 py-1 text-sm rounded transition-all ${activeTab === 'manual' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}
                        >
                            Manual
                        </button>
                    </div>

                    <div className="flex gap-2 items-center">
                        <button onClick={handleUndo} disabled={history.length === 0} className="text-zinc-400 hover:text-white disabled:opacity-30" title="Undo">
                            ↩
                        </button>
                        <button onClick={handleRedo} disabled={future.length === 0} className="text-zinc-400 hover:text-white disabled:opacity-30" title="Redo">
                            ↪
                        </button>
                        <div className="w-px h-4 bg-zinc-800 mx-1"></div>
                        <button
                            onClick={() => setIsCommitOpen(true)}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 transition-colors"
                        >
                            Commit to Git
                        </button>
                        <button
                            onClick={() => {
                                if (confirm('Stop the ECS container? This will shut down the backend.')) {
                                    fetch('/stop', { method: 'POST' })
                                        .then(r => r.json())
                                        .then(data => alert(data.message || 'Container stopping...'))
                                        .catch(() => alert('Stop request sent'));
                                }
                            }}
                            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-500 transition-colors"
                            title="Stop ECS Container"
                        >
                            Stop
                        </button>
                    </div>
                </div>

                {/* Commit Modal Overlay */}
                {isCommitOpen && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-zinc-700 p-4 rounded-xl shadow-2xl w-96 animate-in fade-in zoom-in duration-200">
                        <h3 className="text-white font-bold mb-2">Commit Changes</h3>
                        <input
                            className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white text-sm mb-4 focus:outline-none focus:border-blue-500"
                            placeholder="Describe your changes..."
                            value={commitMsg}
                            onChange={e => setCommitMsg(e.target.value)}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsCommitOpen(false)} className="text-zinc-400 hover:text-white text-sm">Cancel</button>
                            <button onClick={handleCommit} disabled={isCommitting} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-500">
                                {isCommitting ? 'Pushing...' : 'Push'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Tab Content */}
                <div className="flex-1 bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6 overflow-y-auto custom-scrollbar relative">
                    {activeTab === 'ai' ? (
                        <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                            <div className="mb-6">
                                <h2 className="text-2xl font-bold text-white mb-2">AI Architect</h2>
                                <p className="text-zinc-400 text-sm">
                                    Describe changes or paste a Job Description. The AI will rewrite your LaTeX resume.
                                </p>
                            </div>
                            <ResumeForm onSuccess={handleAiSuccess} apiUrl={apiUrl} />
                        </div>
                    ) : (
                        <div className="h-full animate-in fade-in slide-in-from-right-4 duration-300">
                            <ResumeEditor
                                latex={latex}
                                setLatex={handleManualChange}
                                onPreviewUpdate={setPdfUrl}
                                apiUrl={apiUrl}
                            />
                        </div>
                    )}
                </div>

                {/* History Toggler */}
                <button
                    onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                    className="flex items-center justify-between w-full p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-700 transition-all"
                >
                    <span className="font-mono text-sm">Review Changes & History</span>
                    <span>{isHistoryOpen ? '↓' : '↑'}</span>
                </button>

                {isHistoryOpen && (
                    <div className="absolute bottom-20 left-4 w-[calc(50%-2rem)] max-w-[600px] z-50 shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-200">
                        <HistorySlider apiUrl={apiUrl} />
                    </div>
                )}
            </div>

            {/* RIGHT PANE: Preview */}
            <div className="w-1/2 h-full">
                <PdfPreview url={pdfUrl} />
            </div>
        </div>
    );
}
