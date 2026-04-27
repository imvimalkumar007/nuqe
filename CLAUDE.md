# Nuqe — Claude Code Session Rules

## Start of every session

Read these two files before doing anything else:

```
spec/ARCHITECTURE.md
spec/test_registry.md
```

Report:
1. How many tests are currently passing
2. Which component was last worked on
3. What the next action should be

Then wait for instruction.

---

## End of every session — mandatory before committing

These four updates are required at the end of every session without exception.
Do not commit code changes without completing all four.

### 1. `spec/test_registry.md`
- Update the totals block at the top (Total, PASS, FAIL, NOT RUN)
- Update the Status column for every test that was added, run, or changed this session
- Add new test rows if new tests were written

### 2. `spec/ARCHITECTURE.md`
- Update "Last updated" date
- Update the Test Registry Summary counts to match spec/test_registry.md
- Update the component index Status and "Tests passing" columns for any component touched this session

### 3. `NUQE_BUILD_PLAN.md`
- Tick all exit criteria checkboxes that were met this session
- Add one row to the Changelog table: `| date | what changed |`
- If a new phase or session was completed, update the Build Phases Overview table

### 4. `spec/components/[XX].md`
- For every component worked on: update the Status line at the top
- Update the test table (Status + Notes columns) for every test run or added
- If new endpoints or behaviour were added, document them in the spec body

---

## When any of these also apply, update them too

| Condition | File to update |
|-----------|---------------|
| New environment variable added | `.env.example` |
| Gap opened or closed | `NUQE_TECHNICAL_DEBT.md` |
| Deploy URL, credentials, or demo flow changed | `NUQE_CONTEXT.md` |
| Root architecture doc needs to mirror spec | `ARCHITECTURE.md` (root) |

---

## Working on a specific component

```
Read spec/components/[XX_component_name].md carefully.
Do not build anything yet.
First run the existing tests and report results.
Then fix failures.
Then build missing features from the spec.
Then write missing tests.
Then run all tests and confirm they pass.
Then do the four mandatory end-of-session updates.
Do not move to the next component until all tests pass.
```

---

## Commit message discipline

Every commit that touches a component must also stage and commit the four
mandatory doc files in the same commit. Never commit code without the docs.

---

## Key file locations

| Purpose | File |
|---------|------|
| Master spec + component index | `spec/ARCHITECTURE.md` |
| Every test result | `spec/test_registry.md` |
| 19 component specs | `spec/components/[01-19]_*.md` |
| Phase and session tracking | `NUQE_BUILD_PLAN.md` |
| Open gaps and tech debt | `NUQE_TECHNICAL_DEBT.md` |
| Deployment state and demo flow | `NUQE_CONTEXT.md` |
| Root architecture (external-facing) | `ARCHITECTURE.md` |
