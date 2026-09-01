import fs from 'fs';
import path from 'path';
import { ParsedCommand } from '../whatsapp/types';

const LOG_PATH =
  process.env.UNKNOWN_COMMAND_LOG_PATH ?? path.join(__dirname, '../../logs/unknown-commands.log');

// Journalisation locale best-effort pour le debug en dev — la source de
// vérité consultée/téléchargée depuis le backoffice est la table Prisma
// UnknownCommandLog (voir handleUnknown), pas ce fichier.
export async function logUnknownCommandToFile(cmd: ParsedCommand): Promise<void> {
  try {
    const line =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        phoneNumber: cmd.userId,
        raw: cmd.raw,
        command: cmd.command,
        country: cmd.country,
      }) + '\n';

    await fs.promises.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.promises.appendFile(LOG_PATH, line, 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ event: 'unknown_command_file_log_failed', err: String(err) }));
  }
}
