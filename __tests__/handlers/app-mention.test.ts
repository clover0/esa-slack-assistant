import type { Mocked } from "vitest";
import { AppMentionHandler } from "../../src/handlers/app-mention";
import type { QuestionAnswerService } from "../../src/services/answer-service";
import { loadingMessageBlock } from "../../src/ui/app-mention";

async function* genChunks(parts: string[]) {
	for (const p of parts) {
		yield { textDelta: p } as any;
	}
}

describe("AppMentionHandler", () => {
	const logger = {
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
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
			answerParts: string[];
			questionAnswerService: QuestionAnswerService;
		}>,
	) {
		const questionAnswerService = (mocks?.questionAnswerService ?? {
			answerQuestion: vi
				.fn()
				.mockResolvedValue(genChunks(mocks?.answerParts ?? ["A", "B"])),
		}) as Mocked<QuestionAnswerService>;

		const handler = new AppMentionHandler(questionAnswerService);

		return { handler, questionAnswerService };
	}

	function buildSlackClient() {
		const postMessage = vi.fn();
		const replies = vi.fn();
		const info = vi.fn();
		const chatStreamAppend = vi.fn();
		const chatStreamStop = vi.fn();

		info.mockResolvedValue({
			channel: { is_shared: false },
		});

		const client = {
			chat: {
				postMessage,
				delete: vi.fn(),
			},
			conversations: {
				replies,
				info,
			},
			chatStream: vi.fn().mockReturnValue({
				append: chatStreamAppend,
				stop: chatStreamStop,
			}),
		} as any;

		return {
			client,
			postMessage,
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
		const { handler, questionAnswerService } = buildHandler();
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
		expect(questionAnswerService.answerQuestion).not.toHaveBeenCalled();
	});

	describe("when the mention starts a new thread", () => {
		async function handleNewThread({
			answerParts = ["foo", "bar"],
		}: Partial<{
			answerParts: string[];
		}> = {}) {
			const { handler, questionAnswerService } = buildHandler({
				answerParts,
			});
			const { client, postMessage, chatStreamAppend, chatStreamStop } =
				buildSlackClient();
			postMessage.mockResolvedValue({ message: { ts: "200.200" } });
			const event = { ...baseEvent } as any; // no thread_ts

			await handler.handle({ context: {}, client, event, logger } as any);

			return {
				postMessage,
				questionAnswerService,
				chatStreamAppend,
				chatStreamStop,
			};
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

		it("passes the question to the answer service", async () => {
			const { questionAnswerService } = await handleNewThread();

			expect(questionAnswerService.answerQuestion).toHaveBeenCalledWith(
				expect.objectContaining({
					question: "question text",
					now: expect.any(Date),
				}),
			);
			expect(
				questionAnswerService.answerQuestion.mock.calls[0][0],
			).not.toHaveProperty("posts");
		});

		it("streams accumulated markdown updates", async () => {
			const { chatStreamAppend, chatStreamStop } = await handleNewThread({
				answerParts: ["foo", "bar"],
			});

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
		const { handler, questionAnswerService } = buildHandler({
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

		const answerQuestionParams =
			questionAnswerService.answerQuestion.mock.calls[0][0];
		expect(answerQuestionParams.question).toBe("question text");
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
		const { handler, questionAnswerService } = buildHandler();
		const { client, postMessage, chatStreamStop } = buildSlackClient();

		postMessage.mockResolvedValueOnce({ message: { ts: "400.400" } });

		questionAnswerService.answerQuestion.mockRejectedValue(new Error("boom"));

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
