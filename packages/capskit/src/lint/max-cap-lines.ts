import type { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce 200 line maximum on .cap.ts files' },
    messages: { exceeded: 'Cap file "{{file}}" exceeds 200 lines ({{lines}} lines). Extract logic to .rule.ts, .helper.ts, or .repository.ts.' },
  },
  create(context) {
    const filename = context.filename;
    if (!filename.endsWith('.cap.ts')) return {};

    const source = context.sourceCode;
    const lines = source.getText().split('\n').length;
    if (lines > 200) {
      context.report({
        node: source.ast,
        messageId: 'exceeded',
        data: { file: filename, lines: String(lines) },
      });
    }
    return {};
  },
};

export default rule;
