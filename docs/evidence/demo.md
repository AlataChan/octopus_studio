# Reproducible demonstrations

Set the two active worktrees explicitly. Commands do not need either protected
repository and use temporary databases/directories.

```bash
STUDIO_WORKTREE="<absolute path to Octopus_studio-fde-native>"
FDE_WORKTREE="<absolute path to octopus_FDE-studio-native>"
test -d "$STUDIO_WORKTREE/server" && test -d "$FDE_WORKTREE/loom"
```

## Primary: cross-border e-commerce FAQ

The source fixture is
`octopus_FDE-studio-native/tests/fixtures/studio/v1/ecommerce-faq.ir.json`.
It compiles to `StudioWorkflowSpec 1.1` with source hash
`fc758a1945ee314ed3c5fcf7d666f03e6482301411ddf207792c24540fc4ce42`.

```bash
cd "$FDE_WORKTREE"
.venv/bin/loom ir compile tests/fixtures/studio/v1/ecommerce-faq.ir.json \
  --target studio --target-version 1 --out /tmp/ecommerce-faq.studio-v1.json

cd "$STUDIO_WORKTREE/server"
npx jest --runInBand __tests__/utils/fde/ecommerceFaqE2E.test.js

# Re-capture the allowlisted persisted audit rows without changing the checked-in sample.
FDE_ECOMMERCE_AUDIT_OUT=/tmp/ecommerce-audit-sample.json \
  npx jest --runInBand __tests__/utils/fde/ecommerceFaqE2E.test.js
node -e 'const a=require("/tmp/ecommerce-audit-sample.json"); if(a.run.status!=="succeeded") process.exit(1)'
```

The E2E deliberately proves two fail-closed preconditions, then succeeds:

1. publish with a missing binding returns `STUDIO_BINDING_MISSING`;
2. run before publication returns `STUDIO_RUN_PUBLISHED_REQUIRED`;
3. separate users author, review, and publish;
4. execution writes a structured model result under its attempt token;
5. the worker is killed with `SIGKILL` after a durable checkpoint;
6. a fresh process resumes to a JSON artifact and auditable terminal state.
