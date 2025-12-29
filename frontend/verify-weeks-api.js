/**
 * MLB 신발 재고주수 검증 스크립트 (API 호출)
 */

const http = require('http');

const url = 'http://localhost:3001/api/weekly-chart?brandId=mlb&weeksForSale=4&selectedItem=shoes';

http.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      
      if (!result.success) {
        console.error('API 오류:', result.error);
        return;
      }
      
      console.log('\n📊 MLB 신발 - 주차별 재고주수 검증 (4주 매출 기준)');
      console.log('='.repeat(120));
      console.log('주차\t\t재고(백만)\t4주매출(백만)\t주평균매출\t재고주수\t검증계산\t차이');
      console.log('-'.repeat(120));
      
      result.data.forEach((row) => {
        const stock = row.totalStock || 0;  // 재고금액 (백만원)
        const sale4w = row.saleAmount || 0;  // 4주 매출 (백만원)
        const weeklyAvgSale = sale4w / 4;  // 주당 평균 매출
        const weeks = row.weeks || 0;  // API에서 계산한 재고주수
        
        // 검증: 재고주수 = 재고금액 / 주당평균매출
        const verifyWeeks = weeklyAvgSale > 0 ? (stock / weeklyAvgSale).toFixed(1) : 0;
        const diff = (weeks - parseFloat(verifyWeeks)).toFixed(1);
        
        console.log(`${row.weekLabel}\t\t${stock}\t\t${sale4w}\t\t${weeklyAvgSale.toFixed(1)}\t\t${weeks}\t\t${verifyWeeks}\t\t${diff}`);
      });
      
      console.log('='.repeat(120));
      console.log('\n📝 재고주수 계산 공식:');
      console.log('   재고주수 = 재고택금액 / (4주 택매출 / 4)');
      console.log('   = 재고택금액 / 주당 평균 매출');
      console.log('\n📝 참고:');
      console.log('   - 재고금액: 해당 주차 말 기준 신발 택재고 금액 (백만원)');
      console.log('   - 4주매출: 해당 주차 포함 최근 4주간 신발 택매출 합계 (백만원)');
      console.log('   - 재고주수가 줄어드는 것은 재고 감소 또는 매출 증가를 의미');
      console.log('\n✅ 검증 완료');
      
    } catch (e) {
      console.error('JSON 파싱 오류:', e);
      console.log('원본 데이터:', data.substring(0, 500));
    }
  });
}).on('error', (e) => {
  console.error('API 호출 오류:', e.message);
});
