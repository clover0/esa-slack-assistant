import {
	createEsaSearchAgent,
	type EsaSearchAgentConfig,
} from "../../src/agents/esa-search";
import type { Post } from "../../src/dto/post";
import type { EsaClient } from "../../src/externals/esa/client";
import { GeminiAnswerService } from "../../src/services/gemini-answer-service";

const {
	mockCreateUserContent,
	mockGemini,
	mockInMemoryRunner,
	mockIsFinalResponse,
	mockLlmAgent,
	mockRunEphemeral,
	mockStringifyContent,
	toolOptions,
} = vi.hoisted(() => {
	const toolOptions: any[] = [];
	const mockRunEphemeral = vi.fn();
	return {
		mockCreateUserContent: vi.fn((text: string) => ({
			role: "user",
			parts: [{ text }],
		})),
		mockGemini: vi.fn().mockImplementation((config) => ({ config })),
		mockInMemoryRunner: vi.fn().mockImplementation((config) => ({
			appName: config.appName,
			runEphemeral: mockRunEphemeral,
		})),
		mockIsFinalResponse: vi.fn(),
		mockLlmAgent: vi.fn().mockImplementation((config) => ({ config })),
		mockRunEphemeral,
		mockStringifyContent: vi.fn(),
		toolOptions,
	};
});

vi.mock("@google/adk", () => ({
	FunctionTool: vi.fn().mockImplementation((options) => {
		toolOptions.push(options);
		return { name: options.name, options };
	}),
	Gemini: mockGemini,
	InMemoryRunner: mockInMemoryRunner,
	LlmAgent: mockLlmAgent,
	isFinalResponse: mockIsFinalResponse,
	stringifyContent: mockStringifyContent,
}));

vi.mock("@google/genai", () => ({
	createUserContent: mockCreateUserContent,
}));

async function* events(items: unknown[]) {
	for (const item of items) {
		yield item;
	}
}

function makePost(overrides?: Partial<Post>): Post {
	return {
		number: 123,
		name: "Deploy Guide",
		full_name: "Dev/Deploy Guide #release",
		body_md: "body markdown",
		category: "Dev",
		created_at: "2026-04-01T10:00:00+09:00",
		updated_at: "2026-04-02T10:00:00+09:00",
		url: "https://docs.esa.io/posts/123",
		tags: ["release"],
		...overrides,
	};
}

