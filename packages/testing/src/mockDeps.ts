import type { MockDep, MockDepsOptions, SpiedMethod } from './types';

/**
 * Creates multiple mock deps from an object
 */
export function createMockDepsFromObject(deps: Record<string, unknown>, createMockDepFn: (name: string, value: unknown) => MockDep): Record<string, MockDep> {
  const result: Record<string, MockDep> = {};
  
  for (const [name, value] of Object.entries(deps)) {
    result[name] = createMockDepFn(name, value);
  }
  
  return result;
}

/**
 * Gets a simple object representation of all deps (for passing to action context)
 */
export function getDepsObject(deps: Record<string, MockDep>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [name, dep] of Object.entries(deps)) {
    result[name] = dep.value;
  }
  
  return result;
}

/**
 * Creates a mock dependency container with optional spy support
 * 
 * @param options - Configuration options for the mock deps
 * @returns A factory function to create mock deps
 * 
 * @example
 * ```typescript
 * const { createMockDep, spyOnDep } = createMockDeps();
 * 
 * const db = createMockDep('database', {
 *   query: async () => ({ rows: [] }),
 *   transaction: async () => {}
 * });
 * 
 * // Use spyOnDep to wrap a method with spy
 * const spiedQuery = spyOnDep(db, 'query');
 * 
 * // Later, check if the method was called
 * console.log(spiedQuery.called); // false
 * await db.query('SELECT * FROM users');
 * console.log(spiedQuery.called); // true
 * console.log(spiedQuery.callCount); // 1
 * ```
 */
export function createMockDeps(options: MockDepsOptions = {}) {
  const { spyOnMethods = true } = options;
  
  /**
   * Creates a mock dependency with optional spy support
   */
  function createMockDep(_name: string, value: unknown): MockDep {
    if (spyOnMethods && typeof value === 'object' && value !== null) {
      // Create a proxy that spies on method calls
      const methods = new Map<string, SpiedMethod>();
      
      // Create a proxy that exposes _spyMethods for spyOnDep
      const proxy = new Proxy(value as Record<string, unknown>, {
        get(target, prop) {
          if (typeof prop === 'symbol') {
            if (prop === Symbol.toStringTag) {
              return target[String(prop)];
            }
            return target[String(prop)];
          }
          
          // Expose internal methods map for spyOnDep
          if (prop === '_spyMethods') {
            return methods;
          }
          
          const methodName = String(prop);
          
          // Check if this is a method we're tracking
          if (methods.has(methodName)) {
            return methods.get(methodName)!.value;
          }
          
          const original = target[methodName];
          
          if (typeof original === 'function') {
            // Create a spy wrapper for this method
            const spy: SpiedMethod = {
              name: methodName,
              called: false,
              callCount: 0,
              lastCall: undefined,
              calls: [],
              value: async function(this: unknown, ...args: unknown[]) {
                spy.called = true;
                spy.callCount++;
                spy.lastCall = args;
                spy.calls.push(args);
                return original.apply(this, args);
              }
            };
            
            methods.set(methodName, spy);
            return spy.value;
          }
          
          return original;
        }
      }) as unknown as MockDep['value'] & { _spyMethods?: Map<string, SpiedMethod> };
      
      return { value: proxy as MockDep['value'], isSpy: spyOnMethods };
    }
    
    return { value, isSpy: false };
  }
  
  /**
   * Wraps an existing mock dep's method with spy capabilities.
   * For use with deps created via createMockDep with spyOnMethods enabled.
   */
  function spyOnDep(dep: MockDep, methodName: string): SpiedMethod {
    if (!dep.isSpy) {
      throw new Error(`Cannot spy on dep: it was not created with spyOnMethods enabled`);
    }
    
    const proxy = dep.value;
    const proxyAny = proxy as unknown as {
      _spyMethods?: Map<string, SpiedMethod>;
    };
    
    // If the proxy has a _spyMethods map, we can add to it directly
    if (proxyAny._spyMethods) {
      const methods = proxyAny._spyMethods;
      
      // Get the original method from the target
      const original = (proxy as Record<string, unknown>)[methodName] as (...args: unknown[]) => unknown;
      
      if (typeof original !== 'function') {
        throw new Error(`Cannot spy on '${methodName}': it is not a function`);
      }
      
      // Create a new spy for this specific method
      const spy: SpiedMethod = {
        name: methodName,
        called: false,
        callCount: 0,
        lastCall: undefined,
        calls: [],
        value: async function(this: unknown, ...args: unknown[]) {
          spy.called = true;
          spy.callCount++;
          spy.lastCall = args;
          spy.calls.push(args);
          return original.apply(this, args);
        }
      };
      
      methods.set(methodName, spy);
      return spy;
    }
    
    // Fallback: try to modify directly if not using proxy pattern
    const obj = dep.value as Record<string, unknown>;
    const method = obj[methodName];
    
    if (typeof method !== 'function') {
      throw new Error(`Cannot spy on '${methodName}': it is not a function`);
    }
    
    // Create a new spy for this specific method
    const spy: SpiedMethod = {
      name: methodName,
      called: false,
      callCount: 0,
      lastCall: undefined,
      calls: [],
      value: async function(this: unknown, ...args: unknown[]) {
        spy.called = true;
        spy.callCount++;
        spy.lastCall = args;
        spy.calls.push(args);
        return (method as (...args: unknown[]) => unknown).apply(this, args);
      }
    };
    
    // Replace the method with a wrapped version
    obj[methodName] = spy.value;
    
    return spy;
  }
  
  return {
    createMockDep,
    spyOnDep,
    createMockDepsFromObject: (deps: Record<string, unknown>) => createMockDepsFromObject(deps, createMockDep),
    getDepsObject
  };
}

/**
 * Creates a simple mock function that records calls
 * 
 * @example
 * ```typescript
 * const mockFn = createMockFn<(a: number, b: string) => Promise<void>>();
 * mockFn(1, 'hello');
 * mockFn(2, 'world');
 * console.log(mockFn.calls); // [[1, 'hello'], [2, 'world']]
 * console.log(mockFn.callCount); // 2
 * ```
 */
export function createMockFn() {
  const calls: unknown[][] = [];
  
  const instance = {
    calls,
    callCount: 0,
    lastCall: undefined as unknown[] | undefined,
    called: false,
    async apply(_this: unknown, args: unknown[]): Promise<void> {
      instance.calls.push(args);
      instance.callCount++;
      instance.lastCall = args;
      instance.called = true;
    }
  };
  
  const proxy = new Proxy(instance.apply.bind(instance), {
    apply(_target, _thisArg, args) {
      return instance.apply(undefined, args);
    },
    get(_target, prop) {
      if (prop === 'calls') return instance.calls;
      if (prop === 'callCount') return instance.callCount;
      if (prop === 'lastCall') return instance.lastCall;
      if (prop === 'called') return instance.called;
      return undefined;
    }
  }) as (() => Promise<void>) & typeof instance;
  
  return proxy;
}
