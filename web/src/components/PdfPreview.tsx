'use client';

interface PdfPreviewProps {
    url: string | null;
    loading?: boolean;
}

export default function PdfPreview({ url, loading }: PdfPreviewProps) {
    return (
        <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden h-full">
            <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex justify-between items-center">
                <h3 className="text-white font-bold">Live PDF Preview</h3>
                <div className="flex items-center gap-3">
                    {url && (
                        <a
                            href={url}
                            download="resume.pdf"
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors flex items-center gap-2"
                            title="Download latest PDF"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download
                        </a>
                    )}
                    {loading && <span className="text-xs text-zinc-400 animate-pulse">refreshing...</span>}
                </div>
            </div>
            <div className="flex-1 bg-zinc-800 flex items-center justify-center relative">
                {url ? (
                    <iframe src={url} className="w-full h-full" title="PDF Preview" />
                ) : (
                    <div className="text-zinc-500 text-sm flex flex-col items-center gap-2">
                        <p>No preview available.</p>
                        <p className="text-xs">Click "Refresh Preview" to generate.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
