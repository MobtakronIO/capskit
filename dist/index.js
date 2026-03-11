// src/kernel/platform.ts
import * as path2 from "path";

// src/kernel/loader.ts
import * as fs from "fs";
import * as path from "path";
async function loadCapsules(capsulesDir) {
  const manifests = [];
  if (!fs.existsSync(capsulesDir)) {
    return manifests;
  }
  const entries = fs.readdirSync(capsulesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const manifestPath = path.join(capsulesDir, entry.name, "manifest.ts");
      const manifestJsPath = path.join(capsulesDir, entry.name, "manifest.js");
      let finalPath = "";
      if (fs.existsSync(manifestPath)) {
        finalPath = manifestPath;
      } else if (fs.existsSync(manifestJsPath)) {
        finalPath = manifestJsPath;
      }
      if (finalPath) {
        try {
          console.log(finalPath);
          const module = await import(`file://${finalPath}`);
          const manifest = module.service || module.manifest || module.default;
          if (manifest) {
            manifests.push(manifest);
          }
        } catch (error) {
          console.error(`Failed to load manifest at ${finalPath}:`, error);
        }
      }
    }
  }
  return manifests;
}

// src/kernel/platform.ts
var CapsKit = class {
  constructor(config) {
    this.config = config;
    this.dependencies = {
      ...config.dependencies,
      capskit: this
    };
  }
  actions = /* @__PURE__ */ new Map();
  manifests = /* @__PURE__ */ new Map();
  interceptors = [];
  eventRegistry = /* @__PURE__ */ new Map();
  dependencies = {};
  async start() {
    if (this.config.capsuleDirs) {
      for (const dir of this.config.capsuleDirs) {
        const absoluteDir = path2.resolve(dir);
        const manifests = await loadCapsules(absoluteDir);
        for (const manifest of manifests) {
          this.registerCapsule(manifest);
        }
      }
    }
  }
  registerCapsule(manifest) {
    this.validateDependencies(manifest);
    this.manifests.set(manifest.name, manifest);
    for (const [actionName, definition] of Object.entries(manifest.actions)) {
      const fullName = `${manifest.name}.${actionName}`;
      if (typeof definition.handler === "function") {
        this.actions.set(fullName, definition);
      } else {
      }
    }
    if (manifest.events?.subscribes) {
      for (const sub of manifest.events.subscribes) {
        const targetAction = `${manifest.name}.${sub.action}`;
        const existing = this.eventRegistry.get(sub.event) || [];
        existing.push(targetAction);
        this.eventRegistry.set(sub.event, existing);
      }
    }
  }
  validateDependencies(manifest) {
    if (manifest.requires) {
      for (const dep of manifest.requires) {
        if (!this.dependencies[dep]) {
          throw new Error(`Capsule "${manifest.name}" requires dependency "${dep}" which is not provided.`);
        }
      }
    }
  }
  addInterceptor(interceptor) {
    this.interceptors.push(interceptor);
  }
  async call(actionName, payload) {
    const actionDef = this.actions.get(actionName);
    if (!actionDef) {
      throw new Error(`Action "${actionName}" not found.`);
    }
    const handler = actionDef.handler;
    const context = {
      params: payload?.params,
      body: payload?.body,
      query: payload?.query,
      deps: this.dependencies,
      emit: this.emit.bind(this),
      call: this.call.bind(this),
      use: this.use.bind(this)
    };
    let index = -1;
    const dispatch = async (i) => {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      if (i === this.interceptors.length) {
        if (actionDef.pre) {
          for (const hook of actionDef.pre) {
            await hook(payload, context);
          }
        }
        let result = await handler(payload, context);
        if (actionDef.post) {
          for (const hook of actionDef.post) {
            const hookResult = await hook(payload, result, context);
            if (hookResult !== void 0) {
              result = hookResult;
            }
          }
        }
        return result;
      }
      const interceptor = this.interceptors[i];
      return interceptor(actionName, payload, context, () => dispatch(i + 1));
    };
    return dispatch(0);
  }
  use(capsuleName) {
    return new Proxy({}, {
      get: (_, actionName) => {
        return async (payload) => {
          const actionPath = `${capsuleName}.${String(actionName)}`;
          return this.call(actionPath, payload);
        };
      }
    });
  }
  describe(capsuleName) {
    return this.manifests.get(capsuleName);
  }
  emit(event, data) {
    console.log(`[Event Bus] Emitted: ${event}`);
    const subscribers = this.eventRegistry.get(event);
    if (subscribers) {
      for (const actionName of subscribers) {
        this.call(actionName, data).catch((err) => {
          console.error(`[Event Bus] Subscriber action ${actionName} failed handling event ${event}:`, err);
        });
      }
    }
  }
  // Helper for internal registry access (used by system capsule later)
  getManifests() {
    return Array.from(this.manifests.values());
  }
};
async function createCapsKit(config) {
  return new CapsKit(config);
}
export {
  CapsKit,
  createCapsKit,
  loadCapsules
};
//# sourceMappingURL=index.js.map