import { pool } from '@/lib/db';

export default async function DbCheck() {
  const { rows } = await pool.query(
    'SELECT item, total_vigente FROM v_partida_vigente ORDER BY item'
  );

  return (
    <pre>{JSON.stringify(rows, null, 2)}</pre>
  );
}
