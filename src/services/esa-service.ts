import type { EsaClient } from "../externals/esa/client";

export class EsaService {
	private esa: EsaClient;

	constructor(esaClient: EsaClient) {
		this.esa = esaClient;
	}

	async collectPostsByCategories(categories: string[]) {
		const responses = await Promise.all(
			categories.map((path) =>
				this.esa.getPosts({ q: `on:${path} wip:false` }),
			),
		);

		return responses.flatMap((response) => response.posts);
	}

	async searchPostsByKeywords(keywords: string[]) {
		const query = this.buildKeywordsQuery(keywords);
		const response = await this.esa.getPosts({ q: `${query} wip:false` });
		return response.posts;
	}

	private buildKeywordsQuery(keywords: string[]) {
		return keywords.map((keyword) => `"${keyword}"`).join(" OR ");
	}
}
