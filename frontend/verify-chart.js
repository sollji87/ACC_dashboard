// MLB 차트 쿼리 테스트
const snowflake = require('snowflake-sdk');
require('dotenv').config({ path: '.env.local' });

const connection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USERNAME,
  password: process.env.SNOWFLAKE_PASSWORD,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE,
  role: process.env.SNOWFLAKE_ROLE,
});

connection.connect((err) => {
  if (err) {
    console.error('연결 실패:', err);
    return;
  }
  console.log('Snowflake 연결 성공\n');

  const query = `
    WITH all_weeks AS (
      SELECT DISTINCT end_dt
      FROM fnf.prcs.db_sh_s_w
      WHERE end_dt <= CURRENT_DATE()
        AND end_dt >= DATEADD(WEEK, -14, CURRENT_DATE())
    ),
    recent_weeks AS (
      SELECT 
        end_dt,
        YEAR(end_dt) AS yyyy,
        WEEKOFYEAR(end_dt) AS week_num,
        TO_CHAR(end_dt, 'YYYY') || '-W' || LPAD(WEEKOFYEAR(end_dt)::STRING, 2, '0') AS week_key,
        ROW_NUMBER() OVER (ORDER BY end_dt DESC) AS week_rank
      FROM all_weeks
      QUALIFY week_rank <= 12
    )
    SELECT * FROM recent_weeks ORDER BY end_dt DESC
  `;

  connection.execute({
    sqlText: query,
    complete: (err, stmt, rows) => {
      if (err) {
        console.error('쿼리 실패:', err);
      } else {
        console.log('=== 최근 12주 목록 ===');
        rows.forEach(r => {
          console.log(`${r.WEEK_KEY} (${r.END_DT.toISOString().split('T')[0]})`);
        });
        console.log(`\n총 ${rows.length}개 주`);
      }
      connection.destroy();
    }
  });
});

