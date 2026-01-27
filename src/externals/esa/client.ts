import axios, { type AxiosInstance } from "axios";
import type { Post } from "../../dto/post";

interface GetCategoryParams {
	prefix?: string;
	suffix?: string;
	match?: string;
	exact_match?: string;
}

interface GetCategoryResponse {
	categories: {
		path: string;
		posts: number;
	}[];
}

interface GetPostsParams {
	q: string;
	per_page?: number;
}

interface CreatePostParams {
	name: string;
	body_md: string;
	tags?: string[];
	category?: string;
	wip?: boolean;
	message?: string;
}

interface GetPostsResponse {
	posts: Post[];
	prev_page: number | null;
	next_page: number | null;
	total_count: number;
	page: number;
	per_page: number;
	max_per_page: number;
}

export type EsaErrorResponse = {
	error: string;
	message?: string;
};

export const esaMaxPostsPerPage = 30;

export class EsaClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly team: string;
	private readonly client: AxiosInstance;

	constructor(config: { apiKey: string; team: string; baseUrl?: string }) {
		if (!config.apiKey) {
			throw new Error("Esa API key is required");
		}

		if (!config.team) {
			throw new Error("Esa team name is required");
		}

		this.apiKey = config.apiKey;
		this.team = config.team;
		this.baseUrl = config.baseUrl ?? "https://api.esa.io";

		this.client = axios.create({
			baseURL: this.baseUrl,
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"User-Agent": "https://github.com/clover0/esa-slack-assistant",
			},
		});
	}

	async getCategories(
		params: GetCategoryParams,
		option?: { excludeArchive: boolean },
	): Promise<GetCategoryResponse> {
		const apiPath = `/v1/teams/${this.team}/categories/paths`;

		try {
			const response = await this.client.get(apiPath, {
				params: { ...params },
			});
			if (option?.excludeArchive) {
				response.data.categories = (
					response.data as GetCategoryResponse
				).categories.filter((c: { path: string }) => {
					return !!c.path && !c.path.includes("Archive");
				});
			}
			return response.data;
		} catch (err: any) {
			console.error("esa API error:", err.response?.data || "", err.message);
			throw err;
		}
	}

	async getPosts(params: GetPostsParams): Promise<GetPostsResponse> {
		const apiPath = `/v1/teams/${this.team}/posts`;

		try {
			const response = await this.client.get(apiPath, {
				params: { max_per_page: esaMaxPostsPerPage, ...params },
			});
			return response.data;
		} catch (err: any) {
			console.error("esa API error:", err.response?.data || "", err.message);
			throw err;
		}
	}

	async createPost(params: CreatePostParams): Promise<Post> {
		const apiPath = `/v1/teams/${this.team}/posts`;

		try {
			const response = await this.client.post(apiPath, {
				post: {
					name: params.name,
					body_md: params.body_md,
					tags: params.tags ?? [],
					category: params.category,
					wip: params.wip ?? true,
					message: params.message,
				},
			});
			return response.data;
		} catch (err: any) {
			console.error("esa API error:", err.response?.data || "", err.message);
			throw err;
		}
	}
}
