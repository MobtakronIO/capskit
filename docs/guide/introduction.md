# Introduction

**CapsKit** is a lightweight, strictly-opinionated runtime kernel designed to enforce the "Capability Architecture" pattern for modern TypeScript applications. It is not merely a framework—it's an explicitly decoupled execution engine for your business logic.

## The Problem

Traditional architectures tightly couple your business constraints to the transport layer. When a system builds its logic inside HTTP Controllers relying heavily on Request/Response objects and HTTP Status Codes, the logic becomes trapped. Over time, making those same capabilities available to an internal CRON job, a CLI tool, a Kafka message queue, or even just another internal module becomes incredibly convoluted because the logic inherently expects an HTTP environment.

## The CapsKit Solution

CapsKit completely separates "what the system can do" from "how the system is told to do it." It ditches the controller entirely in favor of a declarative **Capsule Manifest**.

A **Capsule** is a plug-and-play collection of business capabilities (pure actions). An action takes a simple payload, uses injected dependencies, and returns a raw result. It is blissfully ignorant of HTTP, WebSockets, or background workers.

The **Platform Kernel** (CapsKit core) loads these capsules, analyzes their `manifest.ts` metadata, and orchestrates the entire application universe:
1. **Dynamic Adapters**: It enables adapters to automatically generate transport layers (like binding an Elysia HTTP router) based purely on the defined metadata.
2. **Event Routing**: It acts as a loosely-coupled Event Bus, dynamically wiring Publishers directly to asynchronous Subscribers.
3. **Execution Pipeline**: It wraps every capability inside a universal Onion-ring execution pipeline (Interceptors) ensuring platform constraints like tracing, transactions, or latency logging apply globally.

### Key Design Principles

- **Zero Boundary Logic**: Capsules do not expose network ports or import web frameworks.
- **Traits as Metadata**: Transport configurations (like Authorization or Rate Limiting) are defined as pure metadata `traits` inside `manifest.ts`. The transport adapters translate these into real middleware seamlessly.
- **Universal Uniformity**: Whether an action is called by a public API user, a fellow Capsule, or an automatic CRON job, the execution path and middleware lifecycle remain exactly the same inside the `platform.call()` Kernel execution engine.
