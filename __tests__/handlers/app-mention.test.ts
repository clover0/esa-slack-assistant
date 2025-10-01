import type { Post } from "../../src/dto/post";
import type { EsaClient } from "../../src/externals/esa/client";
import { AppMentionHandler } from "../../src/handlers/app-mention";
import type { AnswerService } from "../../src/services/answer-service";
import { EsaService } from "../../src/services/esa-service";

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
		};

		const handler = new AppMentionHandler(
			esaClient as any,
			esaService,
			answerService,
		);

		return { handler, esaClient, esaService, answerService };
	}

	function buildClient() {
		const postMessage = jest.fn();
		const update = jest.fn();
		const replies = jest.fn();

		const client = {
			chat: {
				postMessage,
				update,
			},
			conversations: {
				replies,
			},
		} as any;

		return { client, postMessage, update, replies };
	}

	it("ignores restricted users and posts a notice", async () => {
		const { handler } = buildHandler();
		const { client, postMessage } = buildClient();

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

	it("responds in a new thread: posts hourglass, merges posts, streams updates", async () => {
		const { handler, answerService } = buildHandler({
			collected: makePosts([1, 2]),
			searched: makePosts([2, 4]),
			answerParts: ["foo", "bar"],
		});
		const { client, postMessage, update } = buildClient();
		postMessage.mockResolvedValue({ message: { ts: "200.200" } });
		const event = { ...baseEvent } as any; // no thread_ts

		await handler.handle({ context: {}, client, event, logger } as any);

		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "C123",
				thread_ts: "111.111",
				text: ":hourglass_flowing_sand:...",
			}),
		);

		const calledArgs = answerService.answerQuestion.mock.calls[0];

		const params = calledArgs[0];
		const usedPostNumbers = params.posts
			.map((p) => p.number)
			.sort((a, b) => a - b);
		expect(usedPostNumbers).toEqual([1, 2, 4]);

		expect(params.question).toBe("question text");

		expect(update).toHaveBeenCalledTimes(2);
		expect(update.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				channel: "C123",
				ts: "200.200",
				markdown_text: "foo",
			}),
		);
		expect(update.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				channel: "C123",
				ts: "200.200",
				markdown_text: "foobar",
			}),
		);
	});

	it("responds inside an existing thread and passes history", async () => {
		const { handler, answerService } = buildHandler({
			answerParts: ["x", "y"],
		});
		const { client, postMessage, update, replies } = buildClient();

		postMessage.mockResolvedValue({ message: { ts: "300.300" } });

		replies.mockResolvedValue({
			messages: [
				{ text: "hello", bot_id: undefined },
				{ text: "hi", bot_id: "B123" },
			],
		});

		const event = { ...baseEvent, thread_ts: "111.111" } as any;

		await handler.handle({ context: {}, client, event, logger } as any);

		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				thread_ts: "111.111",
				text: ":hourglass_flowing_sand:...",
			}),
		);

		const selectCategoryParams = answerService.selectCategory.mock.calls[0][0];
		expect(selectCategoryParams.userQuestion).toBe("question text");
		expect(selectCategoryParams.history).toEqual([
			{ role: "user", text: "hello" },
			{ role: "assistant", text: "hi" },
		]);

		const answerQuestionParams = answerService.answerQuestion.mock.calls[0][0];
		expect(answerQuestionParams.history).toEqual([
			{ role: "user", text: "hello" },
			{ role: "assistant", text: "hi" },
		]);

		expect(update).toHaveBeenCalledTimes(2);
		expect(update.mock.calls[1][0]).toEqual(
			expect.objectContaining({ ts: "300.300", markdown_text: "xy" }),
		);
	});

	it("posts an error message when an exception occurs", async () => {
		const { handler, answerService } = buildHandler();
		const { client, postMessage } = buildClient();

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
	});
});
