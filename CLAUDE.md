# Nuqe — Claude Code Session Rules

## Start of every session

Read these four files before doing anything else:

```
spec/ARCHITECTURE.md
spec/test_registry.md
NUQE_CONTEXT.md
NUQE_TECHNICAL_DEBT.md
```

Report:
1. How many tests are currently passing
2. Current deployment state and any open HIGH priority gaps
3. Which component was last worked on
4. What the next action should be

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

### 5. `NUQE_CONTEXT.md`
- Update "Stage" and current system state if anything changed
- Update deployment URLs or demo credentials if they changed
- Update the Demo Flow if new features were added or steps changed
- Update the "What works" / "What doesn't" summary if applicable

### 6. `NUQE_TECHNICAL_DEBT.md`
- Add a row to Open Gaps for any new known issue, shortcut, or deferred decision introduced this session
- Move rows from Open Gaps to Resolved for any gap closed this session
- Add a changelog entry at the bottom

---

## When any of these also apply, update them too

| Condition | File to update |
|-----------|---------------|
| New environment variable added | `.env.example` |
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

| Purpose | File | Update frequency |
|---------|------|-----------------|
| Master spec + component index | `spec/ARCHITECTURE.md` | Every session |
| Every test result | `spec/test_registry.md` | Every session |
| Phase and session tracking | `NUQE_BUILD_PLAN.md` | Every session |
| 19 component specs | `spec/components/[01-19]_*.md` | Every session (touched component) |
| Living product state + demo flow | `NUQE_CONTEXT.md` | Every session |
| Open gaps and tech debt | `NUQE_TECHNICAL_DEBT.md` | Every session |
| Root architecture (external-facing) | `ARCHITECTURE.md` | When spec changes |
| Environment variable reference | `.env.example` | When new vars added |
