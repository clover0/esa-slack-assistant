import { loadGoogleCloudConfig } from "../../src/util/config";

describe("loadGoogleCloudConfig", () => {
	it("returns default Google Cloud config when env values are missing", () => {
		expect(loadGoogleCloudConfig({})).toEqual({
			project: "",
			location: "global",
			model: "gemini-3-flash-preview",
		});
	});

	it("returns Google Cloud config from env values", () => {
		expect(
			loadGoogleCloudConfig({
				GOOGLE_CLOUD_PROJECT_ID: "test-project",
				GOOGLE_CLOUD_LOCATION: "asia-northeast1",
				GOOGLE_GEMINI_MODEL: "gemini-test-model",
			}),
		).toEqual({
			project: "test-project",
			location: "asia-northeast1",
			model: "gemini-test-model",
		});
	});
});
