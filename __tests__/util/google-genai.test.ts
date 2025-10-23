import * as mod from "../../src/util/google-genai";

function apiError(status: number, message = `status ${status}`) {
	return Object.assign(new Error(message), { status });
}

describe("retry", () => {
	beforeEach(() => {
		jest.spyOn(mod, "sleep").mockResolvedValue();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("returns immediately when fn resolves on first attempt", async () => {
		const fn = jest.fn().mockResolvedValue("ok");

		const result = await mod.retry({ fn, maxRetries: 3, initialDelayMs: 1 });

		expect(result).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(mod.sleep).not.toHaveBeenCalled();
	});

	it("retries on 500 and succeeds before maxRetries", async () => {
		const fn = jest
			.fn<Promise<string>, []>()
			.mockRejectedValueOnce(apiError(500))
			.mockRejectedValueOnce(apiError(500))
			.mockResolvedValue("done");

		const result = await mod.retry({ fn, maxRetries: 5, initialDelayMs: 1 });

		expect(result).toBe("done");
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("throws after exceeding maxRetries on retryable errors", async () => {
		const fn = jest.fn().mockRejectedValue(apiError(500));

		await expect(
			mod.retry({ fn, maxRetries: 2, initialDelayMs: 1 }),
		).rejects.toHaveProperty("status", 500);

		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("does not retry for non-retryable 4xx (e.g., 400)", async () => {
		const err = apiError(400);
		const fn = jest.fn().mockRejectedValue(err);

		await expect(
			mod.retry({ fn, maxRetries: 5, initialDelayMs: 1 }),
		).rejects.toBe(err);

		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("does not retry for errors without status", async () => {
		const err = new Error("boom");

		const fn = jest.fn().mockRejectedValue(err);
		await expect(
			mod.retry({ fn, maxRetries: 5, initialDelayMs: 1 }),
		).rejects.toBe(err);

		expect(fn).toHaveBeenCalledTimes(1);
	});
});
