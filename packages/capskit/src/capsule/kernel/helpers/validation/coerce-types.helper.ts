export function coerceTypes(
  payload: any,
  body: any,
  schema: Record<string, unknown> | undefined,
): void {
  if (!schema || !body || typeof body !== 'object') return;

  if (schema.type === 'object' && schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
      if (typeof propSchema !== 'object' || propSchema === null) continue;

      const expectedType = (propSchema as any).type;
      if (!expectedType) continue;

      if (key in body) {
        const val = body[key];
        let coerced = false;
        let newVal = val;

        if (typeof val === 'string') {
          if (expectedType === 'number' || expectedType === 'integer') {
            const num = Number(val);
            if (!Number.isNaN(num) && val.trim() !== '') {
              newVal = num;
              coerced = true;
            }
          } else if (expectedType === 'boolean') {
            if (val === 'true') {
              newVal = true;
              coerced = true;
            } else if (val === 'false') {
              newVal = false;
              coerced = true;
            }
          }
        }

        if (coerced) {
          body[key] = newVal;
          
          if (payload && typeof payload === 'object') {
            if ('body' in payload && payload.body && typeof payload.body === 'object' && key in payload.body) {
              payload.body[key] = newVal;
            }
            if ('query' in payload && payload.query && typeof payload.query === 'object' && key in payload.query) {
              payload.query[key] = newVal;
            }
            if ('params' in payload && payload.params && typeof payload.params === 'object' && key in payload.params) {
              payload.params[key] = newVal;
            }
            if (key in payload && !('body' in payload && 'query' in payload)) {
              payload[key] = newVal;
            }
          }
        } else if (typeof newVal === 'object' && newVal !== null) {
          let nextPayload = null;
          if (payload && typeof payload === 'object') {
            if ('body' in payload && payload.body && typeof payload.body === 'object' && key in payload.body) {
              nextPayload = payload.body[key];
            } else if (key in payload && !('body' in payload && 'query' in payload)) {
              nextPayload = payload[key];
            }
          }
          coerceTypes(nextPayload, newVal, propSchema as Record<string, unknown>);
        }
      }
    }
  } else if (schema.type === 'array' && schema.items && Array.isArray(body)) {
    const itemsSchema = schema.items as Record<string, unknown>;
    for (let i = 0; i < body.length; i++) {
      const val = body[i];
      const expectedType = itemsSchema.type;
      let coerced = false;
      let newVal = val;

      if (typeof val === 'string' && expectedType) {
        if (expectedType === 'number' || expectedType === 'integer') {
          const num = Number(val);
          if (!Number.isNaN(num) && val.trim() !== '') {
            newVal = num;
            coerced = true;
          }
        } else if (expectedType === 'boolean') {
          if (val === 'true') {
            newVal = true;
            coerced = true;
          } else if (val === 'false') {
            newVal = false;
            coerced = true;
          }
        }
      }

      if (coerced) {
        body[i] = newVal;
        if (Array.isArray(payload)) {
          payload[i] = newVal;
        }
      } else if (typeof newVal === 'object' && newVal !== null) {
        coerceTypes(Array.isArray(payload) ? payload[i] : null, newVal, itemsSchema);
      }
    }
  }
}
