'use client';

import { useState } from 'react';
import { updateResume } from '@/lib/api';

interface ResumeFormProps {
    onSuccess?: () => void;
}

export default function ResumeForm({ onSuccess }: ResumeFormProps) {
    const [instruction, setInstruction] = useState('');
    const [jobDescription, setJobDescription] = useState('');
    const [showJD, setShowJD] = useState(false);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!instruction.trim()) return;

        setStatus('loading');
        setMessage('');

        try {
            const result = await updateResume(instruction, jobDescription);
            setStatus('success');
            setMessage(`Success! Update started. Conversation ID: ${result.conversation_id}`);
            setInstruction('');
            setJobDescription('');
            setShowJD(false);
            if (onSuccess) onSuccess();
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
                        className="px-6 py-2 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        disabled={status === 'loading'}
                    >
                        {status === 'loading' ? 'Processing...' : 'Update Resume'}
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
