import { traceTransaction } from '../../runtime/postgres.mjs';
/** This is application code, not an automatic SDK adapter. */
export async function saveCustomer({ tracer, pool, scenario, name }) {
  return tracer.span('createCustomer', async service => {
    try {
      const customer = await traceTransaction(tracer, pool, async db => {
        const result = await db.query('INSERT', 'INSERT INTO open_view_runtime_examples (name) VALUES ($1) RETURNING id', [name]);
        if (['rollback', 'fixture'].includes(scenario)) throw new Error('Intentional example rollback');
        return result.rows[0];
      });
      if (scenario === 'after-commit') await tracer.span('invalidateCustomerCache', () => { throw new Error('Intentional post-commit failure'); });
      service.setOutcome({ business: 'succeeded', dataOrigin: 'remote' });
      return { id: customer.id, origin: 'remote' };
    } catch (error) {
      if (scenario === 'fixture') return tracer.span('returnFixture', span => {
        span.setOutcome({ dataOrigin: 'fixture', business: 'succeeded' });
        service.setOutcome({ dataOrigin: 'fixture', business: 'succeeded' });
        return { id: 'fixture-example', origin: 'fixture' };
      }, { kind: 'fallback' });
      service.setOutcome({ business: 'failed' }); throw error;
    }
  });
}
