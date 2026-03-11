# Introduction

**CapsKit** is a lightweight, strictly-opinionated runtime designed to enforce the "Capability Architecture" pattern for modern TypeScript microservices.

## The Problem

Traditional web frameworks tightly couple your business logic to HTTP constraints (Controllers, `req`/`res` objects, HTTP Status Codes). Over time, this makes it nearly impossible to execute your codebase logic via CRON jobs, CLI commands, Event Queues, or internal service calls without mocking HTTP requests.

## The Solution

CapsKit ditches the controller entirely in favor of a **Capsule Manifest**.

A Capsule is a plug-and-play collection of business capabilities (pure actions) that don't know anything about HTTP frameworks or WebSockets.

Instead, the **Platform Kernel** (CapsKit's core engine) loads these capsules, analyzes their `manifest.ts` metadata, and dynamically generates HTTP Routes, Event Listeners, and CLI commands for them!

### Key Design Principles

- **Zero Business Logic in Boundaries**: Modules do not expose network ports.
- **Traits as Metadata**: Rate-limiting, caching, and auth are declared purely in `manifest.ts`, injected smoothly by adapters.
- **Dependency Injection**: The Kernel injects configured dependencies (databases, external SDKs) cleanly.
