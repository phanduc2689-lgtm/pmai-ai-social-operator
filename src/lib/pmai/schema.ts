import { z } from "zod";

export const TaskTypeSchema = z.enum(["SAVE_LOCAL_DRAFT", "PUBLISH_CONTENT"]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskDslSchema = z.object({
  dslVersion: z.literal("2.1"),
  type: TaskTypeSchema,
  accountId: z.string().min(1),
  pageTargetId: z.string().min(1),
  payload: z.object({
    contentId: z.string().min(1),
    revisionHash: z.string().min(8),
    text: z.string().optional(),
    mediaIds: z.array(z.string()).optional(),
  }),
  approval: z.object({ required: z.boolean() }),
});
export type TaskDsl = z.infer<typeof TaskDslSchema>;

export const LlmProviderSchema = z.enum(["openai", "gemini", "anthropic", "xai", "mock"]);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const ForbiddenTaskTypeSchema = z.string().refine(
  (t) => !/mass_|bypass_|spoof_|evade_/i.test(t),
  "forbidden task type",
);

export function parseTaskDsl(input: unknown): TaskDsl {
  return TaskDslSchema.parse(input);
}
