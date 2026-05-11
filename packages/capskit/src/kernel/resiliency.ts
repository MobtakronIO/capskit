/**
 * Resiliency management for CapsKit kernel.
 * Provides fallback and circuit breaker functionality.
 */

import { ResiliencyConfig, CircuitBreakerState } from '../types';

/**
 * Validates the fallback chain configuration for an action.
 */
export function validateFallbackChain(config?: ResiliencyConfig): void {
  if (!config) return;

  if (config.fallback) {
    const { type, action, maxRetries, retryDelayMs } = config.fallback;

    if (type === 'action' && !action) {
      throw new Error('Fallback type "action" requires an action name');
    }

    if (type === 'retry') {
      if (maxRetries !== undefined && maxRetries < 1) {
        throw new Error('maxRetries must be >= 1');
      }
      if (retryDelayMs !== undefined && retryDelayMs < 0) {
        throw new Error('retryDelayMs must be >= 0');
      }
    }
  }

  if (config.circuitBreaker) {
    const { failureThreshold, resetTimeoutMs, successThreshold } = config.circuitBreaker;
    if (failureThreshold !== undefined && failureThreshold < 1) {
      throw new Error('failureThreshold must be >= 1');
    }
    if (resetTimeoutMs !== undefined && resetTimeoutMs < 0) {
      throw new Error('resetTimeoutMs must be >= 0');
    }
    if (successThreshold !== undefined && successThreshold < 1) {
      throw new Error('successThreshold must be >= 1');
    }
  }
}

/**
 * Manages circuit breaker state per action.
 */
export class ResiliencyManager {
  private circuits: Map<string, CircuitBreakerState> = new Map();

  /**
   * Get or create circuit breaker state for an action.
   */
  getCircuit(actionName: string): CircuitBreakerState {
    if (!this.circuits.has(actionName)) {
      this.circuits.set(actionName, {
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        nextResetTime: null,
        status: 'closed',
      });
    }
    return this.circuits.get(actionName)!;
  }

  /**
   * Record a failure for the given action.
   */
  recordFailure(actionName: string, config?: ResiliencyConfig): void {
    const circuit = this.getCircuit(actionName);
    const threshold = config?.circuitBreaker?.failureThreshold ?? 3;

    circuit.consecutiveFailures++;
    circuit.consecutiveSuccesses = 0;
    circuit.lastFailureTime = Date.now();

    if (circuit.consecutiveFailures >= threshold) {
      circuit.status = 'open';
      circuit.nextResetTime = Date.now() + (config?.circuitBreaker?.resetTimeoutMs ?? 30000);
    }
  }

  /**
   * Record a success for the given action.
   */
  recordSuccess(actionName: string, config?: ResiliencyConfig): void {
    const circuit = this.getCircuit(actionName);
    const threshold = config?.circuitBreaker?.successThreshold ?? 1;

    circuit.consecutiveSuccesses++;
    circuit.consecutiveFailures = 0;
    circuit.lastSuccessTime = Date.now();

    if (circuit.status === 'half-open' && circuit.consecutiveSuccesses >= threshold) {
      circuit.status = 'closed';
      circuit.nextResetTime = null;
    }
  }

  /**
   * Check if the circuit is open (should fail fast).
   */
  isOpen(actionName: string): boolean {
    const circuit = this.circuits.get(actionName);
    if (!circuit) return false;

    // Check if circuit should transition from open to half-open
    if (circuit.status === 'open' && circuit.nextResetTime && Date.now() >= circuit.nextResetTime) {
      circuit.status = 'half-open';
      circuit.consecutiveSuccesses = 0;
      return false;
    }

    return circuit.status === 'open';
  }

  /**
   * Reset circuit breaker state for an action.
   */
  reset(actionName: string): void {
    this.circuits.delete(actionName);
  }

  /**
   * Shutdown the resiliency manager, clearing all state.
   */
  shutdown(): void {
    this.circuits.clear();
  }
}
