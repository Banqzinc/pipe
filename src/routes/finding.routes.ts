import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../db/data-source';
import { Finding } from '../entities/Finding.entity';
import { FindingStatus } from '../entities/enums';
import { AppError } from '../lib/errors';

const router = Router();

// --- Zod schemas ---

const UpdateFindingSchema = z.object({
  status: z.enum(['accepted', 'rejected', 'edited', 'pending']),
  edited_body: z.string().optional(),
});

const BulkActionSchema = z.object({
  action: z.enum(['accept', 'reject']),
  filter: z
    .object({
      severity: z.union([z.string(), z.array(z.string())]),
    })
    .optional(),
  ids: z.array(z.string()).optional(),
});

// --- Routes ---

// GET /api/runs/:runId/findings — List findings for a run
router.get(
  '/runs/:runId/findings',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { runId } = req.params;
      const { severity, status, file_path } = req.query as {
        severity?: string;
        status?: string;
        file_path?: string;
      };

      const findingRepo = AppDataSource.getRepository(Finding);

      // Build filtered query
      const qb = findingRepo
        .createQueryBuilder('finding')
        .where('finding.run_id = :runId', { runId })
        .orderBy('finding.toolkit_order', 'ASC');

      if (severity) {
        const severities = severity.split(',').map((s) => s.trim());
        qb.andWhere('finding.severity IN (:...severities)', { severities });
      }

      if (status) {
        const statuses = status.split(',').map((s) => s.trim());
        qb.andWhere('finding.status IN (:...statuses)', { statuses });
      }

      if (file_path) {
        qb.andWhere('finding.file_path LIKE :file_path', {
          file_path: `%${file_path}%`,
        });
      }

      const findings = await qb.leftJoinAndSelect('finding.pullRequest', 'pr').getMany();

      // Get unfiltered counts for the run
      const allFindings = await findingRepo
        .createQueryBuilder('f')
        .select('f.status', 'status')
        .where('f.run_id = :runId', { runId })
        .getRawMany<{ status: FindingStatus }>();

      const counts = {
        total: allFindings.length,
        pending: allFindings.filter((f) => f.status === FindingStatus.Pending).length,
        accepted: allFindings.filter((f) => f.status === FindingStatus.Accepted).length,
        rejected: allFindings.filter((f) => f.status === FindingStatus.Rejected).length,
        edited: allFindings.filter((f) => f.status === FindingStatus.Edited).length,
        posted: allFindings.filter((f) => f.status === FindingStatus.Posted).length,
      };

      res.json({
        findings: findings.map((f) => ({
          id: f.id,
          file_path: f.file_path,
          start_line: f.start_line,
          end_line: f.end_line,
          severity: f.severity,
          confidence: f.confidence,
          category: f.category,
          title: f.title,
          body: f.body,
          suggested_fix: f.suggested_fix,
          rule_ref: f.rule_ref,
          status: f.status,
          edited_body: f.edited_body,
          toolkit_order: f.toolkit_order,
          pr_id: f.pr_id,
          pr_number: f.pullRequest?.github_pr_number ?? null,
        })),
        counts,
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/findings/:id — Update a finding's status
router.patch(
  '/findings/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const parsed = UpdateFindingSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid request body', 400, 'VALIDATION_ERROR');
      }

      const { status, edited_body } = parsed.data;

      const findingRepo = AppDataSource.getRepository(Finding);
      const finding = await findingRepo
        .createQueryBuilder('finding')
        .where('finding.id = :id', { id })
        .getOne();

      if (!finding) {
        throw new AppError('Finding not found', 404, 'NOT_FOUND');
      }

      if (finding.status === FindingStatus.Posted) {
        res.status(400).json({ error: 'Cannot modify a posted finding' });
        return;
      }

      if (status === 'edited' && !edited_body) {
        res.status(400).json({ error: 'edited_body is required when status is edited' });
        return;
      }

      finding.status = status as FindingStatus;
      if (status === 'edited' && edited_body !== undefined) {
        finding.edited_body = edited_body;
      }

      await findingRepo.save(finding);

      res.json({
        id: finding.id,
        file_path: finding.file_path,
        start_line: finding.start_line,
        end_line: finding.end_line,
        severity: finding.severity,
        confidence: finding.confidence,
        category: finding.category,
        title: finding.title,
        body: finding.body,
        suggested_fix: finding.suggested_fix,
        rule_ref: finding.rule_ref,
        status: finding.status,
        edited_body: finding.edited_body,
        toolkit_order: finding.toolkit_order,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/runs/:runId/findings/bulk — Bulk action
router.post(
  '/runs/:runId/findings/bulk',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { runId } = req.params;

      const parsed = BulkActionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid request body', 400, 'VALIDATION_ERROR');
      }

      const { action, filter, ids } = parsed.data;

      // Must provide either filter or ids, not both, not neither
      if (!filter && !ids) {
        res.status(400).json({ error: 'Must provide either filter or ids' });
        return;
      }
      if (filter && ids) {
        res.status(400).json({ error: 'Cannot provide both filter and ids' });
        return;
      }

      const newStatus = action === 'accept' ? FindingStatus.Accepted : FindingStatus.Rejected;

      const findingRepo = AppDataSource.getRepository(Finding);
      const qb = findingRepo
        .createQueryBuilder()
        .update(Finding)
        .set({ status: newStatus })
        .where('run_id = :runId', { runId })
        .andWhere('status != :posted', { posted: FindingStatus.Posted });

      if (filter) {
        const severities = Array.isArray(filter.severity)
          ? filter.severity
          : [filter.severity];
        qb.andWhere('severity IN (:...severities)', { severities });
      }

      if (ids && ids.length > 0) {
        qb.andWhere('id IN (:...ids)', { ids });
      } else if (ids && ids.length === 0) {
        // Empty IDs array — nothing to update
        res.json({ updated: 0 });
        return;
      }

      const result = await qb.execute();

      res.json({ updated: result.affected ?? 0 });
    } catch (err) {
      next(err);
    }
  },
);

export { router as findingRoutes };
