# Learning: Hand-Rolled Schema Validation is Fast but Fragile

## Observation
`platform.ts` contains a ~150-line hand-rolled JSON Schema subset validator supporting `required`, `properties`, `type`, `enum`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `format`, `additionalProperties`, and array `items`.

## Lesson
This approach got tests passing quickly without adding a dependency, but it:
- Silently swallows invalid regex in `pattern`
- Does not support `oneOf`/`anyOf`/`allOf`, `$ref`, or nested object schemas
- Duplicates normalization logic inside the validator

## Recommendation
Replace with `ajv` or a similarly maintained library, or clearly document the supported subset in `DESIGN.md`. If keeping the hand-rolled version, add at least one test per unsupported feature to document the limitation.

## Related Files
- `packages/capskit/src/kernel/platform.ts`
