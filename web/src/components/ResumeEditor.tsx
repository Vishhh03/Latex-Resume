'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ResumeEditorProps {
    latex: string;
    setLatex: (val: string) => void;
    onPreviewUpdate: (url: string) => void;
    apiUrl: string;
}

export default function ResumeEditor({ latex, setLatex, onPreviewUpdate, apiUrl }: ResumeEditorProps) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'compiling'>('idle');
    const [autoCompile, setAutoCompile] = useState(true);
    const [errorLog, setErrorLog] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCompiledRef = useRef<string>('');

    // Debounced auto-compile function
    const triggerCompile = useCallback(async (content: string) => {
        if (content === lastCompiledRef.current) return; // Skip if unchanged

        setStatus('compiling');
        setErrorLog(null); // Clear previous errors
        try {
            const res = await fetch(`${apiUrl}/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latex: content })
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                onPreviewUpdate(url);
                lastCompiledRef.current = content;
            } else {
                const errData = await res.json();
                if (errData.logs) {
                    setErrorLog(errData.logs);
                } else {
                    setErrorLog(errData.error || "Compilation failed");
                }
            }
        } catch (e) {
            console.error(e);
            setErrorLog("Network error: " + String(e));
        } finally {
            setStatus('idle');
        }
    }, [apiUrl, onPreviewUpdate]);

    // Auto-compile on latex change (debounced 1.5s)
    useEffect(() => {
        if (!autoCompile || !latex) return;

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            triggerCompile(latex);
        }, 1500); // 1.5s debounce - Overleaf-like speed

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [latex, autoCompile, triggerCompile]);

    const handleManualCompile = () => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        triggerCompile(latex);
    };

    const handleSave = async () => {
        setStatus('saving');
        try {
            const res = await fetch(`${apiUrl}/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latex })
            });

            if (res.ok) {
                alert('Changes saved to server (not committed).');
            } else {
                alert('Failed to save changes.');
            }
        } catch (e) {
            console.error(e);
            alert('Error saving changes.');
        } finally {
            setStatus('idle');
        }
    };

    return (
        <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden h-full relative">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
                <div className="flex items-center gap-3">
                    <h3 className="text-white font-bold">Manual Editor</h3>
                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoCompile}
                            onChange={(e) => setAutoCompile(e.target.checked)}
                            className="rounded"
                        />
                        Auto-compile
                    </label>
                    {status === 'compiling' && (
                        <span className="text-xs text-yellow-400 animate-pulse">Compiling...</span>
                    )}
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleSave}
                        disabled={status !== 'idle'}
                        className="px-3 py-1 bg-green-700 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
                    >
                        Save (Disk)
                    </button>
                    {!autoCompile && (
                        <button
                            onClick={handleManualCompile}
                            disabled={status !== 'idle'}
                            className="px-3 py-1 bg-zinc-800 text-white text-xs rounded hover:bg-zinc-700 disabled:opacity-50"
                        >
                            Compile
                        </button>
                    )}
                </div>
            </div>
            <textarea
                className="flex-1 w-full bg-zinc-900 text-zinc-300 p-4 font-mono text-sm resize-none focus:outline-none"
                value={latex}
                onChange={(e) => setLatex(e.target.value)}
                spellCheck={false}
            />
            {errorLog && (
                <div className="absolute bottom-0 left-0 right-0 max-h-48 overflow-y-auto bg-red-950/90 border-t border-red-800 p-3 text-red-200 text-xs font-mono shadow-xl backdrop-blur-sm">
                    <div className="flex justify-between items-start mb-2 sticky top-0 bg-red-950/90 pb-2 border-b border-red-800/50">
                        <span className="font-bold">⚠ Compilation Error</span>
                        <button onClick={() => setErrorLog(null)} className="text-red-400 hover:text-white">✕</button>
                    </div>
                    <pre className="whitespace-pre-wrap">{errorLog}</pre>
                </div>
            )}
        </div>
    );
}
