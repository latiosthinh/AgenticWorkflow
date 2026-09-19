import { adoClient } from '../ado/client.js';
import { env } from '../config/env.js';
import { getWorkItemDetails, transitionToDevDone, transitionToReadyForQa } from '../ado/work-item.js';
import { createWorktree, cleanupWorktree } from '../sandbox/worktree.js';
import { createOrGetPullRequest } from '../ado/git.js';
import { slugify } from '../utils/paths.js';
import { Operation, type JsonPatchDocument, type JsonPatchOperation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import simpleGit from 'simple-git';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
Usage: npx tsx src/cli/ado.ts <command> [args]

Commands:
  board                         List all tickets on the board with Column, State, Title, Tags
  get <id>                      Get full ticket details (description, criteria, column)
  move <id> <columnName>        Move a ticket's Kanban board column
  comment <id> <message>        Post a discussion comment to a ticket
  worktree create <id>          Create an ephemeral worktree for the ticket
  worktree cleanup <id>         Clean up worktree for the ticket
  pr <id> [title]               Create an Azure Repos PR for ticket task branch
`);
    return;
  }

  const witApi = await adoClient.getWorkItemTrackingApi();

  if (command === 'board') {
    const query = `
      SELECT [System.Id], [System.Title], [System.State], [System.BoardColumn], [System.Tags]
      FROM WorkItems
      WHERE [System.TeamProject] = '${env.ADO_PROJECT}'
      ORDER BY [System.ChangedDate] DESC
    `;
    const result = await witApi.queryByWiql({ query });
    const items = result.workItems || [];
    const boardItems = [];

    for (const item of items) {
      if (!item.id) continue;
      const details = await getWorkItemDetails(item.id);
      boardItems.push({
        id: details.id,
        rev: details.rev,
        title: details.title,
        column: details.boardColumn || details.state,
        state: details.state,
        tags: details.tags ? details.tags.split(';').map(t => t.trim()).filter(Boolean) : [],
      });
    }

    console.log(JSON.stringify(boardItems, null, 2));
    return;
  }

  if (command === 'get') {
    const id = Number(args[1]);
    if (!id) throw new Error('Missing ticket id');
    const details = await getWorkItemDetails(id);
    console.log(JSON.stringify(details, null, 2));
    return;
  }

  if (command === 'move') {
    const id = Number(args[1]);
    const targetColumn = args[2];
    if (!id || !targetColumn) throw new Error('Usage: move <id> <columnName>');

    const details = await getWorkItemDetails(id);
    const patch: JsonPatchOperation[] = [];

    if (details.kanbanColumnKey) {
      patch.push({
        op: Operation.Add,
        path: `/fields/${details.kanbanColumnKey}`,
        value: targetColumn,
      });
    }

    // Also update State if matching standard column
    const colLower = targetColumn.toLowerCase();
    if (colLower === 'to do') {
      patch.push({ op: Operation.Replace, path: '/fields/System.State', value: 'To Do' });
    } else if (colLower === 'done') {
      patch.push({ op: Operation.Replace, path: '/fields/System.State', value: 'Done' });
    } else {
      patch.push({ op: Operation.Replace, path: '/fields/System.State', value: 'Doing' });
    }

    await adoClient.updateWorkItem(id, patch as unknown as JsonPatchDocument);
    console.log(`Moved ticket #${id} to column '${targetColumn}'`);
    return;
  }

  if (command === 'comment') {
    const id = Number(args[1]);
    const comment = args.slice(2).join(' ');
    if (!id || !comment) throw new Error('Usage: comment <id> <message>');

    const patch: JsonPatchDocument = [
      {
        op: Operation.Add,
        path: '/fields/System.History',
        value: `${comment}\n<!-- [automated-agent] -->`,
      },
    ];
    await adoClient.updateWorkItem(id, patch);
    console.log(`Posted comment to ticket #${id}`);
    return;
  }

  if (command === 'worktree') {
    const sub = args[1];
    const id = Number(args[2]);
    if (!id) throw new Error('Usage: worktree <create|cleanup> <id>');
    const details = await getWorkItemDetails(id);

    if (sub === 'create') {
      const res = await createWorktree(process.cwd(), id, details.title);
      console.log(JSON.stringify(res, null, 2));
      return;
    }

    if (sub === 'cleanup') {
      const slug = slugify(details.title);
      const wtPath = `./.worktrees/ticket-${id}-${slug}`;
      await cleanupWorktree(process.cwd(), wtPath);
      console.log(`Cleaned up worktree for ticket #${id}`);
      return;
    }
  }

  if (command === 'pr') {
    const id = Number(args[1]);
    if (!id) throw new Error('Usage: pr <id> [title]');
    const details = await getWorkItemDetails(id);
    const slug = slugify(details.title);
    const sourceBranch = `task/ticket-${id}-${slug}`;

    const pr = await createOrGetPullRequest({
      workItemId: id,
      title: args[2] || details.title,
      sourceBranch,
      description: `Resolves AB#${id}\n\nAutomated PR generated by Agentic Workflow.`,
      projectId: env.ADO_PROJECT,
      repositoryId: env.ADO_REPOSITORY_ID,
    });

    console.log(JSON.stringify({ pullRequestId: pr.pullRequestId, url: pr.url }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error('CLI error:', err?.message || err);
  process.exit(1);
});
