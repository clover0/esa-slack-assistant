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
}
