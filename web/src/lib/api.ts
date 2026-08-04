export interface UpdateResponse {
    status: string;
    data?: any;
    pdf_base64?: string;
    pdfUrl?: string;
    error?: string;
    details?: string;
}

export interface Commit {
    sha: string;
    message: string;
    author: string;
    date: string;
}

export interface CommitResponse {
    status: string;
    pushed?: boolean;
    commit?: string;
    error?: string;
}

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
                version
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `API Error: ${response.status}`);
        }
        return data;
    } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error('Network error: Cannot reach the Lambda backend API');
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
            throw new Error('Network error: Cannot reach the backend API');
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
