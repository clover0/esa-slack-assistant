import type { EsaClient } from "../../src/externals/esa/client";
import { ReactionAddedHandler } from "../../src/handlers/reaction-added";
import type { AnswerService } from "../../src/services/answer-service";
import { EsaService } from "../../src/services/esa-service";

describe("ReactionAddedHandler", () => {
	const logger = {
		info: jest.fn(),
		debug: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
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
		const esaClient: jest.Mocked<
			Pick<EsaClient, "getCategories" | "createPost">
		> = {
			getCategories: jest.fn(),
			createPost: jest.fn(),
		};

		const esaService = new EsaService(esaClient as any);
		jest.spyOn(esaService, "collectPostsByCategories").mockResolvedValue([]);
		jest.spyOn(esaService, "searchPostsByKeywords").mockResolvedValue([]);

		const answerService: jest.Mocked<AnswerService> = {
			selectCategory: jest.fn().mockResolvedValue([]),
			generateKeywords: jest.fn().mockResolvedValue([]),
			answerQuestion: jest.fn(),
			checkDuplicate: jest.fn().mockResolvedValue({
				isDuplicate: false,
				reason: "reason",
			}),
			generateArticle: jest
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
		const usersInfo = jest.fn();
		const conversationsInfo = jest.fn();
		const replies = jest.fn();
		const postMessage = jest.fn();
		const update = jest.fn();

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
