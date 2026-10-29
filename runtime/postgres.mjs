/** Own a single pooled client from BEGIN until COMMIT/ROLLBACK. Never collect SQL or rows. */
export async function traceTransaction(tracer, pool, callback) {
  return tracer.span('PostgreSQL transaction', async transaction => {
    let client, began = false, committing = false, settled = false, discard = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN'); began = true;
      const query = (operation, text, values = []) => tracer.span(`PostgreSQL ${['SELECT','INSERT','UPDATE','DELETE'].includes(operation) ? operation : 'OTHER'}`, async span => {
        try { const result = await client.query(text, values); span.setOutcome({ operation: 'succeeded', dataOrigin: 'remote' }); return result; }
        catch (error) { span.setOutcome({ operation: 'failed' }); throw error; }
      }, { kind: 'db.query' });
      const result = await callback({ query });
      committing = true;
      const commit = await client.query('COMMIT');
      if (commit.command === 'COMMIT') { settled = true; transaction.setOutcome({ transaction: 'committed', operation: 'succeeded', dataOrigin: 'remote' }); }
      else if (commit.command === 'ROLLBACK') {
        settled = true; transaction.setOutcome({ transaction: 'rolled-back', operation: 'failed' });
        throw new Error('Transaction was rolled back instead of committed');
      } else { discard = true; throw new Error('Transaction acknowledgement unknown'); }
      return result;
    } catch (error) {
      if (committing && !settled) { discard = true; transaction.setOutcome({ transaction: 'unknown' }); }
      else if (began && !settled) {
        try {
          const result = await client.query('ROLLBACK');
          if (result.command === 'ROLLBACK') transaction.setOutcome({ transaction: 'rolled-back', operation: 'failed' });
          else discard = true;
        } catch { discard = true; }
      } else if (!began) discard = true;
      throw error;
    } finally { client?.release(discard); }
  }, { kind: 'db.transaction' });
}
