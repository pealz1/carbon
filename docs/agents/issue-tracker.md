# GitHub Issues

Keep specs, implementation tickets, and triage in this repository's [GitHub Issues](https://github.com/pealz1/carbon/issues).

Use `gh issue` with `--repo pealz1/carbon` to create, read, edit, comment on, and close tickets. Pass multiline descriptions and comments with `--body-file`. Use the [triage labels](triage-labels.md) for issue state.

## Relationships

Make implementation tickets sub-issues of their spec. Record blockers with GitHub's native issue dependencies. A ticket becomes available when its blockers have closed.

For `gh` versions without sub-issue and blocking flags, use `gh api`. Obtain the related issue's database ID with `gh api repos/pealz1/carbon/issues/NUMBER --jq .id`. Add a child by posting its ID as `sub_issue_id` to `repos/pealz1/carbon/issues/PARENT/sub_issues`. Add a blocker by posting its ID as `issue_id` to `repos/pealz1/carbon/issues/CHILD/dependencies/blocked_by`.

If the tracker cannot store a relationship, put `Part of #PARENT` or `Blocked by: #BLOCKER` at the top of the ticket.

## Pull requests as a triage surface

PRs as a request surface: no.

## Wayfinding

Use one issue labeled `wayfinder:map` for a map. Give each child ticket its own type label, one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`. The next ticket is the first open, unassigned child in map order with no open blocker. Claim it by assigning yourself. When it is resolved, record the outcome on the ticket, close it, and link the result from the map.
