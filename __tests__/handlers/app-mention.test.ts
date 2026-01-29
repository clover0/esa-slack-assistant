import type { Post } from "../../src/dto/post";
import type { EsaClient } from "../../src/externals/esa/client";
import { AppMentionHandler } from "../../src/handlers/app-mention";
import type { AnswerService } from "../../src/services/answer-service";
import { EsaService } from "../../src/services/esa-service";
import { loadingMessageBlock } from "../../src/ui/app-mention";

async function* genChunks(parts: string[]) {
	for (const p of parts) {
		yield { textDelta: p } as any;
	}
}

function makePosts(nums: number[]): Post[] {
	return nums.map((n) => ({
		number: n,
		name: `name-${n}`,
		full_name: `full-${n}`,
		body_md: `body-${n}`,
		category: "cat",
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		url: `https://example.com/${n}`,
		tags: [],
	}));
}

describe("AppMentionHandler", () => {
	const logger = {
		info: jest.fn(),
		debug: jest.fn(),
		error: jest.fn(),
	} as any;

	const baseEvent = {
		type: "app_mention",
		channel: "C123",
		user: "U123",
		ts: "111.111",
		text: "question text",
	} as any;

	function buildHandler(
		mocks?: Partial<{
			categories: { path: string; posts: number }[];
			collected: Post[];
			searched: Post[];
			answerParts: string[];
		}>,
	) {
		const esaClient: jest.Mocked<Pick<EsaClient, "getCategories" | any>> = {
			getCategories: jest.fn().mockResolvedValue({
				categories: mocks?.categories ?? [
					{ path: "Category1", posts: 10 },
					{ path: "Category2", posts: 5 },
				],
			}),
		};

		const esaService = new EsaService(esaClient as any);
		jest
			.spyOn(esaService, "collectPostsByCategories")
			.mockResolvedValue(mocks?.collected ?? makePosts([1, 2]));
		jest
			.spyOn(esaService, "searchPostsByKeywords")
			.mockResolvedValue(mocks?.searched ?? makePosts([2, 3]));

		const answerService: jest.Mocked<AnswerService> = {
			selectCategory: jest.fn().mockResolvedValue(["Category1"]),
			generateKeywords: jest.fn().mockResolvedValue(["kw1", "kw2"]),
			answerQuestion: jest
				.fn()
				.mockResolvedValue(genChunks(mocks?.answerParts ?? ["A", "B"])),
			checkDuplicate: jest.fn().mockResolvedValue({ isDuplicate: false }),
			generateArticle: jest
				.fn()
				.mockResolvedValue({ title: "title", body: "body", tags: [] }),
		};

		const handler = new AppMentionHandler(
			esaClient as any,
			esaService,
			answerService,
		);

		return { handler, esaClient, esaService, answerService };
	}

	function buildSlackClient() {
		const postMessage = jest.fn();
		const update = jest.fn();
		const replies = jest.fn();
		const info = jest.fn();
		const chatStreamAppend = jest.fn();
		const chatStreamStop = jest.fn();

		info.mockResolvedValue({
			channel: { is_shared: false },
		});

		const client = {
			chat: {
				postMessage,
				update,
				delete: jest.fn(),
			},
			conversations: {
				replies,
				info,
			},
			chatStream: jest.fn().mockReturnValue({
				append: chatStreamAppend,
				stop: chatStreamStop,
			}),
		} as any;

		return {
			client,
			postMessage,
			update,
			replies,
			info,
			chatStreamAppend,
			chatStreamStop,
		};
	}

	it("ignores restricted users and posts a notice", async () => {
		const { handler } = buildHandler();
		const { client, postMessage } = buildSlackClient();

		const event = {
			...baseEvent,
			user_profile: { is_restricted: true },
		} as any;

		await handler.handle({ context: {}, client, event, logger } as any);

		expect(postMessage).toHaveBeenCalledTimes(1);
		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "C123",
				thread_ts: "111.111",
				text: expect.stringContaining(
					"ゲストの方は利用できないようにしています。",
				),
			}),
		);
	});

	it("ignores externally shared channels and posts a notice", async () => {
		const { handler } = buildHandler();
		const { client, postMessage, info } = buildSlackClient();

		info.mockResolvedValue({
			channel: { is_shared: true },
		});

		await handler.handle({
			context: {},
			client,
			event: baseEvent,
			logger,
		} as any);

		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "C123",
				thread_ts: "111.111",
				text: expect.stringContaining(
					"外部と共有しているチャンネルでは利用できません。",
				),
			}),
		);
	});

	it("posts an error message when channel info lookup fails", async () => {
		const { handler, answerService } = buildHandler();
		const { client, postMessage, info } = buildSlackClient();

		info.mockRejectedValue(new Error("info failure"));

		await handler.handle({
			context: {},
			client,
			event: baseEvent,
			logger,
		} as any);

		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "C123",
				thread_ts: "111.111",
				text: expect.stringContaining("エラーが発生しました。"),
			}),
		);
		expect(answerService.answerQuestion).not.toHaveBeenCalled();
	});

	describe("when the mention starts a new thread", () => {
		async function handleNewThread({
			answerParts = ["foo", "bar"],
			collected,
			searched,
		}: Partial<{
			answerParts: string[];
			collected: Post[];
			searched: Post[];
		}> = {}) {
			const { handler, answerService } = buildHandler({
				answerParts,
				collected,
				searched,
			});
			const { client, postMessage, update } = buildSlackClient();
			postMessage.mockResolvedValue({ message: { ts: "200.200" } });
			const event = { ...baseEvent } as any; // no thread_ts

			await handler.handle({ context: {}, client, event, logger } as any);

			return { postMessage, update, answerService };
		}

		it("posts a loading message while searching articles", async () => {
			const { postMessage } = await handleNewThread();

			expect(postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					channel: "C123",
					thread_ts: "111.111",
					blocks: [loadingMessageBlock()],
				}),
			);
		});

		it("merges collected and searched posts before answering", async () => {
			const { answerService } = await handleNewThread({
				collected: makePosts([1, 2]),
				searched: makePosts([2, 4]),
			});

			const params = answerService.answerQuestion.mock.calls[0][0];
			const usedPostNumbers = params.posts
				.map((p) => p.number)
				.sort((a, b) => a - b);

			expect(usedPostNumbers).toEqual([1, 2, 4]);
			expect(params.question).toBe("question text");
		});

		it("streams accumulated markdown updates", async () => {
			const { handler, answerService } = buildHandler({
				answerParts: ["foo", "bar"],
			});
			const { client, postMessage, chatStreamAppend, chatStreamStop } =
				buildSlackClient();
			postMessage.mockResolvedValue({ message: { ts: "200.200" } });
			const event = { ...baseEvent } as any;

			await handler.handle({ context: {}, client, event, logger } as any);

			expect(chatStreamAppend).toHaveBeenCalledTimes(2);
			expect(chatStreamAppend.mock.calls[0][0]).toEqual(
				expect.objectContaining({
					markdown_text: "foo",
				}),
			);
			expect(chatStreamAppend.mock.calls[1][0]).toEqual(
				expect.objectContaining({
					markdown_text: "bar",
				}),
			);
			expect(chatStreamStop).toHaveBeenCalledTimes(1);
		});
	});

	it("responds inside an existing thread and passes history to services", async () => {
		const { handler, answerService } = buildHandler({
			answerParts: ["x", "y"],
		});
		const { client, postMessage, replies, chatStreamAppend, chatStreamStop } =
			buildSlackClient();

		postMessage.mockResolvedValue({ message: { ts: "300.300" } });

		replies.mockResolvedValue({
			messages: [
				{
					text: "hello",
					bot_id: undefined,
					ts: "1759359688.090919",
					user: "user-1",
				},
				{ text: "hi", bot_id: "B123", ts: "1759359689.890919", user: "bot" },
			],
		});

		const event = { ...baseEvent, thread_ts: "111.111" } as any;

		await handler.handle({ context: {}, client, event, logger } as any);

		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				thread_ts: "111.111",
				blocks: [loadingMessageBlock()],
			}),
		);

		const expectedHistory = [
			{
				role: "user" as const,
				text: expect.stringMatching(/hello[\s\S]*from user-1 at /),
			},
			{
				role: "assistant" as const,
				text: expect.stringMatching(/hi[\s\S]*from bot at /),
			},
		];

		const selectCategoryParams = answerService.selectCategory.mock.calls[0][0];
		expect(selectCategoryParams.userQuestion).toBe("question text");
		expect(selectCategoryParams.history).toEqual(expectedHistory);

		const answerQuestionParams = answerService.answerQuestion.mock.calls[0][0];
		expect(answerQuestionParams.history).toEqual(expectedHistory);

		expect(chatStreamAppend).toHaveBeenCalledTimes(2);
		expect(chatStreamAppend.mock.calls[0][0]).toEqual(
			expect.objectContaining({ markdown_text: "x" }),
		);
		expect(chatStreamAppend.mock.calls[1][0]).toEqual(
			expect.objectContaining({ markdown_text: "y" }),
		);
		expect(chatStreamStop).toHaveBeenCalledTimes(1);
	});

	it("posts an error message when an exception occurs", async () => {
		const { handler, answerService } = buildHandler();
		const { client, postMessage, chatStreamStop } = buildSlackClient();

		postMessage.mockResolvedValueOnce({ message: { ts: "400.400" } });

		answerService.answerQuestion.mockRejectedValue(new Error("boom"));

		const event = { ...baseEvent } as any;

		await handler.handle({ context: {}, client, event, logger } as any);

		expect(postMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				channel: "C123",
				thread_ts: "111.111",
				text: expect.stringContaining("エラーが発生しました。\n"),
			}),
		);
		expect(chatStreamStop).toHaveBeenCalledTimes(1);
	});
});
