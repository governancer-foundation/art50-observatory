// commitlint configuration — conventional-commits structure for the
// @governancer/art50-observatory public repo.
//
// Subject follows conventional-commits: `type(scope): subject`, e.g.
//   feat(locales): add Polish disclosure wording
//   fix(obligations): keep the deepfake branch under editorial control
//   docs(readme): state that the marking itself is the caller's job
//
// ESM module (package.json has "type": "module"), so `export default`.
//
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB

export default {
  extends: ['@commitlint/config-conventional'],
};
