import type { ApiError } from "@google/genai";

export async function retry<T>({
	fn,
	maxRetries = 3,
	initialDelayMs = 1000,
}: {
	fn: () => Promise<T>;
	maxRetries: number;
	initialDelayMs: number;
}): Promise<T> {
	let lastError: any;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err: any) {
			lastError = err;
			const apiError = err as ApiError;
			if (apiError.status === 429 || apiError.status >= 500) {
				const delay = initialDelayMs * 2 ** attempt; // 1s, 2s, 4s ...
				await sleep(delay);
				continue;
			}
			throw err;
		}
	}

	throw lastError;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
