import { z } from "zod";
import { topicCategories } from "./learning-catalog";

export const learningTopicSchema = z.object({
  id: z.string().min(1).max(500),
  title: z.string().trim().min(1).max(240),
  category: z.enum(topicCategories),
  sourceId: z.number().int().positive().optional(),
  sourceUrl: z
    .string()
    .max(2048)
    .regex(/^https:\/\/en\.wikipedia\.org\/wiki\/[^\s]+$/)
    .optional(),
});
export const learningPathSchema = z.object({
  id: z.uuid(),
  rootId: z.uuid(),
  topic: learningTopicSchema,
  createdAt: z.iso.datetime(),
  learnedAt: z.iso.datetime().optional(),
  concepts: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string().trim().min(1).max(240),
        learned: z.boolean(),
        learnedAt: z.iso.datetime().optional(),
      }),
    )
    .max(10000),
});
export const learningSettingsSchema = z.object({
  learningPaths: z.array(learningPathSchema).max(10000).optional(),
  learningTopics: z.array(learningTopicSchema).max(10000).optional(),
  activeLearningPath: z.uuid().optional(),
});
