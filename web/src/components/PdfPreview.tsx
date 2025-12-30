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
                {loading && <span className="text-xs text-zinc-400 animate-pulse">refreshing...</span>}
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
