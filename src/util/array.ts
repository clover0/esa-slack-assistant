export type KeySelector<T> = (item: T) => any;

/**
 * Merge two arrays and remove duplicates based on the specified key
 * If an item appears later has the same key as an item that appears earlier, it will override it.
 *
 * @param array1 First array
 * @param array2 Second array
 * @param keySelector A function that extracts a key for determining duplicates from each item
 * @returns A new array with duplicates removed and arrays merged
 */
export function merge<T>(
	array1: T[],
	array2: T[],
	keySelector: KeySelector<T>,
): T[] {
	return Array.from(
		[...array1, ...array2]
			.reduce(
				(map, item) => map.set(keySelector(item), item),
				new Map<any, T>(),
			)
			.values(),
	);
}
