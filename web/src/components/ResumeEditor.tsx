'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ResumeEditorProps {
    jsonText: string;
    setJsonText: (val: string) => void;
    onPreviewUpdate: (url: string) => void;
    apiUrl: string;
    version: string;
}

export default function ResumeEditor({ jsonText, setJsonText, onPreviewUpdate, apiUrl, version }: ResumeEditorProps) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'compiling'>('idle');
    const [autoCompile, setAutoCompile] = useState(true);
    const [errorLog, setErrorLog] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCompiledRef = useRef<string>('');

    // Debounced auto-compile function
    const triggerCompile = useCallback(async (content: string) => {
        if (!content || content === lastCompiledRef.current) return;

        let parsedJson;
        try {
            parsedJson = JSON.parse(content);
        } catch (err) {
            setErrorLog("JSON Syntax Error: " + (err instanceof Error ? err.message : String(err)));
            return;
        }

        setStatus('compiling');
        setErrorLog(null);
        try {
            const res = await fetch(`${apiUrl}/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resume: parsedJson })
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                onPreviewUpdate(url);
                lastCompiledRef.current = content;
            } else {
                const errData = await res.json();
                setErrorLog(errData.error || errData.logs || "Compilation failed");
            }
        } catch (e) {
            console.error(e);
            setErrorLog("Network error: " + String(e));
        } finally {
            setStatus('idle');
        }
    }, [apiUrl, onPreviewUpdate]);

    // Auto-compile on jsonText change (debounced 1.5s)
    useEffect(() => {
        if (!autoCompile || !jsonText) return;

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            triggerCompile(jsonText);
        }, 1500);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [jsonText, autoCompile, triggerCompile]);

    const handleManualCompile = () => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        triggerCompile(jsonText);
    };

    const handleFormat = () => {
        try {
            const parsed = JSON.parse(jsonText);
            setJsonText(JSON.stringify(parsed, null, 2));
            setErrorLog(null);
        } catch (err) {
            setErrorLog("Cannot format invalid JSON: " + (err instanceof Error ? err.message : String(err)));
        }
    };

    const handleSave = async () => {
        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonText);
        } catch (err) {
            setErrorLog("JSON Syntax Error: Cannot save invalid JSON");
            return;
        }

        setStatus('saving');
        try {
            const res = await fetch(`${apiUrl}/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resume: parsedJson, version })
            });

            if (res.ok) {
                alert('Changes saved to server.');
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
                    <h3 className="text-white font-bold">Manual JSON Editor</h3>
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
                        onClick={handleFormat}
                        className="px-3 py-1 bg-zinc-800 text-zinc-200 text-xs rounded hover:bg-zinc-700 transition-colors"
                    >
                        Format JSON
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={status !== 'idle'}
                        className="px-3 py-1 bg-green-700 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
                    >
                        Save Draft
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
                className="flex-1 w-full bg-zinc-900 text-emerald-400 p-4 font-mono text-xs resize-none focus:outline-none leading-relaxed"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                spellCheck={false}
            />
            {errorLog && (
                <div className="absolute bottom-0 left-0 right-0 max-h-48 overflow-y-auto bg-red-950/90 border-t border-red-800 p-3 text-red-200 text-xs font-mono shadow-xl backdrop-blur-sm">
                    <div className="flex justify-between items-start mb-2 sticky top-0 bg-red-950/90 pb-2 border-b border-red-800/50">
                        <span className="font-bold">⚠ JSON / Compilation Error</span>
                        <button onClick={() => setErrorLog(null)} className="text-red-400 hover:text-white">✕</button>
                    </div>
                    <pre className="whitespace-pre-wrap">{errorLog}</pre>
                </div>
            )}
        </div>
    );
}
