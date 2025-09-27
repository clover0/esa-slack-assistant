import { type KeySelector, merge } from "../../src/util/array";

describe("merge", () => {
	type Item = { id: number; name?: string; nested?: { key: string } };

	it("merges two arrays with unique keys without removing any items", () => {
		const a1: Item[] = [
			{ id: 1, name: "a1" },
			{ id: 2, name: "a2" },
		];
		const a2: Item[] = [
			{ id: 3, name: "a3" },
			{ id: 4, name: "a4" },
		];

		const result = merge(a1, a2, (x) => x.id);

		expect(result).toHaveLength(4);
		expect(result.map((x) => x.id).sort()).toEqual([1, 2, 3, 4]);
	});

	it("uses items appearing later to override earlier ones when keys collide across arrays", () => {
		const a1: Item[] = [
			{ id: 1, name: "one" },
			{ id: 2, name: "two" },
		];
		const a2: Item[] = [
			{ id: 2, name: "TWO" },
			{ id: 3, name: "THREE" },
		];

		const result = merge(a1, a2, (x) => x.id);

		const byId = Object.fromEntries(result.map((x) => [x.id, x]));
		expect(byId[1]).toEqual({ id: 1, name: "one" });
		expect(byId[2]).toEqual({ id: 2, name: "TWO" });
		expect(byId[3]).toEqual({ id: 3, name: "THREE" });
	});

	it("handles duplicates within the same array; the last occurrence wins", () => {
		const a1: Item[] = [
			{ id: 1, name: "v1" },
			{ id: 1, name: "v2" }, // duplicate within the same array
			{ id: 2, name: "v3" },
		];

		const result = merge(a1, [], (x) => x.id);

		const byId = Object.fromEntries(result.map((x) => [x.id, x]));
		expect(byId[1]).toEqual({ id: 1, name: "v2" });
		expect(byId[2]).toEqual({ id: 2, name: "v3" });
	});

	it("works with nested key selectors", () => {
		const a1 = [
			{ id: 1, nested: { key: "a" } },
			{ id: 2, nested: { key: "b" } },
		];
		const a2 = [
			{ id: 3, nested: { key: "b" } }, // overrides id=2 based on nested.key
			{ id: 4, nested: { key: "c" } },
		];

		const keySelector: KeySelector<Item> = (x) => x.nested!.key;
		const result = merge(a1 as Item[], a2 as Item[], keySelector);

		const keys = result.map((x) => x.nested!.key).sort();
		expect(keys).toEqual(["a", "b", "c"]);

		const byKey = Object.fromEntries(result.map((x) => [x.nested!.key, x]));
		expect(byKey["b"].id).toBe(3);
	});

	it("preserves the position of the first occurrence of each unique key (Map insertion order)", () => {
		const a1: Item[] = [
			{ id: 1, name: "first" },
			{ id: 2, name: "second" },
		];
		const a2: Item[] = [
			{ id: 2, name: "SECOND-OVERRIDE" },
			{ id: 3, name: "third" },
		];

		const result = merge(a1, a2, (x) => x.id);
		expect(result.map((x) => x.id)).toEqual([1, 2, 3]);
		expect(result[1]).toEqual({ id: 2, name: "SECOND-OVERRIDE" });
	});
});
