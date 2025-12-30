export interface UpdateResponse {
    status: string;
    new_sha: string;
    conversation_id: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://hm1hqg1g20.execute-api.us-east-1.amazonaws.com/prod';

export async function updateResume(instruction: string, job_description?: string): Promise<UpdateResponse> {
    if (!API_URL) {
        throw new Error('API URL not configured');
    }

    const response = await fetch(`${API_URL}/update`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ instruction, job_description }),
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
}
