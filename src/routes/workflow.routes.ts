import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../db/data-source';
import { PromptTemplate } from '../entities/PromptTemplate.entity';
import { AppError } from '../lib/errors';

const router = Router();

// GET /api/workflow/prompt-template — returns the active template
router.get(
  '/prompt-template',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = AppDataSource.getRepository(PromptTemplate);
      const template = await repo.findOneBy({ name: 'default' });

      if (!template) {
        throw new AppError('Default prompt template not found', 404, 'NOT_FOUND');
      }

      res.json({
        id: template.id,
        name: template.name,
        system_instructions: template.system_instructions,
        output_instructions: template.output_instructions,
        updated_at: template.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/workflow/prompt-template — updates system_instructions and/or output_instructions
router.put(
  '/prompt-template',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { system_instructions, output_instructions } = req.body as {
        system_instructions?: string;
        output_instructions?: string;
      };

      if (system_instructions === undefined && output_instructions === undefined) {
        throw new AppError(
          'At least one of system_instructions or output_instructions is required',
          400,
          'VALIDATION_ERROR',
        );
      }

      const repo = AppDataSource.getRepository(PromptTemplate);
      const template = await repo.findOneBy({ name: 'default' });

      if (!template) {
        throw new AppError('Default prompt template not found', 404, 'NOT_FOUND');
      }

      if (system_instructions !== undefined) {
        template.system_instructions = system_instructions;
      }
      if (output_instructions !== undefined) {
        template.output_instructions = output_instructions;
      }

      await repo.save(template);

      res.json({
        id: template.id,
        name: template.name,
        system_instructions: template.system_instructions,
        output_instructions: template.output_instructions,
        updated_at: template.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as workflowRoutes };
