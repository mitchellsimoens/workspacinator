yarn-workspace-git-diff-executor
===

**Experimental** this tool is experimental and is not expected to be published to npm yet.

This example is a start of a tool that can detect file changes in a yarn workspace between two git commit sha ranges.

The idea is you could run `this-tool yarn test` and it will execute whatever comes after `this-tool` (`yarn test` for this example) in any workspace that had a file changed.

This will also execute the command in the depended modules. The workspaces with file changes will be iterated over, looked at their `package.json`'s `dependencies` and `devDependencies` object to see if there are any other workspaces in those objects. If so, those will be added to the object of workspaces to execute the command in.

By default, it will check for changes between `HEAD^1` (so one commit behind `HEAD`) and `HEAD`. This will also look for a `cache.json` file where this is executed where you can save a commit to use instead of `HEAD^1`:

```json
{
  "commit": "some-commit-sha-here"
}
```
