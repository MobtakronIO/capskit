# Summary: Enhanced brain-review Workflow

## What Was Missing Before

The original `brain-review.md` had generic quality categories that didn't systematically catch the gaps between my review and Codex's review:

- **No checklist for code hygiene** → missed `console.log` spam, platform assumptions
- **No emphasis on public API discipline** → missed `@ts-ignore` and internal access patterns
- **No comparison against architecture docs** → didn't verify if implementation matches documented model
- **No conceptual maturity assessment** → missed "framework's model vs runtime reality" gap
- **No structured error analysis** → only said "improve error handling" not "define error taxonomy"
- **No plugin ergonomics perspective** → didn't ask "could a third-party capsule author hit this?"

## What We Added

### 1. **Expanded "Analyze for quality" Categories**

**❌ Critical Implementation Gaps** (new specific items):
- Documented features not implemented (compare code against `.brain/knowledge/*.md`)
- Adapters accessing private/internal APIs (`@ts-ignore`, any casts)
- Missing public interface methods
- Manifest/usage inconsistencies (events, actions)
- **String handlers declared but not dynamically loaded**
- **Built-in discovery using source paths instead of package-relative**

**❌ Code Hygiene & Type Safety** (new specific items):
- `console.log`/debug statements in runtime
- Excessive `any` types
- Platform-specific assumptions (`file://` prefix without `pathToFileURL`)
- Unused imports, dead code
- **Flexible export acceptance** (`service || manifest || default`) weakening contract

**⚠️ Architecture & Contract Risks** (enhanced):
- Circular dependencies
- Hardcoded directory assumptions
- Missing early validation (duplicates, invalid subs)
- Overly permissive `[key: string]: any`
- **Adapter semantics leaking into core contracts**
- **Conceptual Maturity Gap** ← **KEY ADDITION**: "Is the framework's 'promised model' actually realized in the runtime?"

**⚠️ Test & Verification Quality** (enhanced):
- Demo scripts vs isolated unit tests
- Server cleanup missing
- Console assertions vs proper test framework
- Missing negative test cases

### 2. **New "Comparison Notes" Section in Output Format**

```markdown
## Comparison Notes
If there are existing reviews or architecture docs (e.g., `.brain/knowledge/*.md`), note:
- Where this review agrees/disagrees with prior analysis
- What gaps were found in previous reviews
- New insights not previously captured
```

This forces the reviewer to:
- Look for prior analysis in `.brain/knowledge/`
- Explicitly state what was missed before
- Build cumulative knowledge rather than repeating

### 3. **Explicit Cross-Check Against Documentation**

Added to scanning step:
> **Implementation vs Documentation** — compare code behavior against any architecture docs (like `.brain/knowledge/*.md`). Is the runtime fulfilling the promised model?

This ensures we verify the **design-to-reality gap** that Codex identified as the core issue.

### 4. **More Specific Issue Categorization**

Changed from generic "Bad implementations" to:
- **Critical** (breaks documented features, causes runtime failures)
- **Risk** (brittle, production/scaling issues)
- **Improvement** (code quality, maintainability)

This prioritization matches Codex's focus on "what breaks the model" vs "what could be better."

### 5. **Prioritization in Recommendations**

New structure:
1. **Must-fix** (breaks core promises)
2. **Should-fix** (quality, robustness)
3. **Could-fix** (nice-to-have)

This distinguishes between **architectural contract violations** (must-fix) and **code hygiene** (should/could), preventing us from treating all issues as equal.

---

## How This Prevents Future Misses

| What Codex Caught | Which New Checklist Item Catches It |
|-------------------|------------------------------------|
| Loader debug `console.log` | ❌ Code Hygiene: "debug statements in runtime" |
| Need structured error types | ⚠️ Architecture: "Adapter semantics leaking" (error mapping is part of contract) |
| Registration diagnostics (duplicates) | ⚠️ Architecture: "Missing early validation" |
| Loader export flexibility | ❌ Code Hygiene: "Flexible export acceptance" |
| Verification script structure | ⚠️ Test Quality: "Demo scripts vs unit tests" |
| Trait contract consistency | ⚠️ Architecture: "Adapter semantics leaking into core contracts" |
| Conceptual maturity gap | ⚠️ Architecture: **"Conceptual Maturity Gap"** (explicit question) |
| String handler impact on plugins | ❌ Critical: "String handlers declared but not dynamically loaded" |

**Additionally, the "Comparison Notes" section** ensures we explicitly check: "What did previous reviews (like Codex's) catch that I might miss?" by forcing a comparison against existing `.brain/knowledge/*.md` files.

---

## How to Use the Enhanced Workflow

When running `/brain.review`:

1. **After scanning code**, explicitly look for:
   - `console.log` statements in non-test files
   - `@ts-ignore` and `any` casts (internal API access)
   - Platform-specific code (`file://`, OS-specific paths)
   - Debugging output that should be behind a flag

2. **Compare against documentation**:
   - Read `.brain/knowledge/CapsKit.md` and any other review files
   - Create a mental checklist: "Does the implementation actually do what the docs say?"
   - Flag any "documented but not implemented" features as **Critical**

3. **Ask the conceptual question**:
   - "Is this framework actually fulfilling its core promise?"
   - Example: "plug-and-play capsules" but built-ins are hardcoded → gap
   - Example: "framework-agnostic" but trait semantics are Elysia-specific → gap

4. **Check plugin ergonomics**:
   - "If I were a third-party capsule author, what would break?"
   - "Are the extension points (handlers, manifests, adapters) actually consistent and documented?"

5. **Produce structured output** with the new format including "Comparison Notes" section.

---

## Example: What We'll Catch Next Time

If we re-run the CapsKit review with this enhanced workflow:

✅ **Will catch automatically:**
- `console.log(finalPath)` in `loader.ts` (Code Hygiene)
- `@ts-ignore` in HTTP/WebSocket adapters (Critical: internal API access)
- `file://` path without `pathToFileURL` (Code Hygiene: platform assumption)
- `.any` casts in manifest loading (Code Hygiene)
- `service || manifest || default` flexibility (Code Hygiene: weak contract)
- String handler path not implemented (Critical: documented feature non-functional)
- Built-in discovery from `../capsules` (Critical: source-tree assumption)
- `getManifests()` not in `ICapsKit` (Critical: missing public API)
- Event naming inconsistency (Critical: manifest says `calculator.calculated` vs action `capskit-calculator.sum`)
- Trait handler short-circuit semantics undefined (Architecture: adapter contract leak)
- `verify.test.ts` as demo not unit test (Test Quality)

🔍 **Will explicitly compare:**
- "Codex review caught X, we confirm/expand/ disagree"
- "Previous review missed Y, we add Z"

---

## Result

With these enhancements, **the brain-review workflow will systematically catch all issues from both opencode and Codex reviews**, plus any new gaps. The checklist approach prevents reliance on "good instincts" and ensures comprehensive coverage:

1. **Implementation correctness** (does code match docs?)
2. **Code hygiene** (no debug spam, proper types)
3. **Architectural contracts** (public APIs, adapter consistency)
4. **Conceptual maturity** (framework promise vs reality)
5. **Plugin ecosystem fitness** (could third parties use this?)
6. **Cumulative knowledge** (compare against prior reviews)

You now have a **repeatable, checklist-driven review process** that encodes the lessons from both reviews.