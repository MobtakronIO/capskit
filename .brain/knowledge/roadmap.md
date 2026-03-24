# CapsKit Roadmap & Improvement Plan

This document consolidates the architectural feedback, current gaps, and the phased development plan for CapsKit.

## 1. Architectural Vision
CapsKit implements the **Capability Architecture** pattern, decoupling business logic from transport layers through plug-and-play capsules.

### Key Strengths to Preserve:
- **Framework Agnosticism**: Logic remains pure and swappable.
- **Declarative Manifests**: Configuration separated from execution.
- **Unified Communication**: Seamless inter-capsule calls and events.
- **Modularity**: Independent "lego block" capsules.

---

## 2. Current Implementation Gaps
Based on architectural reviews, the following gaps are high priority:

- **Schema Validation**: Need standardized Zod integration in the pipeline (not just adapters).
- **Error Handling**: Standardize error types and implement retry/fallback logic.
- **Observability**: Add structured logging, metrics, and tracing to the kernel.
- **Developer Experience**: Missing CLI tooling for scaffolding and documentation generation.
- **Resilience**: Add timeouts, circuit breakers, and dead-letter queues to the event bus.

---

## 3. Phased Development Plan

### Phase 1: Core Architecture Alignment (Current)
- [x] **New Startup Pattern**: Implemented `createCapsKit` and Proxy Client (`.use()`).
- [x] **Dynamic Handler Loading**: Implemented `pathToFileURL` based imports.
- [ ] **Manifest Enhancement**: Full support for `routes` and `traits` in the kernel registry.
- [ ] **Standardized Schema Validation**: Integrate Zod parsing directly into `platform.call()`.

### Phase 2: Developer Experience (DX)
- [ ] **CLI Tool (`capskit-cli`)**: Scaffolding for new projects and capsules.
- [ ] **Testing Infrastructure**: Create `@capskit/testing` with mock platform and action helpers.
- [ ] **Interactive Playground**: A development UI to test actions and see manifests.

### Phase 3: Production Features
- [ ] **Observability**: Native support for performance metrics and OpenTelemetry.
- [ ] **Standardized Error System**: Standardized error classes (Validation, Auth, NotFound, etc.).
- [ ] **State Management Patterns**: Documented patterns for Redis/Database integration with clean DI.

### Phase 4: Advanced Capabilities
- [ ] **Distributed Kernel**: Support for `platform.call()` across network boundaries.
- [ ] **Hot Reloading**: Ability to reload capsules without restarting the process.
- [ ] **Event Sourcing Support**: Patterns for building event-sourced capsules.

---

## 4. History and Context
For detailed historical reviews, see the [.brain/knowledge/history/](file:///c:/Users/abdalla.a/apps/capskit/.brain/knowledge/history) directory.
- `CapsKit-review.md`: Early architectural review.
- `capsule-architecture-analysis.md`: Deep dive into capability patterns.