describe("GeminiAnswerService", () => {
	beforeEach(() => {
		toolOptions.length = 0;
		mockCreateUserContent.mockClear();
		mockGemini.mockClear();
		mockInMemoryRunner.mockClear();
		mockIsFinalResponse.mockReset();
		mockLlmAgent.mockClear();
		mockRunEphemeral.mockReset();
		mockStringifyContent.mockReset();
	});

	function buildService(
		esaClient: Pick<EsaClient, "getPosts" | "getPost">,
		overrides: Partial<EsaSearchAgentConfig> & {
			appName?: string;
		} = {},
	) {
		const { appName, ...agentOverrides } = overrides;

		return new GeminiAnswerService({
			appName,
			agentFactory: () => buildAgent(esaClient, agentOverrides),
		});
	}

	function buildAgent(
		esaClient: Pick<EsaClient, "getPosts" | "getPost">,
		overrides: Partial<EsaSearchAgentConfig> = {},
	) {
		return createEsaSearchAgent({
			esaClient: esaClient as EsaClient,
			project: "test-project",
			location: "asia-northeast1",
			model: "gemini-3-flash-preview",
			maxSearchResultBodyChars: 8,
			...overrides,
		});
	}

	it("runs the ADK agent and yields the final answer chunk", async () => {
		const esaClient = {
			getPosts: vi.fn(),
			getPost: vi.fn(),
		};
		const service = buildService(esaClient);

		const finalEvent = {
			final: true,
			usageMetadata: { totalTokenCount: 123 },
		};
		mockRunEphemeral.mockReturnValue(events([{ final: false }, finalEvent]));
		mockIsFinalResponse.mockImplementation((event) => event.final === true);
		mockStringifyContent.mockReturnValue("回答本文");

		const chunks = [];
		const stream = await service.answerQuestion({
			question: "デプロイ手順は？",
			history: [{ role: "user", text: "GitHub Actions の話です" }],
			now: new Date("2026-04-11T10:00:00+09:00"),
		});
		for await (const chunk of stream) {
			chunks.push(chunk);
		}

		expect(chunks).toEqual([
			{ textDelta: "回答本文" },
			{ totalTokenCount: 123 },
		]);
		expect(mockGemini).toHaveBeenCalledWith(
			expect.objectContaining({
				vertexai: true,
				project: "test-project",
				location: "asia-northeast1",
				model: "gemini-3-flash-preview",
			}),
		);
		expect(mockRunEphemeral).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "slack-user",
				runConfig: { maxLlmCalls: 50 },
			}),
		);
		expect(mockInMemoryRunner).toHaveBeenCalledWith(
			expect.objectContaining({
				appName: "esa-search",
			}),
		);
		expect(mockCreateUserContent.mock.calls[0][0]).toContain("# Slack会話文脈");
		expect(mockCreateUserContent.mock.calls[0][0]).toContain(
			"GitHub Actions の話です",
		);
		expect(mockLlmAgent).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "esa_search_agent",
				instruction: expect.stringContaining("wip フィールド"),
			}),
		);
		expect(mockLlmAgent).toHaveBeenCalledWith(
			expect.objectContaining({
				instruction: expect.stringContaining("並列"),
			}),
		);
	});

	it("uses the fixed maxLlmCalls", async () => {
		const esaClient = {
			getPosts: vi.fn(),
			getPost: vi.fn(),
		};
		const service = buildService(esaClient);

		mockRunEphemeral.mockReturnValue(events([]));

		await service.answerQuestion({
			question: "質問",
			now: new Date("2026-04-11T10:00:00+09:00"),
		});

		expect(mockRunEphemeral).toHaveBeenCalledWith(
			expect.objectContaining({
				runConfig: { maxLlmCalls: 50 },
			}),
		);
	});

	it("creates a fresh agent for each answer", async () => {
		const esaClient = {
			getPosts: vi.fn(),
			getPost: vi.fn(),
		};
		const categoryPromptEntries = [
			[{ path: "Product/API", posts: 1 }],
			[{ path: "Sales/CRM", posts: 2 }],
		];
		const agentFactory = vi.fn(() =>
			buildAgent(esaClient, {
				categoryPromptEntries: categoryPromptEntries.shift() ?? [],
			}),
		);
		const service = new GeminiAnswerService({ agentFactory });

		mockRunEphemeral.mockReturnValue(events([]));

		await service.answerQuestion({
			question: "質問1",
			now: new Date("2026-04-11T10:00:00+09:00"),
		});
		await service.answerQuestion({
			question: "質問2",
			now: new Date("2026-04-11T10:00:00+09:00"),
		});

		expect(agentFactory).toHaveBeenCalledTimes(2);
		expect(mockInMemoryRunner).toHaveBeenCalledTimes(2);
		expect(mockLlmAgent.mock.calls[0][0].instruction).toContain(
			"- Product/API (1 posts)",
		);
		expect(mockLlmAgent.mock.calls[1][0].instruction).toContain(
			"- Sales/CRM (2 posts)",
		);
	});

	it("includes compressed esa categories in the agent instruction", async () => {
		const esaClient = {
			getPosts: vi.fn(),
			getPost: vi.fn(),
		};

		const service = buildService(esaClient, {
			categoryPromptEntries: [
				{ path: "Archive/Old", posts: 999 },
				{ path: "Product/API", posts: 120 },
				{ path: "Sales/CRM", posts: 30 },
				{ path: "Product/App", posts: 80 },
			],
		});
		mockRunEphemeral.mockReturnValue(events([]));

		await service.answerQuestion({
			question: "質問",
			now: new Date("2026-04-11T10:00:00+09:00"),
		});

		const instruction = mockLlmAgent.mock.calls[0][0].instruction;
		expect(instruction).toContain("# esa カテゴリ概要");
		expect(instruction).toContain("- Product/API (120 posts)");
		expect(instruction).toContain("- Product/App (80 posts)");
		expect(instruction).toContain("- Sales/CRM (30 posts)");
		expect(instruction).not.toContain("Archive/Old");
	});

	it("searches esa posts with default filters and explicit result count", async () => {
		const esaClient = {
			getPosts: vi.fn().mockResolvedValue({
				page: 2,
				per_page: 10,
				prev_page: 1,
				next_page: 3,
				total_count: 1,
				posts: [makePost({ body_md: "1234567890" })],
			}),
			getPost: vi.fn(),
		};
		buildAgent(esaClient);

		const searchTool = toolOptions.find(
			(tool) => tool.name === "search_esa_posts",
		);
		const result = await searchTool.execute(
			searchTool.parameters.parse({
				exactKeywords: ["GitHub", "Actions"],
				perPage: 10,
				page: 2,
			}),
		);

		expect(esaClient.getPosts).toHaveBeenCalledWith({
			q: '"GitHub" "Actions" wip:false -Archive',
			per_page: 10,
			page: 2,
		});
		expect(result).toMatchObject({
			status: "success",
			page: 2,
			perPage: 10,
			prevPage: 1,
			nextPage: 3,
			returnedCount: 1,
			posts: [
				expect.objectContaining({
					number: 123,
					bodySnippet: "12345678",
					bodySnippetTruncated: true,
				}),
			],
		});
	});

	it("uses 5 results as the default search page size", async () => {
		const esaClient = {
			getPosts: vi.fn().mockResolvedValue({
				page: 1,
				per_page: 5,
				prev_page: null,
				next_page: null,
				total_count: 0,
				posts: [],
			}),
			getPost: vi.fn(),
		};
		buildAgent(esaClient);

		const searchTool = toolOptions.find(
			(tool) => tool.name === "search_esa_posts",
		);
		await searchTool.execute(
			searchTool.parameters.parse({
				exactKeywords: ["GitHub"],
			}),
		);

		expect(esaClient.getPosts).toHaveBeenCalledWith({
			q: '"GitHub" wip:false -Archive',
			per_page: 5,
		});
	});

	it("passes sort to the esa search posts endpoint", async () => {
		const esaClient = {
			getPosts: vi.fn().mockResolvedValue({
				page: 1,
				per_page: 5,
				prev_page: null,
				next_page: null,
				total_count: 0,
				posts: [],
			}),
			getPost: vi.fn(),
		};
		buildAgent(esaClient);

		const searchTool = toolOptions.find(
			(tool) => tool.name === "search_esa_posts",
		);
		const result = await searchTool.execute(
			searchTool.parameters.parse({
				exactKeywords: ["GitHub"],
				sort: "updated-desc",
			}),
		);

		expect(esaClient.getPosts).toHaveBeenCalledWith({
			q: '"GitHub" wip:false -Archive',
			per_page: 5,
			sort: "updated-desc",
		});
		expect(result).toMatchObject({
			status: "success",
			sort: "updated-desc",
		});
	});

	it("does not add the default wip filter when wip is explicitly specified", async () => {
		const esaClient = {
			getPosts: vi.fn().mockResolvedValue({
				page: 1,
				per_page: 5,
				prev_page: null,
				next_page: null,
				total_count: 0,
				posts: [],
			}),
			getPost: vi.fn(),
		};
		buildAgent(esaClient);

		const searchTool = toolOptions.find(
			(tool) => tool.name === "search_esa_posts",
		);
		await searchTool.execute(
			searchTool.parameters.parse({
				exactKeywords: ["GitHub", "Actions"],
				wip: true,
			}),
		);

		expect(esaClient.getPosts).toHaveBeenCalledWith({
			q: '"GitHub" "Actions" wip:true -Archive',
			per_page: 5,
		});
	});

	it("searches body text with the default shipped filter", async () => {
		const esaClient = {
			getPosts: vi.fn().mockResolvedValue({
				page: 1,
				per_page: 5,
				prev_page: null,
				next_page: null,
				total_count: 0,
				posts: [],
			}),
			getPost: vi.fn(),
		};
		buildAgent(esaClient);

		const searchTool = toolOptions.find(
			(tool) => tool.name === "search_esa_posts",
		);
		await searchTool.execute(
			searchTool.parameters.parse({
				body: "佐藤",
			}),
		);

		expect(esaClient.getPosts).toHaveBeenCalledWith({
			q: "body:佐藤 wip:false -Archive",
			per_page: 5,
		});
	});

	it("builds esa search queries from structured fields", async () => {
		const esaClient = {
			getPosts: vi.fn().mockResolvedValue({
				page: 1,
				per_page: 5,
				prev_page: null,
				next_page: null,
				total_count: 0,
				posts: [],
			}),
			getPost: vi.fn(),
		};
		buildAgent(esaClient);

		const searchTool = toolOptions.find(
			(tool) => tool.name === "search_esa_posts",
		);
		await searchTool.execute(
			searchTool.parameters.parse({
				title: "Deploy Guide",
				number: 123,
				wip: false,
				body: "release note",
				tags: ["Release"],
				stars: { operator: ">", value: 3 },
				updated: { operator: ">", value: "2026-04" },
				orKeywords: ["GitHub Actions", "Cloud Build"],
				excludeKeywords: ["draft"],
			}),
		);

		expect(esaClient.getPosts).toHaveBeenCalledWith({
			q: 'title:"Deploy Guide" number:123 wip:false body:"release note" tag:Release stars:>3 updated:>2026-04 ("GitHub Actions" OR "Cloud Build") -draft -Archive',
			per_page: 5,
		});
	});

	it("gets an esa post by number without truncating the body", async () => {
		const esaClient = {
			getPosts: vi.fn(),
			getPost: vi.fn().mockResolvedValue(makePost({ body_md: "abcdefghi" })),
		};
		buildAgent(esaClient);

		const getPostTool = toolOptions.find(
			(tool) => tool.name === "get_esa_post",
		);
		const result = await getPostTool.execute(
			getPostTool.parameters.parse({
				postNumber: 123,
				includeComments: true,
			}),
		);

		expect(esaClient.getPost).toHaveBeenCalledWith({
			postNumber: 123,
			include: "comments",
		});
		expect(result).toMatchObject({
			status: "success",
			post: {
				number: 123,
				bodyMd: "abcdefghi",
			},
		});
	});

	it("logs tool calls and successful results", async () => {
		const logger = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
		};
		const esaClient = {
			getPosts: vi.fn().mockResolvedValue({
				page: 1,
				per_page: 10,
				prev_page: null,
				next_page: null,
				total_count: 1,
				posts: [makePost()],
			}),
			getPost: vi.fn().mockResolvedValue(makePost({ body_md: "abcdefghi" })),
		};
		buildAgent(esaClient, { logger });

		const searchTool = toolOptions.find(
			(tool) => tool.name === "search_esa_posts",
		);
		const getPostTool = toolOptions.find(
			(tool) => tool.name === "get_esa_post",
		);

		await searchTool.execute(
			searchTool.parameters.parse({
				exactKeywords: ["GitHub", "Actions"],
				perPage: 10,
			}),
		);
		await getPostTool.execute(
			getPostTool.parameters.parse({
				postNumber: 123,
			}),
		);

		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "agent tool call",
				toolName: "search_esa_posts",
				searchCriteria: { exactKeywords: ["GitHub", "Actions"] },
				esaQuery: '"GitHub" "Actions" wip:false -Archive',
				perPage: 10,
			}),
		);
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "agent tool success",
				toolName: "search_esa_posts",
				returnedCount: 1,
				totalCount: 1,
				durationMs: expect.any(Number),
			}),
		);
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "agent tool call",
				toolName: "get_esa_post",
				postNumber: 123,
				includeComments: false,
			}),
		);
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "agent tool success",
				toolName: "get_esa_post",
				postNumber: 123,
				durationMs: expect.any(Number),
			}),
		);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("validates required tool parameters with zod", async () => {
		const esaClient = {
			getPosts: vi.fn(),
			getPost: vi.fn(),
		};
		buildAgent(esaClient);

		const getPostTool = toolOptions.find(
			(tool) => tool.name === "get_esa_post",
		);
		const searchTool = toolOptions.find(
			(tool) => tool.name === "search_esa_posts",
		);

		expect(getPostTool.parameters.safeParse({}).success).toBe(false);
		expect(getPostTool.parameters.safeParse({ postNumber: 0 }).success).toBe(
			false,
		);
		expect(
			searchTool.parameters.safeParse({
				exactKeywords: ["GitHub"],
				perPage: 0,
			}).success,
		).toBe(false);
		expect(
			searchTool.parameters.safeParse({
				exactKeywords: ["GitHub"],
				perPage: 11,
			}).success,
		).toBe(false);
		expect(
			searchTool.parameters.safeParse({
				exactKeywords: ["GitHub"],
				page: 0,
			}).success,
		).toBe(false);
		expect(searchTool.parameters.safeParse({ perPage: 1 }).success).toBe(false);
		expect(
			searchTool.parameters.safeParse({
				sort: "updated-desc",
			}).success,
		).toBe(false);
		expect(
			searchTool.parameters.safeParse({
				query: "GitHub Actions",
			}).success,
		).toBe(false);
		expect(
			searchTool.parameters.safeParse({
				keywords: ["GitHub"],
			}).success,
		).toBe(false);
		expect(
			searchTool.parameters.safeParse({
				exactKeywords: ["GitHub"],
				caseSensitiveTag: true,
			}).success,
		).toBe(false);
		expect(
			searchTool.parameters.safeParse({
				exactKeywords: ["GitHub"],
				caseSensitiveTag: false,
			}).success,
		).toBe(true);
		expect(
			searchTool.parameters.safeParse({
				exactKeywords: ["GitHub"],
				sort: "updated-desc",
			}).success,
		).toBe(true);
		expect(
			searchTool.parameters.safeParse({
				exactKeywords: ["GitHub"],
				sort: "updated",
			}).success,
		).toBe(false);
		expect(Object.keys(searchTool.parameters.shape)).not.toContain("query");
		expect(Object.keys(searchTool.parameters.shape)).not.toContain("keywords");
		expect(Object.keys(searchTool.parameters.shape)).toEqual(
			expect.arrayContaining([
				"exactKeywords",
				"title",
				"number",
				"wip",
				"sort",
			]),
		);
		expect(esaClient.getPost).not.toHaveBeenCalled();
	});

	it("returns tool error payloads when esa requests fail", async () => {
		const logger = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
		};
		const esaClient = {
			getPosts: vi.fn().mockRejectedValue(new Error("search failed")),
			getPost: vi.fn().mockRejectedValue("post failed"),
		};
		buildAgent(esaClient, { logger });

		const getPostTool = toolOptions.find(
			(tool) => tool.name === "get_esa_post",
		);
		const searchTool = toolOptions.find(
			(tool) => tool.name === "search_esa_posts",
		);

		await expect(
			searchTool.execute(
				searchTool.parameters.parse({
					exactKeywords: ["GitHub", "Actions"],
				}),
			),
		).resolves.toMatchObject({
			status: "error",
			query: '"GitHub" "Actions" wip:false -Archive',
			message: "search failed",
		});
		await expect(
			getPostTool.execute(
				getPostTool.parameters.parse({
					postNumber: 123,
				}),
			),
		).resolves.toMatchObject({
			status: "error",
			postNumber: 123,
			message: "post failed",
		});
		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "agent tool error",
				toolName: "search_esa_posts",
				query: '"GitHub" "Actions" wip:false -Archive',
				error: "search failed",
			}),
		);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "agent tool error",
				toolName: "get_esa_post",
				postNumber: 123,
				error: "post failed",
			}),
		);
	});

	it("throws when ADK returns an error event", async () => {
		const esaClient = {
			getPosts: vi.fn(),
			getPost: vi.fn(),
		};
		const service = buildService(esaClient);

		mockRunEphemeral.mockReturnValue(
			events([{ errorCode: "MODEL_ERROR", errorMessage: "model failed" }]),
		);

		const stream = await service.answerQuestion({
			question: "質問",
			now: new Date("2026-04-11T10:00:00+09:00"),
		});

		await expect(async () => {
			for await (const _chunk of stream) {
				// consume stream
			}
		}).rejects.toThrow("model failed");
	});
});
