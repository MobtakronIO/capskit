# Learning: Synchronous Trace Writes Block the Event Loop

## Observation
`writeTrace` in `platform.ts` uses `fs.appendFileSync` (and falls back to `process.stdout.write`) inside a `finally` block after every traced action.

## Lesson
Under load, synchronous file/stdout writes inside the request hot path will degrade throughput. This is acceptable for test suites but not for production.

## Recommendation
Queue traces to an async batch writer, or use a dedicated stream/pipeline. If traces must be synchronous for test determinism, gate sync writes behind a `process.env.NODE_ENV === 'test'` flag.

## Related Files
- `packages/capskit/src/kernel/platform.ts`
