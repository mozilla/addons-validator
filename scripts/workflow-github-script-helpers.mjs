/**
 * This ES module exports helper functions used by the `firefox-schema-import`
 * Gihub Actions Workflow.
 */
import shell from 'shelljs';

const BASE_ISSUE_SUBJECT = 'Import Firefox API Schema from Firefox';
const BASE_COMMIT_MESSAGE = 'feat: Imported Firefox API Schema from Firefox';
const MAIN_BRANCH = 'master';

// Fail as soon as a shelljs command fails.
shell.config.fatal = true;

function runWithShellJSConfig({ fatal }, cb) {
  try {
    shell.config.fatal = fatal;
    return cb();
  } finally {
    shell.config.fatal = true;
  }
}

function hasPendingSchemaChanges(firefox_version_display) {
  shell.echo(
    `Check for changes from Importing Firefox ${firefox_version_display} API Schema...`
  );
  const gitStatus = shell.exec(`git status`, { silent: true });
  if (!gitStatus.stdout.trim().split('\n').length) {
    shell.echo('No changes to the schema data');
    return false;
  }
  return true;
}

async function hasRemoteBranchChanges({
  github,
  context,
  branch_name,
  firefox_version,
}) {
  shell.echo(
    `Check for existing remote changes in the branch ${branch_name}...`
  );

  const githubRemoteBranchResult = await github.rest.repos
    .getBranch({
      owner: context.repo.owner,
      repo: context.repo.repo,
      branch: branch_name,
    })
    .catch((err) => err);

  if (githubRemoteBranchResult.status === 404) {
    shell.echo(`No remote branch named ${branch_name} has been found`);
    return false;
  }

  if (githubRemoteBranchResult.status !== 200) {
    // Throw the octokit request error.
    throw githubRemoteBranchResult;
  }

  const commitMessage = githubRemoteBranchResult.data.commit.commit.message;
  shell.echo(
    `Found commit message from remote branch ${branch_name}:\n ${commitMessage}`
  );
  return commitMessage.startsWith(
    `${BASE_COMMIT_MESSAGE} ${firefox_version} (workflow `
  );
}

function runTests() {
  return runWithShellJSConfig({ fatal: false }, () => {
    shell.echo(`Execute repository build script ("npm run build")...`);
    let result = shell.exec('npm run build', { silent: true });
    if (result.code !== 0) {
      return {
        has_failures: true,
        stderr: result.stderr.trim(),
      };
    }
    shell.echo(`Execute repository tests ("npm run test-once")...`);
    result = shell.exec('npm run test-once', { silent: true });
    const has_failures = result.code !== 0;
    return {
      has_failures,
      stderr: has_failures ? result.stderr.trim() : undefined,
    };
  });
}

