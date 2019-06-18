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

const doSpawn = (cwd, ...args) => new Promise((resolve, reject) => {
  const buffer = [];

  const cmd = spawn(
    args.shift(),
    args,
    {
      cwd,
    },
  );

  cmd.stdout.on('data', data => buffer.push(data.toString()));

  cmd.on('close', code => {
    if (code === 0) {
      resolve(buffer);
    } else {
      reject(new Error('command failed'));
    }
  })
});

const getYarnWorkspaces = () => doSpawn(__dirname, 'yarn', 'workspaces', 'info')
  .then(buffer => {
    buffer.shift(); // removes the "yarn workspaces vx.x.x"
    buffer.pop(); // removes the "✨  Done in x.xs."

    const ret = JSON.parse(buffer.join(''));
    const workspaces = {};

    Object.keys(ret).forEach(name => {
      const info = ret[name];
      const dir = path.resolve(__dirname, info.location);

      workspaces[name] = path.resolve(__dirname, info.location);
    });

    return workspaces;
  });

const findWorkspace = (changePath, workspaces) =>
  Object
    .keys(workspaces)
    .find(workspaceName => changePath.indexOf(workspaces[workspaceName]) === 0);

const getDependedWorkspaces = (workspaceNames, dependencies) => workspaceNames.reduce((array, workspaceName) => {
  if (dependencies[workspaceName]) {
    array.push(workspaceName);
  }

  return array;
}, []);

const findDependencies = (workspaceChanges, workspaces) => {
  const workspaceNames = Object.keys(workspaces);

  Object.keys(workspaceChanges).map(workspaceName => {
    const packageJson = require(path.resolve(workspaces[workspaceName], 'package.json'));
    const depended = [
      ...getDependedWorkspaces(workspaceNames, packageJson.dependencies),
      ...getDependedWorkspaces(workspaceNames, packageJson.devDependencies),
    ];

    // TODO do this deep

    depended.forEach(name => workspaceChanges[name] = true);
  });
};

const run = async (args) => {
  try {
    cache = fs.readFileSync(path.join(__dirname, 'cache.json'));
  } catch {}

  const lastCommit = cache && cache.commit ? cache.commit : 'HEAD^1';
  const diff = await getDiff('HEAD', lastCommit);
  const workspaces = await getYarnWorkspaces();

  diff.push(path.resolve(__dirname, 'packages/frontend/blah.js'));

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

  findDependencies(workspaceChanges, workspaces);

  console.log('Workspaces and their dependencies that have changes:');
  console.log(JSON.stringify(workspaceChanges, null, 2));

  await Promise.all(
    Object
      .keys(workspaceChanges)
      .map(workspaceName =>
        doSpawn(workspaces[workspaceName], ...args).then(buffer => console.log(`$ ${args.join(' ')}\n${buffer.join('\n')}`))
      )
  );
};

module.exports = run;
