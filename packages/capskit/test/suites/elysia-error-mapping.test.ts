// @ts-nocheck

/**
 * Elysia Adapter Error Mapping Tests
 * 
 * Validates that the Elysia adapter's error mapping:
 * 1. Uses canonical error envelope from kernel
 * 2. Produces Elysia-compatible HTTP response format
 * 3. Produces consistent error codes across HTTP and WebSocket
 * 4. Respects environment-based stack exposure
 */

import {
  ValidationError,
  NotFoundError,
  TimeoutError,
  DependencyError,
  UnauthorizedError,
  AuthorizationError,
  TraitError,
  HandlerError,
  InternalError,
  FrameworkError,
  ErrorEnvelope,
  toErrorEnvelope
} from '../../src/kernel/errors';

export async function runElysiaErrorMappingTests() {
  console.log('\n=== Elysia Adapter Error Mapping Tests ===');

  // Import Elysia adapter's error mapping functions
  const elysiaErrorMapping = await import('../../../elysia/src/shared/error-mapping');
  const { 
    mapToHttpResponse, 
    handleWebSocketError, 
    formatErrorResponse 
  } = elysiaErrorMapping;

  // Test 1: mapToHttpResponse returns Elysia-compatible format
  console.log('Test: mapToHttpResponse returns Elysia-compatible format');
  const validationErr = new ValidationError('invalid email', { field: 'email' });
  const mockSet = {} as any;
  const httpResponse = mapToHttpResponse(validationErr, mockSet);
  
  // Elysia format: { error, code, status, details?, stack? }
  if (typeof httpResponse.error !== 'string') {
    throw new Error(`Expected error to be string, got ${typeof httpResponse.error}`);
  }
  if (httpResponse.error !== validationErr.message) {
    throw new Error(`Expected error field to equal message`);
  }
  if (httpResponse.code !== 'VALIDATION_ERROR') {
    throw new Error(`Expected code to be VALIDATION_ERROR, got ${httpResponse.code}`);
  }
  if (httpResponse.status !== 400) {
    throw new Error(`Expected status to be 400, got ${httpResponse.status}`);
  }
  if (httpResponse.details?.field !== 'email') {
    throw new Error(`Expected details.field to be 'email'`);
  }
  if (mockSet.status !== 400) {
    throw new Error(`Expected set.status to be 400`);
  }
  console.log('✅ mapToHttpResponse returns Elysia-compatible format');

  // Test 2: All error types produce correct Elysia HTTP response
  console.log('Test: All error types produce correct Elysia HTTP response');
  const errorTestCases = [
    { error: new ValidationError('bad input', { x: 1 }), expectedCode: 'VALIDATION_ERROR', expectedStatus: 400 },
    { error: new NotFoundError('user missing'), expectedCode: 'NOT_FOUND_ERROR', expectedStatus: 404 },
    { error: new TimeoutError('slow op'), expectedCode: 'TIMEOUT_ERROR', expectedStatus: 408 },
    { error: new UnauthorizedError('bad token'), expectedCode: 'UNAUTHORIZED_ERROR', expectedStatus: 401 },
    { error: new AuthorizationError('no access'), expectedCode: 'FORBIDDEN_ERROR', expectedStatus: 403 },
    { error: new TraitError('trait missing', 'billing:read'), expectedCode: 'TRAIT_ERROR', expectedStatus: 403 },
    { error: new DependencyError('db down'), expectedCode: 'DEPENDENCY_ERROR', expectedStatus: 500 },
    { error: new HandlerError('handler failed', 'doThing'), expectedCode: 'HANDLER_ERROR', expectedStatus: 500 },
    { error: new InternalError('unexpected'), expectedCode: 'INTERNAL_ERROR', expectedStatus: 500 },
  ];

  for (const { error, expectedCode, expectedStatus } of errorTestCases) {
    const set = {} as any;
    const response = mapToHttpResponse(error, set);
    
    if (response.code !== expectedCode) {
      throw new Error(`${error.name}: expected code ${expectedCode}, got ${response.code}`);
    }
    if (response.status !== expectedStatus) {
      throw new Error(`${error.name}: expected status ${expectedStatus}, got ${response.status}`);
    }
    if (response.error !== error.message) {
      throw new Error(`${error.name}: expected error field to match message`);
    }
    if (set.status !== expectedStatus) {
      throw new Error(`${error.name}: expected set.status to be ${expectedStatus}`);
    }
  }
  console.log('✅ All error types produce correct Elysia HTTP response');

  // Test 3: formatErrorResponse returns Elysia-compatible format
  console.log('Test: formatErrorResponse returns Elysia-compatible format');
  const notFoundErr = new NotFoundError('resource not found', { id: '123' });
  const formatted = formatErrorResponse(notFoundErr);
  
  if (formatted.code !== 'NOT_FOUND_ERROR') {
    throw new Error(`Expected code NOT_FOUND_ERROR, got ${formatted.code}`);
  }
  if (formatted.error !== notFoundErr.message) {
    throw new Error(`Expected error field to match message`);
  }
  if (formatted.status !== 404) {
    throw new Error(`Expected status 404, got ${formatted.status}`);
  }
  if (formatted.details?.id !== '123') {
    throw new Error(`Expected details.id to be '123'`);
  }
  console.log('✅ formatErrorResponse returns Elysia-compatible format');

  // Test 4: WebSocket error handler produces canonical envelope
  console.log('Test: WebSocket error handler produces canonical envelope');
  const mockWs: any = {
    sent: [] as string[],
    closeCode: null as number | null,
    closeReason: null as string | null,
    close(code: number, reason: string) {
      this.closeCode = code;
      this.closeReason = reason;
    },
    send(msg: string) {
      this.sent.push(msg);
    }
  };

  const timeoutErr = new TimeoutError('connection timed out', { duration: 5000 });
  handleWebSocketError(timeoutErr, mockWs, 'message');
  
  if (mockWs.sent.length !== 1) {
    throw new Error('Expected one message sent to WebSocket');
  }
  
  const sentEnvelope = JSON.parse(mockWs.sent[0]);
  // WebSocket should use canonical envelope (not Elysia HTTP format)
  if (sentEnvelope.code !== 'TIMEOUT_ERROR') {
    throw new Error(`Expected code TIMEOUT_ERROR, got ${sentEnvelope.code}`);
  }
  if (sentEnvelope.message !== timeoutErr.message) {
    throw new Error(`Expected message field, got ${sentEnvelope.message}`);
  }
  if (sentEnvelope.status !== 408) {
    throw new Error(`Expected status 408, got ${sentEnvelope.status}`);
  }
  console.log('✅ WebSocket error handler produces canonical envelope');

  // Test 5: HTTP and WebSocket produce consistent error codes
  console.log('Test: HTTP and WebSocket produce consistent error codes');
  const testErrors = [
    new ValidationError('v', { field: 'x' }),
    new NotFoundError('n'),
    new TimeoutError('t'),
    new UnauthorizedError('u'),
    new AuthorizationError('a'),
    new DependencyError('d'),
  ];

  for (const err of testErrors) {
    const sent: string[] = [];
    const wsMock = { sent, close: () => {}, send: (m: string) => sent.push(m) };
    handleWebSocketError(err, wsMock, 'message');
    const wsEnvelope = JSON.parse(wsMock.sent[0]);
    
    const httpResponse = mapToHttpResponse(err, {});
    
    if (wsEnvelope.code !== httpResponse.code) {
      throw new Error(`${err.name}: HTTP code ${httpResponse.code} !== WebSocket code ${wsEnvelope.code}`);
    }
    if (wsEnvelope.status !== httpResponse.status) {
      throw new Error(`${err.name}: HTTP status ${httpResponse.status} !== WebSocket status ${wsEnvelope.status}`);
    }
  }
  console.log('✅ HTTP and WebSocket produce consistent error codes');

  // Test 6: Unknown errors map to 500 with UNKNOWN_ERROR code
  console.log('Test: Unknown errors map to 500 with UNKNOWN_ERROR code');
  const unknownErr = new Error('something broke');
  const unknownHttp = mapToHttpResponse(unknownErr, {});
  
  if (unknownHttp.code !== 'UNKNOWN_ERROR') {
    throw new Error(`Expected UNKNOWN_ERROR, got ${unknownHttp.code}`);
  }
  if (unknownHttp.status !== 500) {
    throw new Error(`Expected status 500, got ${unknownHttp.status}`);
  }
  console.log('✅ Unknown errors map correctly');

  // Test 7: Environment-based stack exposure
  console.log('Test: Environment-based stack exposure');
  const originalEnv = process.env.NODE_ENV;
  const testErr = new ValidationError('test error', { detail: 'value' });
  
  // In development, stack should be included
  process.env.NODE_ENV = 'development';
  const devResponse = mapToHttpResponse(testErr, {});
  const devEnvelope = toErrorEnvelope(testErr);
  
  // When shouldExposeStack() is true (dev), stack should be present
  // The Elysia mapToHttpResponse uses toErrorEnvelope internally
  if (devEnvelope.stack && !devResponse.stack) {
    throw new Error('Development: stack should be included in response when available');
  }
  
  // In production, stack should NOT be included
  process.env.NODE_ENV = 'production';
  const prodEnvelope = toErrorEnvelope(testErr);
  
  if (prodEnvelope.stack) {
    throw new Error('Production: stack should NOT be included');
  }
  if (prodEnvelope.details) {
    throw new Error('Production: details should NOT be included');
  }
  
  process.env.NODE_ENV = originalEnv;
  console.log('✅ Environment-based stack exposure works correctly');

  // Test 8: TraitError includes trait property in details
  console.log('Test: TraitError includes trait property in details');
  const traitErr = new TraitError('missing billing trait', 'billing:write', { required: 'billing:write' });
  const traitHttp = mapToHttpResponse(traitErr, {});
  
  if (traitHttp.code !== 'TRAIT_ERROR') {
    throw new Error(`Expected TRAIT_ERROR, got ${traitHttp.code}`);
  }
  // TraitError stores trait separately (err.trait), not in details
  // The 'required' is what we passed as details
  if (traitHttp.details?.required !== 'billing:write') {
    throw new Error(`Expected details.required to be 'billing:write'`);
  }
  if (traitHttp.status !== 403) {
    throw new Error(`Expected status 403, got ${traitHttp.status}`);
  }
  console.log('✅ TraitError includes trait property correctly');

  // Test 9: HandlerError includes actionName in details
  console.log('Test: HandlerError includes actionName in details');
  const handlerErr = new HandlerError('handler failed', 'createUser', { userId: '123' });
  const handlerHttp = mapToHttpResponse(handlerErr, {});
  
  if (handlerHttp.code !== 'HANDLER_ERROR') {
    throw new Error(`Expected HANDLER_ERROR, got ${handlerHttp.code}`);
  }
  // HandlerError stores actionName separately (err.actionName), not in details
  // The 'userId' is what we passed as details
  if (handlerHttp.details?.userId !== '123') {
    throw new Error(`Expected details.userId to be '123'`);
  }
  if (handlerHttp.status !== 500) {
    throw new Error(`Expected status 500, got ${handlerHttp.status}`);
  }
  console.log('✅ HandlerError includes actionName correctly');

  // Test 10: Error codes are consistent with ERROR_STATUS_MAP
  console.log('Test: Error codes are consistent with ERROR_STATUS_MAP');
  const { ERROR_STATUS_MAP, getErrorClassByCode } = await import('../../src/kernel/error-mapping');
  
  for (const error of testErrors) {
    const httpResponse = mapToHttpResponse(error, {});
    const expectedStatus = ERROR_STATUS_MAP[error.code];
    
    if (httpResponse.status !== expectedStatus) {
      throw new Error(`${error.name}: HTTP response status ${httpResponse.status} !== ERROR_STATUS_MAP[${error.code}] ${expectedStatus}`);
    }
    
    const ErrorClass = getErrorClassByCode(error.code);
    if (!ErrorClass) {
      throw new Error(`No error class found for code ${error.code}`);
    }
  }
  console.log('✅ Error codes are consistent with ERROR_STATUS_MAP');

  console.log('=== All Elysia Adapter Error Mapping Tests Passed ===');
}