export async function getImportResultState({
  github,
  context,
  workflowInputs,
}) {
  const workflow_run_url = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}/`;
  const version_display_file_path = 'src/schema/imported/version_display.txt';
  const version_display = shell.cat(version_display_file_path).trim();
  const version = version_display.split('.')[0];
  const beta_build_number = version_display.split('b')[1];
  const nightly_build_number = version_display.split('a')[1];
  const branch_name = `feat/api-schema-import-fx${version}`;
  const current_date = new Date().toISOString().slice(0, 10);
  const has_pending_changes = hasPendingSchemaChanges(version_display);
  const has_remote_branch_changes = await hasRemoteBranchChanges({
    github,
    context,
    branch_name,
    firefox_version: version,
  });
  const tests = workflowInputs['run-tests'] ? runTests() : undefined;

  const resultState = {
    firefox_version: version,
    firefox_version_display: version_display,
    beta_build_number: beta_build_number
      ? parseInt(beta_build_number, 10)
      : undefined,
    nightly_build_number: nightly_build_number
      ? parseInt(nightly_build_number, 10)
      : undefined,
    branch_name,
    current_date,
    has_pending_changes,
    has_remote_branch_changes,
    tests,
    workflow_run_url,
  };

  shell.echo(
    `Firefox API Schema import result state: ${JSON.stringify(
      resultState,
      null,
      2
    )}`
  );
  return resultState;
}

export async function findExistingIssue({ github, context, firefox_version }) {
  const issues = await github.request('GET /repos/{owner}/{repo}/issues', {
    owner: context.repo.owner,
    repo: context.repo.repo,
    q: `${BASE_ISSUE_SUBJECT} ${firefox_version}`,
  });
  if (issues.data.length) {
    shell.echo(
      `Found existing issues: ${issues.data
        .map((issue) => {
          return `\n\t#${issue.number} - ${issue.title} (created by ${issue.user.login})`;
        })
        .join('\n')}`
    );
    return issues.data[0];
  }
  return null;
}

export async function createIssue({ github, context, importState }) {
  const { firefox_version, workflow_run_url } = importState;

  const title = `${BASE_ISSUE_SUBJECT} ${firefox_version}`;
  const body = [
    `This issue is tracking importing Firefox API Schemas from Firefox ${firefox_version}.`,
    '',
    `Workflow run: ${workflow_run_url}`,
    '',
    'Automated Import Firefox API Schema workflow results:',
    '```',
    JSON.stringify(importState, null, 2),
    '```',
  ].join('\n');
  const issue = await github.rest.issues.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    title,
    body,
  });
  return issue.data;
}

export async function findExistingPull({ github, context, branch_name }) {
  const pulls = await github.rest.pulls.list({
    owner: context.repo.owner,
    repo: context.repo.repo,
    head: branch_name,
  });
  if (pulls.status !== 200 || pulls.data.length > 1) {
    console.error('findExistingPull got unexpected result', pulls);
    throw new Error('findExistingPull got unexpected result');
  }
  return pulls.data[0];
}

export async function createPull({ github, context, importState, issue }) {
  const {
    firefox_version,
    firefox_version_display,
    beta_build_number,
    has_remote_branch_changes,
    branch_name,
  } = importState;
  if (!beta_build_number) {
    shell.echo(
      'No pull request created. Import not related to a mozilla-central beta branch'
    );
    return null;
  }
  if (has_remote_branch_changes) {
    shell.echo(
      `No pull request created. Found changes applied to the remote ${branch_name}`
    );
    return null;
  }

  // Force push until the import is running on a beta build number >= 8.
  if (beta_build_number < 8) {
    shell.exec(`git push origin ${branch_name} -f`);
  } else {
    shell.exec(`git push origin ${branch_name}`);
  }

  const title = `feat: Import Firefox API Schema for ${firefox_version}`;
  const body = [
    `This pull request is importing Firefox API Schemas for Firefox ${firefox_version} (${firefox_version_display}).`,
    '',
    'TODO: create a summary of the bugzilla issues related to the imported changes',
    '',
    `Fixes #${issue.number}`,
  ].join('\n');

  const pull = await github.rest.pulls.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    head: importState.branch_name,
    base: MAIN_BRANCH,
    title,
    body,
  });
  return pull.data;
}

export function createBranchAndCommit({
  branch_name,
  firefox_version,
  current_date,
}) {
  shell.echo(`Create new commit in branch ${branch_name}`);
  shell.exec('git config user.email "$GITHUB_ACTOR@users.noreply.github.com"');
  shell.exec('git config user.name "$GITHUB_ACTOR"');
  shell.exec('git add src/schema/imported');
  shell.exec(`git checkout -b ${branch_name}`);
  const automatedCommitMarker = `(workflow $GITHUB_JOB ${current_date})`;
  shell.exec(
    `git commit -m "${BASE_COMMIT_MESSAGE} ${firefox_version} ${automatedCommitMarker}"`
  );
  const commitDiff = shell.exec('git log -p -r HEAD^..HEAD');
  return commitDiff.stdout.trim();
}
