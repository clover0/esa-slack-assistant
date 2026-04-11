import { GeminiAnswerService } from "../../src/services/gemini-answer-service";

const { mockGenerateContent, mockGenerateContentStream } = vi.hoisted(() => ({
	mockGenerateContent: vi.fn(),
	mockGenerateContentStream: vi.fn(),
}));

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn().mockImplementation(() => ({
		models: {
			generateContent: mockGenerateContent,
			generateContentStream: mockGenerateContentStream,
		},
	})),
	FinishReason: { STOP: "STOP" },
	Modality: { TEXT: "TEXT" },
	Type: {
		ARRAY: "ARRAY",
		BOOLEAN: "BOOLEAN",
		INTEGER: "INTEGER",
		OBJECT: "OBJECT",
		STRING: "STRING",
	},
}));

describe("GeminiAnswerService", () => {
	beforeEach(() => {
		mockGenerateContent.mockReset();
		mockGenerateContentStream.mockReset();
	});

	describe("generateKeywords", () => {
		it("includes esa categories as reference information in the prompt", async () => {
			mockGenerateContent.mockResolvedValue({
				text: "[\"GitHub Actions\", \"デプロイ\"]",
			});

			const service = new GeminiAnswerService({
				project: "test-project",
				location: "asia-northeast1",
			});

			await expect(
				service.generateKeywords({
					categories: ["Org/Infra", "Org/Product"],
					userQuestion: "GitHub Actions の設定を確認したい",
					now: new Date("2026-04-11T10:00:00+09:00"),
				}),
			).resolves.toEqual(["GitHub Actions", "デプロイ"]);

			expect(mockGenerateContent).toHaveBeenCalledTimes(1);

			const args = mockGenerateContent.mock.calls[0][0];
			expect(args.config.systemInstruction).toContain("# 参考情報");
			expect(args.config.systemInstruction).toContain(
				"以下は組織の esa 上のカテゴリ一覧です。検索キーワードの推定時に参考にしてください。",
			);
			expect(args.config.systemInstruction).toContain("Org/Infra");
			expect(args.config.systemInstruction).toContain("Org/Product");
		});

		it("throws when Gemini returns an empty response", async () => {
			mockGenerateContent.mockResolvedValue({ text: "   " });

			const service = new GeminiAnswerService({
				project: "test-project",
				location: "asia-northeast1",
			});

			await expect(
				service.generateKeywords({
					categories: ["Org/Infra"],
					userQuestion: "デプロイ手順は？",
					now: new Date("2026-04-11T10:00:00+09:00"),
				}),
			).rejects.toThrow("Empty JSON response from Gemini");
		});
	});
});
