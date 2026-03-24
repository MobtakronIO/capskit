# CapsKit Improvement Todo List

## Phase 1: Core Architecture Alignment

### 1.1 Manifest Enhancement
- [ ] Add `routes` array support to `CapsuleManifest` type
- [ ] Implement Zod schema validation in manifest routes
- [ ] Add `traits` property to route definitions
- [ ] Create route-to-action mapping in kernel

### 1.2 HTTP Adapter Improvements
- [ ] Implement automatic route generation from manifest `routes` array
- [ ] Add Zod validation middleware for request/response schemas
- [ ] Implement trait handlers (cache, rateLimit, auth)
- [ ] Support multiple HTTP frameworks (Express, Hono alongside Elysia)

### 1.3 Schema Validation System
- [ ] Create `SchemaRegistry` for storing validation schemas
- [ ] Implement runtime validation before action execution
- [ ] Add validation error formatting and standardization
- [ ] Support OpenAPI generation from Zod schemas

## Phase 2: Developer Experience

### 2.1 CLI Tool Development
- [ ] Create `capskit-cli` package
- [ ] Add `capskit new` for project scaffolding
- [ ] Add `capskit generate capsule <name>` for capsule templates
- [ ] Add `capskit docs` for OpenAPI generation
- [ ] Add `capskit test` for test utilities

### 2.2 Testing Infrastructure
- [ ] Create `@capskit/testing` package
- [ ] Add mock adapters for unit testing
- [ ] Create test utilities for action testing
- [ ] Add integration test helpers
- [ ] Create example test suites

### 2.3 Documentation
- [ ] Complete architecture documentation
- [ ] Create migration guides from popular frameworks
- [ ] Add API reference with examples
- [ ] Create troubleshooting guide
- [ ] Add performance benchmarking guide

## Phase 3: Production Features

### 3.1 Error Handling & Observability
- [ ] Standardize error types and codes
- [ ] Implement structured logging
- [ ] Add distributed tracing support
- [ ] Create metrics collection system
- [ ] Implement health check endpoints

### 3.2 State Management
- [ ] Document patterns for shared state
- [ ] Create caching adapter interface
- [ ] Implement session management patterns
- [ ] Add distributed lock support
- [ ] Create state persistence examples

### 3.3 Event System Enhancement
- [ ] Add guaranteed delivery mechanisms
- [ ] Implement retry policies
- [ ] Add dead letter queue support
- [ ] Create event sourcing patterns
- [ ] Add event schema validation

## Phase 4: Advanced Capabilities

### 4.1 Distributed Architecture
- [ ] Implement cross-network `platform.call()`
- [ ] Add service discovery integration
- [ ] Create load balancing strategies
- [ ] Implement circuit breaker pattern
- [ ] Add distributed tracing across services

### 4.2 Security Features
- [ ] Implement comprehensive authentication/authorization
- [ ] Add rate limiting at platform level
- [ ] Create input sanitization utilities
- [ ] Implement security headers
- [ ] Add audit logging system

### 4.3 Performance Optimization
- [ ] Benchmark and optimize proxy overhead
- [ ] Implement action result caching
- [ ] Add connection pooling for dependencies
- [ ] Create performance monitoring
- [ ] Implement lazy loading for capsules

## Phase 5: Ecosystem & Community

### 5.1 Plugin System
- [ ] Create plugin architecture for extensions
- [ ] Develop official plugins (database, email, etc.)
- [ ] Create third-party plugin guidelines
- [ ] Implement plugin discovery and loading

### 5.2 Integration Examples
- [ ] Create example with popular databases
- [ ] Add authentication service example
- [ ] Create e-commerce platform example
- [ ] Add real-time chat example
- [ ] Create microservices deployment example

### 5.3 Community Building
- [ ] Create contribution guidelines
- [ ] Set up issue templates
- [ ] Create RFC process for major changes
- [ ] Establish code of conduct
- [ ] Set up community channels

## Immediate Next Steps (Week 1-2)

### Priority 1: Manifest Routes Implementation
1. Update `CapsuleManifest` type to include `routes?: RouteDefinition[]`
2. Create `RouteDefinition` interface with `method`, `path`, `action`, `schema`, `traits`
3. Modify HTTP adapter to read routes from manifest instead of hardcoded mapping
4. Add Zod validation middleware

### Priority 2: CLI Tool MVP
1. Set up `capskit-cli` package structure
2. Implement `capskit new` with basic template
3. Add `capskit generate capsule` with manifest/actions scaffolding
4. Create `capskit docs` for OpenAPI generation

### Priority 3: Testing Utilities
1. Create `@capskit/testing` package
2. Add mock platform for unit testing
3. Create test helpers for action testing
4. Add integration test examples

## Success Criteria

### Short-term (1 month)
- [ ] Routes from manifests working with validation
- [ ] Basic CLI tool available
- [ ] Comprehensive test coverage
- [ ] Complete documentation for core features

### Medium-term (3 months)
- [ ] Trait system implemented
- [ ] Multiple HTTP adapter support
- [ ] Production error handling
- [ ] Community plugins emerging

### Long-term (6 months)
- [ ] Distributed capabilities
- [ ] Enterprise features (audit, security)
- [ ] Performance optimizations
- [ ] Active community contributions

## Risk Mitigation

| Risk | Mitigation Strategy |
|------|---------------------|
| Adoption barrier | Excellent documentation, migration guides |
| Performance concerns | Benchmarking, optimization focus |
| Complexity growth | Keep core simple, extensible through plugins |
| Ecosystem fragmentation | Clear standards, official plugins |

## Dependencies & Prerequisites

### Required Skills
- TypeScript expertise
- Node.js runtime knowledge
- HTTP framework experience (Elysia, Express, Hono)
- Testing and CI/CD experience
- Documentation writing

### Tools Needed
- Node.js 18+
- TypeScript 5.0+
- Testing framework (Jest/Vitest)
- Documentation generator (Vitepress)
- CI/CD pipeline (GitHub Actions)

## Timeline Estimates

Note: Time estimates are omitted per user instructions. Focus on logical sequencing and dependencies.

### Logical Sequence
1. Core architecture alignment (prerequisite for everything)
2. Developer experience improvements (enables community growth)
3. Production features (enables real-world usage)
4. Advanced capabilities (differentiation and scaling)
5. Ecosystem building (long-term sustainability

## Conclusion

This todo list provides a structured approach to bridging the gap between CapsKit's architectural vision and its current implementation. By following this phased approach, the project can evolve from a promising prototype to a production-ready framework while maintaining its innovative capability-centric design.