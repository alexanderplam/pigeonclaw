import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { app } from 'electron';

import { type Job, type ProjectSnapshot, buildCodexPrompt } from '@pigeonclaw/shared';

export async function runCodexJob(input: {
  job: Job;
  project: ProjectSnapshot;
  codexPath: string;
}) {
  await stat(input.project.repoPath);

  const runDir = join(app.getPath('userData'), 'runs', input.job.id);
  mkdirSync(runDir, { recursive: true });

  const logPath = join(runDir, 'codex-output.jsonl');
  const lastMessagePath = join(runDir, 'last-message.txt');
  const output = createWriteStream(logPath, { flags: 'a' });

  const prompt = buildCodexPrompt({
    basePrompt: input.project.basePrompt,
    eventPromptTemplate: input.project.eventPromptTemplate,
    event: input.job.payload,
    incidentId: input.job.incidentId,
    fingerprint: input.job.fingerprint,
    duplicateCount: input.job.duplicateCount,
    projectId: input.project.projectId,
    projectName: input.project.name,
    repoPath: input.project.repoPath,
    rules: input.project.localRules,
  });

  const args = [
    'exec',
    '--cd',
    input.project.repoPath,
    '--sandbox',
    input.project.sandboxMode,
    '--json',
    '--output-last-message',
    lastMessagePath,
    '-',
  ];

  if (input.project.codexModel) {
    args.splice(1, 0, '--model', input.project.codexModel);
  }

  return new Promise<{
    status: 'succeeded' | 'failed';
    summary: string;
    logPath: string;
    lastMessagePath?: string;
    exitCode: number;
  }>((resolve) => {
    const child = spawn(input.codexPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    child.stdin.write(prompt);
    child.stdin.end();

    child.stdout.on('data', (chunk) => {
      output.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      output.write(chunk);
    });

    child.on('error', (error) => {
      output.write(`\n${error.message}\n`);
      output.end();
      resolve({
        status: 'failed',
        summary: error.message,
        logPath,
        exitCode: 1,
      });
    });

    child.on('close', (code) => {
      output.end();
      const summary = existsSync(lastMessagePath)
        ? readFileSync(lastMessagePath, 'utf8').trim()
        : `Codex exited with code ${code ?? 1}`;

      resolve({
        status: code === 0 ? 'succeeded' : 'failed',
        summary,
        logPath,
        lastMessagePath: existsSync(lastMessagePath) ? lastMessagePath : undefined,
        exitCode: code ?? 1,
      });
    });
  });
}
