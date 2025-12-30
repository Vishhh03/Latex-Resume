'use client';

import { useState, useEffect } from 'react';

interface Commit {
    sha: string;
    message: string;
    date: string;
    author: string;
}

export default function HistorySlider() {
    const [commits, setCommits] = useState<Commit[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        async function fetchHistory() {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/update', '/history');
            if (!apiUrl) return;

            setLoading(true);
            try {
                const res = await fetch(apiUrl);
                if (res.ok) {
                    const data = await res.json();
                    setCommits(data);
                }
            } catch (e) {
                console.error("Failed to fetch history", e);
            } finally {
                setLoading(false);
            }
        }
        fetchHistory();
    }, []);

    if (loading) return <div className="text-zinc-500 text-sm">Loading history...</div>;
    if (commits.length === 0) return null;

    return (
        <div className="w-full max-w-2xl mt-8 p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
            <h3 className="text-lg font-bold text-white mb-4">Time Machine</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {commits.map((commit) => (
                    <div key={commit.sha} className="flex flex-col p-3 rounded bg-zinc-950 border border-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer group">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-zinc-300 font-medium text-sm line-clamp-1">{commit.message}</span>
                            <span className="text-xs text-zinc-500 whitespace-nowrap ml-2">
                                {new Date(commit.date).toLocaleDateString()}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-zinc-600 font-mono">{commit.sha.substring(0, 7)}</span>
                            <span className="text-xs text-zinc-500">{commit.author}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
