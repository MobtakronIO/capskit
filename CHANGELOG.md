# Changelog

## [0.1.0] - 2026-05-16

### 🚀 New Features

#### Client SDK (@mobtakronio/capskit-client)
- `createCapsKitClient()` factory with three transport modes: `http`, `websocket`, `auto`
- `client.call<T>(actionPath, payload?)` — typed action invocation
- `client.use<T>(capsuleName)` — typed capsule proxy with IDE autocomplete
- `client.emit(event, data)` — publish events to server
- `client.tell(actionPath, payload)` — fire-and-forget dispatch
- `client.describe()` — fetch server manifest
- `client.subscribe(pattern, handler)` — real-time event subscriptions (WebSocket)
- `client.loadManifest()` — cache manifest for proxy autocomplete
- `client.disconnect()` — close connections and clear subscriptions

#### Offline-First Support
- `OfflineQueue` class with IndexedDB persistence and memory fallback
- Auto-queuing of `call()` and `emit()` when browser goes offline
- Auto-flush on `online` event
- `getQueueStatus()`, `flushQueue()`, `clearQueue()` management APIs
- Configurable max queue size with oldest-entry eviction

#### Interceptor Pipeline
- `buildInterceptorPipeline()` — core pipeline builder
- `ClientInterceptor` interface with `before`/`after` hooks
- `loggingInterceptor` — call logging with duration
- `authInterceptor({ getToken })` — auth token injection
- `errorNormalizationInterceptor` — normalize raw errors to CapsKitClientError
- `retryInterceptor({ maxRetries, backoff, retryOn })` — configurable retry with backoff
- Short-circuit support (before hooks can set result to skip the call)

#### Type Generator CLI
- `npx capskit generate --url <url> --output <file>`
- Generates capsule interfaces, event types, call/use overloads
- JSON Schema to TypeScript type conversion
- JSDoc descriptions from schema `description` fields
- `TypedCapsKitClient` combined type

#### React Integration (@mobtakronio/capskit-react)
- `CapsKitProvider` — context provider for client
- `useCapsKit()` — access client from context
- `useAction<T>(path, payload?, options?)` — execute actions with loading/error state
- `useSubscription<T>(pattern, options?)` — real-time event subscriptions
- `useCapsule<T>(name)` — memoized typed capsule proxy

#### Vue Integration (@mobtakronio/capskit-vue)
- `provideCapsKit(client)` — provide client at app/component level
- `injectCapsKit()` — access client from injection context
- `useAction<T>(path, payload?, options?)` — reactive action execution with refs
- `useSubscription<T>(pattern, options?)` — reactive event subscriptions
- `useCapsule<T>(name)` — computed typed capsule proxy

#### WebSocket Protocol
- JSON frame format: `{ command, id, payload }`
- Commands: `call`, `emit`, `tell`, `subscribe`, `unsubscribe`, `describe`
- Server-pushed event frames
- Ping/pong keepalive
- Automatic reconnection with exponential backoff
- Subscription restoration after reconnect

#### Client Error Types
- `CapsKitClientError` — base error class
- `ActionNotFoundError` — action does not exist
- `ActionExecutionError` — action execution failed
- `ValidationError` — input validation failed
- `NetworkError` — network connectivity issue
- `AuthError` — authentication failure
- `OfflineError` — offline queue operation
- `SubscriptionError` — subscription not supported (HTTP-only mode)

### 📖 Documentation
- Client SDK guide with full API reference
- Interceptor documentation with built-in and custom examples
- Offline support guide with queue management
- React integration guide with hooks and examples
- Vue integration guide with composables and examples
- Type generator CLI documentation
- WebSocket protocol specification
- Updated quick-start with client-side section
- Updated index.md with client feature cards
- Updated README.md with client ecosystem overview

[0.1.0]: https://github.com/MobtakronIO/capskit/releases/tag/v0.1.0

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
