import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import SimpleGit from 'simple-git';

const cwd = process.cwd();
const git = SimpleGit(cwd);
let cache: Cache;

interface Cache {
  commit?: string;
}

interface Dependencies {
  [name: string]: string;
}

interface WorkspaceChanges {
  [name: string]: boolean;
}

interface Workspaces {
  [name: string]: string;
}

// so we don't have to have disable line comments everywhere
/* eslint-disable-next-line no-console */
const logOut = (...args: string[]): void => console.log(...args);

const getDiff = (commit: string, old: string): Promise<string[]> =>
  new Promise((resolve, reject): void => {
    git.diff(['--name-only', commit, old], (error: Error | void, rawChanges: string): void => {
      if (error) {
        reject(error);
      } else {
        const changes: string[] = typeof rawChanges === 'string' ? rawChanges.split('\n') : rawChanges;

        resolve(changes.filter(Boolean).map((entry: string): string => path.resolve(cwd, entry)));
      }
    });
  });

const doSpawn = (cmdCwd: string, command: string, ...args: string[]): Promise<string[]> =>
  new Promise((resolve, reject): void => {
    const buffer: string[] = [];

    const cmd = spawn(command, args, {
      cwd: cmdCwd,
    });

    cmd.stdout.on('data', (data: Buffer): number => buffer.push(data.toString()));

    cmd.on('close', (code: number): void => {
      if (code === 0) {
        resolve(buffer);
      } else {
        reject(new Error('command failed'));
      }
    });
  });

const getYarnWorkspaces = (): Promise<Workspaces> =>
  doSpawn(cwd, 'yarn', 'workspaces', 'info').then(
    (buffer: string[]): Workspaces => {
      buffer.shift(); // removes the "yarn workspaces vx.x.x"
      buffer.pop(); // removes the "✨  Done in x.xs."

      const ret = JSON.parse(buffer.join(''));
      const workspaces: Workspaces = {};

      Object.keys(ret).forEach((name: string): void => {
        const info = ret[name];

        workspaces[name] = path.resolve(cwd, info.location);
      });

      return workspaces;
    },
  );

const findWorkspace = (changePath: string, workspaces: Workspaces): string | void =>
  Object.keys(workspaces).find((workspaceName: string): boolean => changePath.indexOf(workspaces[workspaceName]) === 0);

const getDependedWorkspaces = (workspaceNames: string[], dependencies?: Dependencies): string[] => {
  if (dependencies) {
    return workspaceNames.reduce((array: string[], workspaceName: string): string[] => {
      if (dependencies[workspaceName]) {
        array.push(workspaceName);
      }

      return array;
    }, []);
  }

  return [];
};

const findWorkspaceDependencies = async (
  workspaceName: string,
  workspaceChanges: WorkspaceChanges,
  workspaces: Workspaces,
): Promise<void> => {
  const workspaceNames = Object.keys(workspaces);
  const packageJson = await import(path.resolve(workspaces[workspaceName], 'package.json'));
  const depended = [
    ...getDependedWorkspaces(workspaceNames, packageJson.dependencies),
    ...getDependedWorkspaces(workspaceNames, packageJson.devDependencies),
  ];

  // recursive
  depended.forEach((dependedName: string): void => {
    if (!workspaceChanges[dependedName]) {
      findWorkspaceDependencies(dependedName, workspaceChanges, workspaces);
    }
  });

  await Promise.all(
    depended.map(
      async (dependedName: string): Promise<void> => {
        if (!workspaceChanges[dependedName]) {
          await findWorkspaceDependencies(dependedName, workspaceChanges, workspaces);
        }
      },
    ),
  );

  depended.forEach((name: string): void => {
    /* eslint-disable-next-line no-param-reassign */
    workspaceChanges[name] = true;
  });
};

const findDependencies = (workspaceChanges: WorkspaceChanges, workspaces: Workspaces): Promise<(string | void)[]> =>
  Promise.all(
    Object.keys(workspaceChanges).map(
      (workspaceName: string): Promise<void> => findWorkspaceDependencies(workspaceName, workspaceChanges, workspaces),
    ),
  );

const run = async (args: string[]): Promise<void> => {
  try {
    cache = fs.readFileSync(path.join(cwd, 'cache.json')) as Cache;
  } catch {
    // it's ok, no cache is ok
  }

  const lastCommit = cache && cache.commit ? cache.commit : 'HEAD^1';
  const diff = await getDiff('HEAD', lastCommit);
  const workspaces = await getYarnWorkspaces();

  // a good way to test is to add a fake diff file:
  // diff.push(path.resolve(cwd, 'packages/frontend/blah.ts'));

  logOut('');
  logOut('yarn workspaces:');
  Object.keys(workspaces).forEach((name: string): void => logOut(`  ${name} => ${workspaces[name]}`));

  logOut('');
  logOut('Files changed in git range:');
  diff.forEach((file: string): void => logOut(`  ${file}`));

  const workspaceChanges: WorkspaceChanges = {};

  diff.forEach((changePath: string): void => {
    const workspace = findWorkspace(changePath, workspaces);

    if (workspace) {
      workspaceChanges[workspace] = true;
    }
  });

  await findDependencies(workspaceChanges, workspaces);

  const workspaceNames = Object.keys(workspaceChanges);

  logOut('');
  logOut('Workspaces and their dependencies that have changes:');
  logOut(workspaceNames.length ? `  ${workspaceNames.join(', ')}` : '  (none)');

  await Promise.all(
    Object.keys(workspaceChanges).map(
      (workspaceName: string): Promise<void> =>
        doSpawn(workspaces[workspaceName], args[0], ...args).then((buffer: string[]): void =>
          logOut(`$ ${args.join(' ')}\n${buffer.join('\n')}`),
        ),
    ),
  );
};

export default run;
