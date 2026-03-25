import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../db/data-source';
import { PromptTemplate } from '../entities/PromptTemplate.entity';
import type { PromptSection } from '../entities/PromptTemplate.entity';
import { AppError } from '../lib/errors';

const router = Router();

const SectionUpdateSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  content: z.string().optional(),
});

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
        sections: template.sections,
        updated_at: template.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/workflow/prompt-template — updates system_instructions, output_instructions, and/or sections
router.put(
  '/prompt-template',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { system_instructions, output_instructions, sections } = req.body as {
        system_instructions?: string;
        output_instructions?: string;
        sections?: unknown[];
      };

      if (
        system_instructions === undefined &&
        output_instructions === undefined &&
        sections === undefined
      ) {
        throw new AppError(
          'At least one of system_instructions, output_instructions, or sections is required',
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

      // Handle sections update
      if (sections !== undefined) {
        const parsed = z.array(SectionUpdateSchema).safeParse(sections);
        if (!parsed.success) {
          throw new AppError('Invalid sections format', 400, 'VALIDATION_ERROR');
        }

        const existingSections = template.sections ?? [];
        const updatedSections: PromptSection[] = existingSections.map((existing) => {
          const update = parsed.data.find((s) => s.key === existing.key);
          if (!update) return existing;

          return {
            ...existing,
            enabled: update.enabled,
            // Only allow content changes for editable sections
            content: existing.editable && update.content !== undefined
              ? update.content
              : existing.content,
          };
        });

        template.sections = updatedSections;

        // Sync legacy fields from editable sections
        const reviewSection = updatedSections.find((s) => s.key === 'review_instructions');
        if (reviewSection) {
          template.system_instructions = reviewSection.content;
        }
        const outputSection = updatedSections.find((s) => s.key === 'output_format');
        if (outputSection) {
          template.output_instructions = outputSection.content;
        }
      }

      await repo.save(template);

      res.json({
        id: template.id,
        name: template.name,
        system_instructions: template.system_instructions,
        output_instructions: template.output_instructions,
        sections: template.sections,
        updated_at: template.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as workflowRoutes };
