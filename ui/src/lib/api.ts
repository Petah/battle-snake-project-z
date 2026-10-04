export async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
    const body = await response.json();
    if (!response.ok) {
        throw new Error(body.error ?? `Request failed (${response.status}).`);
    }
    return body;
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
