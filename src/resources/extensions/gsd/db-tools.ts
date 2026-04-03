import { Type, Static } from "@sinclair/typebox";

export const VerificationEvidenceSchema = Type.Object({
  command: Type.String({ description: "The command that was executed." }),
  stdout: Type.String({ description: "The standard output from the command." }),
  stderr: Type.String({ description: "The standard error from the command." }),
  exitCode: Type.Union([Type.Number(), Type.String()], { 
    description: "Exit code of the command (number or numeric string)" 
  }),
  durationMs: Type.Union([Type.Number(), Type.String()], { 
    description: "Duration in milliseconds (number or numeric string)" 
  }),
});

export type VerificationEvidence = Static<typeof VerificationEvidenceSchema>;
