// Published SDK codecs supply generated defaults; application fields remain typed.
export function build<T>(codec: { fromJSON(value: unknown): T }, fields: Partial<T>): T {
  return Object.assign(codec.fromJSON({}) as object, fields) as T;
}
