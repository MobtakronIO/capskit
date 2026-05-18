import type { CapsuleManifest, CapHandler, CapInput, CapContext } from '@mobtakronio/capskit';

/**
 * A simplified manifest format for testing that uses action handlers directly.
 * This is converted to a runtime CapsuleManifest internally.
 */
export interface TestCapsuleManifest {
  name: string;
  dependencies?: string[];
  description?: string;
  actions: Record<string, {
    handler: CapHandler;
    pre?: Array<(input: CapInput, context: CapContext) => Promise<void> | void>;
    post?: Array<(input: CapInput, result: unknown, context: CapContext) => Promise<unknown> | unknown>;
  }>;
}

/**
 * Configuration for creating a test capsule
 */
export interface TestCapsuleConfig {
  /**
   * The capsule manifest to test
   */
  manifest: TestCapsuleManifest | TestCapsuleManifest[];
  
  /**
   * Optional initial dependencies for the test capsule
   */
  deps?: Record<string, unknown>;
  
  /**
   * Whether to skip booting the full runtime (default: true for testing)
   */
  skipBoot?: boolean;
}

/**
 * Result from executing an action in test mode
 */
export interface ActionResult {
  /**
   * The return value from the action handler
   */
  result: unknown;
  
  /**
   * Events that were emitted during action execution
   */
  events: EmittedEvent[];
}

/**
 * An event that was emitted during action execution
 */
export interface EmittedEvent {
  /**
   * The event name
   */
  name: string;
  
  /**
   * The event payload
   */
  data: unknown;
}

/**
 * A captured event with metadata
 */
export interface CapturedEvent {
  /**
   * Event name
   */
  name: string;
  
  /**
   * Event data
   */
  data: unknown;
  
  /**
   * Timestamp when the event was captured (if available)
   */
  timestamp?: number;
}

/**
 * Options for mock dependencies
 */
export interface MockDepsOptions {
  /**
   * Whether to automatically spy on all method calls (default: true)
   */
  spyOnMethods?: boolean;
  
  /**
   * Custom implementations for specific deps
   */
  implementations?: Record<string, unknown>;
}

/**
 * A mock dependency with optional spy support
 */
export interface MockDep {
  /**
   * The mock value or object
   */
  value: unknown;
  
  /**
   * Whether this is a spy
   */
  isSpy: boolean;
}

/**
 * A spied method on a mock dependency
 */
export interface SpiedMethod {
  /**
   * The method name
   */
  name: string;
  
  /**
   * Whether the method was called
   */
  called: boolean;
  
  /**
   * Number of times the method was called
   */
  callCount: number;
  
  /**
   * Arguments from the last call
   */
  lastCall: unknown[] | undefined;
  
  /**
   * All calls made to the method
   */
  calls: unknown[][];
  
  /**
   * The original method wrapped with spy functionality
   */
  value: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Test harness returned by createTestCapsKit
 */
export interface TestCapsKitHarness {
  /**
   * Minimal CapsKit instance for testing
   */
  capskit: {
    /**
     * Call an action with the given payload
     */
    call: (actionName: string, payload: unknown) => Promise<ActionResult>;
    
    /**
     * Get captured events
     */
    getEvents: () => CapturedEvent[];
    
    /**
     * Clear captured events
     */
    clearEvents: () => void;
    
    /**
     * Get the manifest(s) being tested
     */
    getManifests: () => CapsuleManifest[];
  };
  
  /**
   * Mock dependency container
   */
  deps: Record<string, MockDep>;
  
  /**
   * Captured events
   */
  events: CapturedEvent[];
}
