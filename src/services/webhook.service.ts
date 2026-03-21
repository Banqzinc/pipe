import { AppDataSource } from '../db/data-source';
import { Repo } from '../entities/Repo.entity';
import { PullRequest } from '../entities/PullRequest.entity';
import { PrStatus } from '../entities/enums';
import { SyncService } from './sync.service';
import { logger } from '../lib/logger';

export class WebhookService {
  async handleEvent(event: string, payload: any): Promise<void> {
    switch (event) {
      case 'pull_request':
        await this.handlePullRequest(payload);
        break;
      default:
        logger.debug({ event }, 'Ignoring unhandled webhook event');
    }
  }

  private async handlePullRequest(payload: any): Promise<void> {
    const action: string = payload.action;
    const ghPr = payload.pull_request;
    const repoPayload = payload.repository;

    if (!ghPr || !repoPayload) {
      logger.warn('Missing pull_request or repository in webhook payload');
      return;
    }

    const repoRepo = AppDataSource.getRepository(Repo);
    const prRepo = AppDataSource.getRepository(PullRequest);

    // Find repo by github_owner + github_name from payload
    const ownerLogin: string =
      repoPayload.owner?.login ?? repoPayload.owner?.name ?? '';
    const repoName: string = repoPayload.name;

    const repo = await repoRepo.findOneBy({
      github_owner: ownerLogin,
      github_name: repoName,
    });

    if (!repo) {
      logger.warn(
        { owner: ownerLogin, name: repoName },
        'Webhook received for unknown repo',
      );
      return;
    }

    switch (action) {
      case 'opened':
      case 'synchronize':
      case 'reopened': {
        const linearTicket = SyncService.extractLinearTicket(
          ghPr.head.ref,
          ghPr.body,
        );

        await prRepo.upsert(
          {
            repo_id: repo.id,
            github_pr_number: ghPr.number,
            title: ghPr.title,
            author: ghPr.user.login,
            branch_name: ghPr.head.ref,
            base_branch: ghPr.base.ref,
            head_sha: ghPr.head.sha,
            status: PrStatus.Open,
            linear_ticket_id: linearTicket,
          },
          {
            conflictPaths: ['repo_id', 'github_pr_number'],
          },
        );

        logger.info(
          {
            action,
            repo: `${ownerLogin}/${repoName}`,
            pr: ghPr.number,
          },
          'PR upserted via webhook',
        );

        if (action === 'opened' && repo.auto_trigger_on_open) {
          logger.info(
            {
              repo: `${ownerLogin}/${repoName}`,
              pr: ghPr.number,
            },
            'Would trigger review (auto_trigger_on_open enabled)',
          );
        }
        break;
      }

      case 'closed': {
        const status = ghPr.merged ? PrStatus.Merged : PrStatus.Closed;

        await prRepo.update(
          { repo_id: repo.id, github_pr_number: ghPr.number },
          { status },
        );

        logger.info(
          {
            action,
            status,
            repo: `${ownerLogin}/${repoName}`,
            pr: ghPr.number,
          },
          'PR closed via webhook',
        );
        break;
      }

      default:
        logger.debug(
          { action, pr: ghPr.number },
          'Ignoring unhandled PR action',
        );
    }
  }
}
