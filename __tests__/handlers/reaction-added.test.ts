import type { EsaClient } from "../../src/externals/esa/client";
import { ReactionAddedHandler } from "../../src/handlers/reaction-added";
import type { AnswerService } from "../../src/services/answer-service";
import { EsaService } from "../../src/services/esa-service";
import type { Mocked } from "vitest";

describe("ReactionAddedHandler", () => {
	const logger = {
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	} as any;

	const baseEvent = {
		type: "reaction_added",
		user: "U123",
		reaction: "esa",
		item: {
			type: "message",
			channel: "C123",
			ts: "111.111",
		},
	} as any;

	function buildHandler() {
		const esaClient: Mocked<Pick<EsaClient, "getCategories" | "createPost">> = {
			getCategories: vi.fn(),
			createPost: vi.fn(),
		};

		const esaService = new EsaService(esaClient as any);
		vi.spyOn(esaService, "collectPostsByCategories").mockResolvedValue([]);
		vi.spyOn(esaService, "searchPostsByKeywords").mockResolvedValue([]);

		const answerService: Mocked<AnswerService> = {
			selectCategory: vi.fn().mockResolvedValue([]),
			generateKeywords: vi.fn().mockResolvedValue([]),
			answerQuestion: vi.fn(),
			checkDuplicate: vi.fn().mockResolvedValue({
				isDuplicate: false,
				reason: "reason",
			}),
			generateArticle: vi
				.fn()
				.mockResolvedValue({ title: "title", body: "body", tags: [] }),
		};

		const handler = new ReactionAddedHandler(
			esaClient as any,
			esaService,
			answerService,
			"esa",
		);

		return { handler, esaService, answerService };
	}

	function buildSlackClient() {
		const usersInfo = vi.fn();
		const conversationsInfo = vi.fn();
		const replies = vi.fn();
		const postMessage = vi.fn();
		const update = vi.fn();

		const client = {
			users: {
				info: usersInfo,
			},
			conversations: {
				info: conversationsInfo,
				replies,
			},
			chat: {
				postMessage,
				update,
			},
		} as any;

		return {
			client,
			usersInfo,
			conversationsInfo,
			replies,
			postMessage,
			update,
		};
	}

	it("ignores restricted users", async () => {
		const { handler, esaService, answerService } = buildHandler();
		const { client, usersInfo, postMessage } = buildSlackClient();

		usersInfo.mockResolvedValue({ user: { is_restricted: true } });

		await handler.handle({
			client,
			event: baseEvent,
			logger,
			context: {},
		} as any);

		expect(usersInfo).toHaveBeenCalledWith({ user: "U123" });
		expect(esaService.collectPostsByCategories).not.toHaveBeenCalled();
		expect(esaService.searchPostsByKeywords).not.toHaveBeenCalled();
		expect(answerService.generateArticle).not.toHaveBeenCalled();
		expect(postMessage).not.toHaveBeenCalled();
	});

	it("skips processing when user info lookup fails", async () => {
		const { handler, esaService, answerService } = buildHandler();
		const { client, usersInfo, conversationsInfo, postMessage } =
			buildSlackClient();

		usersInfo.mockRejectedValue(new Error("lookup failed"));

		await handler.handle({
			client,
			event: baseEvent,
			logger,
			context: {},
		} as any);

		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "failed to fetch user info; skipping reaction",
				user: "U123",
			}),
		);
		expect(conversationsInfo).not.toHaveBeenCalled();
		expect(esaService.collectPostsByCategories).not.toHaveBeenCalled();
		expect(esaService.searchPostsByKeywords).not.toHaveBeenCalled();
		expect(answerService.generateArticle).not.toHaveBeenCalled();
		expect(postMessage).not.toHaveBeenCalled();
	});
});
