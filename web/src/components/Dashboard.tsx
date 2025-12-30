'use client';

import { useState } from 'react';
import ResumeForm from './ResumeForm';
import ResumeEditor from './ResumeEditor';
import PdfPreview from './PdfPreview';
import HistorySlider from './HistorySlider';

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [editorKey, setEditorKey] = useState(0); // Used to force-reload editor
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const handleAiSuccess = () => {
        // AI started an update.
        // In a real polling scenario, we'd wait. 
        // For now, let's increment the editor key so if the user switches to Manual, 
        // it fetches the latest (hopefully updated by then, or they can refresh).
        setEditorKey(prev => prev + 1);

        // Also clear preview? Or keep old one? Keep old one.
    };

    const handlePreviewUpdate = (url: string) => {
        setPdfUrl(url);
    };

    return (
        <div className="flex h-[calc(100vh-100px)] w-full max-w-7xl mx-auto gap-4 p-4">

            {/* LEFT PANE: Input (Tabs) */}
            <div className="w-1/2 flex flex-col gap-4">
                {/* Tab Navigation */}
                <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800 w-fit">
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`px-4 py-2 text-sm rounded-md transition-all ${activeTab === 'ai'
                                ? 'bg-zinc-800 text-white shadow'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                    >
                        AI Assistant
                    </button>
                    <button
                        onClick={() => setActiveTab('manual')}
                        className={`px-4 py-2 text-sm rounded-md transition-all ${activeTab === 'manual'
                                ? 'bg-zinc-800 text-white shadow'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                    >
                        Manual Editor
                    </button>
                </div>

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
                            <ResumeForm onSuccess={handleAiSuccess} />
                        </div>
                    ) : (
                        <div className="h-full animate-in fade-in slide-in-from-right-4 duration-300">
                            <ResumeEditor
                                key={editorKey}
                                onPreviewUpdate={handlePreviewUpdate}
                            />
                        </div>
                    )}
                </div>

                {/* History Toggler (Bottom of Left Pane) */}
                <button
                    onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                    className="flex items-center justify-between w-full p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-700 transition-all"
                >
                    <span className="font-mono text-sm">Review Changes & History</span>
                    <span>{isHistoryOpen ? '↓' : '↑'}</span>
                </button>

                {isHistoryOpen && (
                    <div className="absolute bottom-20 left-4 w-[calc(50%-2rem)] max-w-[600px] z-50 shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-200">
                        <HistorySlider />
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
