'use strict';

// Fixed, non-overridable bound for recursive AST walkers (GHSA-vfj7-8cjw-p6xm).
exports.assertDepth = depth => {
  if (depth >= 128) throw new SyntaxError('Brace pattern nesting exceeds the supported depth (128)');
};
