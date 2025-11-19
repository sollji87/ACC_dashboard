require('dotenv').config();
const snowflake = require('snowflake-sdk');

console.log('🔍 Snowflake 연결 정보 확인 중...\n');

const config = {
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USERNAME,
  password: process.env.SNOWFLAKE_PASSWORD,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA,
  role: process.env.SNOWFLAKE_ROLE,
};

// 민감 정보 마스킹하여 출력
console.log('📋 연결 정보:');
console.log('  - Account:', config.account || '❌ 없음');
console.log('  - Username:', config.username || '❌ 없음');
console.log('  - Password:', config.password ? '✅ 설정됨' : '❌ 없음');
console.log('  - Warehouse:', config.warehouse || '❌ 없음');
console.log('  - Database:', config.database || '❌ 없음');
console.log('  - Schema:', config.schema || '❌ 없음');
console.log('  - Role:', config.role || '(선택사항)');
console.log('');

// 필수 정보 체크
const required = ['account', 'username', 'password', 'warehouse', 'database', 'schema'];
const missing = required.filter(key => !config[key]);

if (missing.length > 0) {
  console.log('❌ 누락된 필수 정보:', missing.join(', '));
  console.log('\n.env 파일에 위 정보들을 입력해주세요!');
  process.exit(1);
}

console.log('✅ 모든 필수 정보가 입력되었습니다!');
console.log('\n🔌 Snowflake 연결 테스트 중...\n');

const connection = snowflake.createConnection(config);

connection.connect((err, conn) => {
  if (err) {
    console.error('❌ Snowflake 연결 실패:');
    console.error('   오류 메시지:', err.message);
    console.error('   오류 코드:', err.code);
    console.error('\n💡 확인 사항:');
    console.error('   1. 계정명(ACCOUNT)이 정확한가요?');
    console.error('   2. 사용자명/비밀번호가 맞나요?');
    console.error('   3. 웨어하우스가 실행 중인가요?');
    console.error('   4. 네트워크 연결이 가능한가요?');
    process.exit(1);
  }

  console.log('✅ Snowflake 연결 성공!\n');
  console.log('📊 간단한 테스트 쿼리 실행 중...\n');

  // 간단한 테스트 쿼리
  conn.execute({
    sqlText: 'SELECT CURRENT_VERSION() as version, CURRENT_USER() as user, CURRENT_DATABASE() as database, CURRENT_SCHEMA() as schema',
    complete: (err, stmt, rows) => {
      if (err) {
        console.error('❌ 쿼리 실행 실패:', err.message);
      } else {
        console.log('✅ 쿼리 실행 성공!');
        console.log('\n📋 연결 정보:');
        if (rows && rows.length > 0) {
          console.log('  - Snowflake Version:', rows[0].VERSION);
          console.log('  - Current User:', rows[0].USER);
          console.log('  - Current Database:', rows[0].DATABASE);
          console.log('  - Current Schema:', rows[0].SCHEMA);
        }
      }

      // 연결 종료
      conn.destroy((err) => {
        if (err) {
          console.error('\n⚠️  연결 종료 중 오류:', err.message);
        } else {
          console.log('\n✅ 연결 종료 완료');
        }
        console.log('\n🎉 Snowflake 연결 테스트가 완료되었습니다!');
        process.exit(0);
      });
    },
  });
});

