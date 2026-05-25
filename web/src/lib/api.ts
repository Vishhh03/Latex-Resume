export interface UpdateResponse {
    status: string;
    latex?: string;
    pdfUrl?: string;
    error?: string;
    details?: string;
    logs?: string;
}

export interface Commit {
    sha: string;
    message: string;
    author: string;
    date: string;
}

export interface CommitResponse {
    status: string;
    message?: string;
    error?: string;
}

// Same-origin API calls - no proxy needed
export async function updateResume(
    instruction: string,
    job_description: string | undefined,
    baseUrl: string,
    version?: string
): Promise<UpdateResponse> {
    try {
        const response = await fetch(`${baseUrl}/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instruction,
                job_description,
                commit: false,
                version
            }),
        });

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            if (!response.ok) {
                // Include details from backend if available
                const errorMsg = data.error || `API Error: ${response.status}`;
                const details = data.details || data.logs || '';
                throw new Error(details ? `${errorMsg}\n${details}` : errorMsg);
            }
            return data;
        } else {
            const text = await response.text();
            throw new Error(text || `API Error: ${response.statusText}`);
        }
    } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error('Network error: Cannot reach the backend. Is it running?');
        }
        throw error;
    }
}

export async function commitChanges(
    message: string,
    baseUrl: string,
    version?: string
): Promise<CommitResponse> {
    try {
        const response = await fetch(`${baseUrl}/commit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, version })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Commit failed: ${response.status}`);
        }
        return data;
    } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error('Network error: Cannot reach the backend');
        }
        throw error;
    }
}

export async function getHistory(baseUrl: string): Promise<Commit[]> {
    try {
        const response = await fetch(`${baseUrl}/history`);
        if (response.ok) {
            return response.json();
        }
    } catch (e) {
        console.error("History fetch failed", e);
    }
    return [];
}
