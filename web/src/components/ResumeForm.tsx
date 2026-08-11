'use client';

import { useState } from 'react';
import { updateResume } from '@/lib/api';

interface ResumeFormProps {
    onSuccess: (newData: any, newPdfUrl: string) => void;
    apiUrl: string;
    version: string;
}

export default function ResumeForm({ onSuccess, apiUrl, version }: ResumeFormProps) {
    const [instruction, setInstruction] = useState('');
    const [jobDescription, setJobDescription] = useState('');
    const [agentMode, setAgentMode] = useState(true);
    const [showJD, setShowJD] = useState(false);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!instruction.trim()) return;

        setStatus('loading');
        setMessage('');

        try {
            const result = await updateResume(instruction, jobDescription, apiUrl, version, agentMode);

            if (result.error) throw new Error(result.error);

            setStatus('success');
            setMessage(agentMode ? `Success! Autonomous Agent optimization applied.` : `Success! Structured update applied.`);
            setInstruction('');
            setJobDescription('');
            setShowJD(false);

            onSuccess(result.data || result, result.pdf_base64 ? `data:application/pdf;base64,${result.pdf_base64}` : (result.pdfUrl || ''));

        } catch (error) {
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'An error occurred');
        }
    };

    return (
        <div className="w-full max-w-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Update Your Resume</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="instruction" className="sr-only">
                        Instruction for AI
                    </label>
                    <textarea
                        id="instruction"
                        rows={4}
                        className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg focus:ring-1 focus:ring-white focus:border-white text-white placeholder-zinc-500 transition-all outline-none"
                        placeholder="Describe the changes you want..."
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        disabled={status === 'loading'}
                    />
                </div>

                <div className="p-3 bg-zinc-900/90 border border-emerald-500/20 rounded-lg flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-semibold text-emerald-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={agentMode}
                            onChange={(e) => setAgentMode(e.target.checked)}
                            className="rounded accent-emerald-500 bg-zinc-950 border-zinc-700"
                        />
                        Truly Helpful Resume Agent Mode (ATS Scoring + Layout Verification)
                    </label>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">AGENTIC</span>
                </div>

                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setShowJD(!showJD)}
                        className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                    >
                        {showJD ? '- Remove Job Description' : '+ Add Job Description (Auto-Tailor)'}
                    </button>

                    <button
                        type="submit"
                        className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                        disabled={status === 'loading'}
                    >
                        {status === 'loading' ? 'Processing Agent...' : (agentMode ? 'Run Resume Agent' : 'Update Resume')}
                    </button>
                </div>


                {showJD && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                        <label htmlFor="jd" className="sr-only">Job Description</label>
                        <textarea
                            id="jd"
                            rows={6}
                            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg focus:ring-1 focus:ring-white focus:border-white text-white placeholder-zinc-500 transition-all outline-none text-sm"
                            placeholder="Paste the Job Description here. The AI will tailor your resume to match its keywords..."
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            disabled={status === 'loading'}
                        />
                    </div>
                )}

                {status === 'success' && (
                    <div className="p-3 bg-zinc-900 border border-green-900 rounded-lg text-green-400 text-sm">
                        {message}
                    </div>
                )}

                {status === 'error' && (
                    <div className="p-3 bg-zinc-900 border border-red-900 rounded-lg text-red-400 text-sm">
                        {message}
                    </div>
                )}
            </form>
        </div>
    );
}
