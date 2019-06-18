const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const SimpleGit = require('simple-git');

const git = SimpleGit(__dirname);
let cache;

const getDiff = (commit, old) =>
  new Promise((resolve, reject) => {
    git.diff(
      [ '--name-only', commit, old ],
      (error, changes) => {
        if (error) {
          reject(error)
        } else {
          if (typeof changes === 'string') {
            changes = changes.split('\n')
          }

          resolve(
            changes
              .filter(Boolean)
              .map(entry => path.resolve(__dirname, entry))
          );
        }
      }
    );
  });

const getYarnWorkspaces = () =>
  new Promise((resolve, reject) => {
    const buffer = [];

    const cmd = spawn(
      'yarn',
      [ 'workspaces', 'info' ],
      {
        cwd: __dirname,
      },
    );

    cmd.stdout.on('data', data => buffer.push(data.toString()));

    cmd.on('close', code => {
      if (code === 0) {
        buffer.shift(); // removes the "yarn workspaces vx.x.x"
        buffer.pop(); // removes the "✨  Done in x.xs."

        const ret = JSON.parse(buffer.join(''));
        const obj = {};

        Object.keys(ret).forEach(name => {
          const info = ret[name];

          obj[name] = path.resolve(__dirname, info.location);
        });

        resolve(obj);
      } else {
        reject(new Error('yarn workspaces failed'));
      }
    })
  });

const findWorkspace = (changePath, workspaces) =>
  Object
    .keys(workspaces)
    .find(workspaceName => changePath.indexOf(workspaces[workspaceName]) === 0);

(async () => {
  try {
    cache = fs.readFileSync(path.join(__dirname, 'cache.json'));
  } catch {}

  const lastCommit = cache && cache.commit ? cache.commit : 'HEAD^1';

  const diff = await getDiff('HEAD', lastCommit);
  const workspaces = await getYarnWorkspaces();

  diff.push('/Users/mitchellsimoens/Public/yarn-git-workspace/foo/blah.js');

  console.log('yarn workspaces:');
  console.log(JSON.stringify(workspaces, null, 2));
  console.log('Files changed in git range:');
  console.log(JSON.stringify(diff, null, 2));

  const workspaceChanges = {};

  diff.forEach(changePath => {
    const workspace = findWorkspace(changePath, workspaces);

    if (workspace) {
      workspaceChanges[workspace] = true;
    }
  });

  console.log('Workspaces that have changes:');
  console.log(JSON.stringify(workspaceChanges, null, 2));
})();
