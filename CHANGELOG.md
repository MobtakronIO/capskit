# Changelog

## [0.4.0] - 2026-03-29

### 🚀 New Features

#### Resiliency Patterns
- Circuit breaker with open/closed/half-open states and configurable thresholds
- Fallback chains: cache fallback (serve stale data) and action fallback (degraded service)
- Fallback loop detection via AsyncLocalStorage per trace
- Deterministic timer cleanup via CircuitBreakerTimerRegistry

#### Drizzle ORM Capsule
- Full Postgres (via Neon) and SQLite database capsule
- Actions: query, execute, transaction, health, close, migrate
- Supports raw SQL and Drizzle `sql` literals
- Environment-driven pool config and automatic rollback

#### Testing Toolkit (@capskit/testing)
- Lightweight test harness without full kernel boot
- createTestCapsKit(), createMockDeps(), createMockFn()
- Event capture and rich assertions

#### Dependency Graph Bootloader
- DAG topological sort for capsule boot sequencing
- Cycle detection (CycleDetectedError) with full path reporting
- Missing dependency detection (MissingDependencyError)
- Dual readiness signaling (init Promise + ready event)
- Per-capsule boot timeouts

#### Built-in Observability / Call Tracing
- AsyncLocalStorage-based trace propagation through nested calls
- Auto-generated UUID trace IDs
- Configurable trace sinks (stdout/file) via CAPSKIT_TRACE=1
- Nested call visualization for debugging

#### Standardized Error Taxonomy
- 12 structured error types: ValidationError, NotFoundError, TimeoutError, UnauthorizedError, ForbiddenError, TraitError, DependencyError, HandlerError, InternalError, BootTimeoutError, CycleDetectedError, MissingDependencyError
- Canonical error envelopes with env-aware stack stripping

#### Strict Action Schema Contracts
- inputSchema / outputSchema with .strict mode
- Validation enforced at action boundaries

#### API Steering & Lint Guards
- Public API steered toward capskit.use('capsule').action()
- ESLint rule @capskit/no-direct-call

#### Adapter Plugin Contract
- Formalized plugin compatibility layer for third-party adapter authors

### 🏗️ Architecture

#### Monorepo Extraction
- Extracted HTTP/WebSocket adapters into standalone packages
- Created unified adapter package consolidating HTTP + WebSocket
- Moved Elysia integration to @mobtakronio/elysia

### 🐛 Bug Fixes
- Fixed stray closing braces in platform.ts and kernel-state.ts
- Added missing class getters/properties (manifests, actions, dependencies, cacheAdapter, interceptors, eventRegistry, actionCallStack, capsuleSources)
- Removed broken duplicate traceCall that shadowed working import
- Fixed file sink in createAsyncFileSink that silently dropped trace lines
- Added missing ValidationError import in platform.ts
- Added publishConfig.access: public to testing package

[0.4.0]: https://github.com/MobtakronIO/capskit/releases/tag/v0.4.0
