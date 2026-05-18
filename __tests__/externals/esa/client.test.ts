import { EsaClient } from "../../../src/externals/esa/client";

const { mockAxiosCreate, mockGet, mockPost } = vi.hoisted(() => ({
	mockAxiosCreate: vi.fn(),
	mockGet: vi.fn(),
	mockPost: vi.fn(),
}));

vi.mock("axios", () => ({
	default: {
		create: mockAxiosCreate,
	},
	create: mockAxiosCreate,
}));

describe("EsaClient", () => {
	beforeEach(() => {
		mockAxiosCreate.mockReset();
		mockGet.mockReset();
		mockPost.mockReset();
		mockAxiosCreate.mockReturnValue({
			get: mockGet,
			post: mockPost,
		});
	});

	describe("getPosts", () => {
		it("calls the esa search posts endpoint with page params", async () => {
			const response = {
				posts: [],
				prev_page: 1,
				next_page: 3,
				total_count: 31,
				page: 2,
				per_page: 10,
				max_per_page: 30,
			};
			mockGet.mockResolvedValue({ data: response });

			const client = new EsaClient({
				apiKey: "token",
				team: "docs",
				baseUrl: "https://api.example.test",
			});

			await expect(
				client.getPosts({
					q: "GitHub Actions",
					per_page: 10,
					page: 2,
					sort: "updated-desc",
				}),
			).resolves.toEqual(response);

			expect(mockGet).toHaveBeenCalledWith("/v1/teams/docs/posts", {
				params: {
					max_per_page: 30,
					q: "GitHub Actions",
					per_page: 10,
					page: 2,
					sort: "updated-desc",
				},
			});
		});
	});

	describe("getPost", () => {
		it("calls the esa get post endpoint", async () => {
			const post = {
				number: 123,
				name: "title",
				full_name: "Category/title",
				body_md: "body",
				category: "Category",
				created_at: "2026-04-01T10:00:00+09:00",
				updated_at: "2026-04-02T10:00:00+09:00",
				url: "https://docs.esa.io/posts/123",
				tags: [],
			};
			mockGet.mockResolvedValue({ data: post });

			const client = new EsaClient({
				apiKey: "token",
				team: "docs",
				baseUrl: "https://api.example.test",
			});

			await expect(
				client.getPost({ postNumber: 123, include: "comments" }),
			).resolves.toEqual(post);

			expect(mockAxiosCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					baseURL: "https://api.example.test",
					headers: expect.objectContaining({
						Authorization: "Bearer token",
					}),
				}),
			);
			expect(mockGet).toHaveBeenCalledWith("/v1/teams/docs/posts/123", {
				params: { include: "comments" },
			});
		});

		it("rethrows esa API errors", async () => {
			const consoleError = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined);
			const error = Object.assign(new Error("request failed"), {
				response: { data: { error: "not_found" } },
			});
			mockGet.mockRejectedValue(error);

			const client = new EsaClient({
				apiKey: "token",
				team: "docs",
			});

			await expect(client.getPost({ postNumber: 404 })).rejects.toBe(error);
			expect(mockGet).toHaveBeenCalledWith("/v1/teams/docs/posts/404", {
				params: undefined,
			});
			expect(consoleError).toHaveBeenCalled();

			consoleError.mockRestore();
		});
	});
});
