import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  nomeCompleto?: string,
  ipOrigem?: string
) {
  try {
    const safeEmail = email || `${uid}@auth.5playsports.local`;
    const safeName = nomeCompleto || safeEmail.split('@')[0] || 'Operador 5Play';

    const result = await db
      .insert(users)
      .values({
        uid,
        email: safeEmail,
        nomeCompleto: safeName,
        ultimoLoginEm: new Date(),
        ultimoIp: ipOrigem ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: safeEmail,
          ultimoLoginEm: new Date(),
          ultimoIp: ipOrigem ?? null,
          atualizadoEm: new Date(),
        },
      })
      .returning();

    if (result.length > 0) {
      return result[0];
    }

    const existing = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return existing[0];
  } catch (error) {
    console.error('Database user synchronization failed:', error);
    throw new Error('Falha ao sincronizar operador no banco de dados.', { cause: error });
  }
}
