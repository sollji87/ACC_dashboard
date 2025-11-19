import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import * as XLSX from 'xlsx';

export interface CleanedData {
  brand: string;
  accessoryType: string;
  quantity: number;
  [key: string]: any;
}

@Injectable()
export class CsvService {
  private readonly logger = new Logger(CsvService.name);

  /**
   * CSV 파일 읽기 및 파싱
   */
  async readCsvFile(filePath: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          this.logger.log(`CSV 파일 읽기 완료: ${results.length}개 행`);
          resolve(results);
        })
        .on('error', (error) => {
          this.logger.error('CSV 파일 읽기 실패:', error);
          reject(error);
        });
    });
  }

  /**
   * Excel 파일 읽기 및 파싱
   */
  async readExcelFile(filePath: string, sheetName?: string): Promise<any[]> {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheet = sheetName
        ? workbook.Sheets[sheetName]
        : workbook.Sheets[workbook.SheetNames[0]];

      const data = XLSX.utils.sheet_to_json(sheet);
      this.logger.log(`Excel 파일 읽기 완료: ${data.length}개 행`);
      return data;
    } catch (error) {
      this.logger.error('Excel 파일 읽기 실패:', error);
      throw error;
    }
  }

  /**
   * 데이터 클렌징
   * - 빈 값 제거
   * - 숫자 형식 정규화
   * - 브랜드명 정규화
   */
  async cleanData(data: any[]): Promise<CleanedData[]> {
    this.logger.log(`데이터 클렌징 시작: ${data.length}개 행`);

    const cleaned = data
      .map((row) => {
        // 빈 행 제거
        const hasData = Object.values(row).some(
          (val) => val !== null && val !== undefined && val !== '',
        );
        if (!hasData) return null;

        // 브랜드명 정규화 (공백 제거, 대문자 변환)
        const brand = row.brand || row.Brand || row.BRAND || '';
        const normalizedBrand = brand.toString().trim().toUpperCase();

        // 악세사리 타입 정규화
        const accessoryType =
          row.accessoryType ||
          row.accessory_type ||
          row['Accessory Type'] ||
          row.type ||
          '';
        const normalizedType = accessoryType.toString().trim();

        // 수량 정규화 (숫자로 변환)
        const quantityStr =
          row.quantity ||
          row.Quantity ||
          row.QUANTITY ||
          row.qty ||
          row.stock ||
          '0';
        const quantity = this.parseNumber(quantityStr);

        return {
          brand: normalizedBrand,
          accessoryType: normalizedType,
          quantity: quantity,
          ...row, // 원본 데이터도 보존
        };
      })
      .filter((row) => row !== null && row.brand && row.quantity > 0) as CleanedData[];

    this.logger.log(`데이터 클렌징 완료: ${cleaned.length}개 행`);
    return cleaned;
  }

  /**
   * 숫자 파싱 헬퍼 함수
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // 쉼표 제거 후 숫자로 변환
      const cleaned = value.replace(/,/g, '').trim();
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * 클렌징된 데이터를 CSV로 저장
   */
  async saveToCsv(data: CleanedData[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const headers = Object.keys(data[0] || {});
        const csvContent = [
          headers.join(','),
          ...data.map((row) =>
            headers.map((header) => {
              const value = row[header];
              // CSV 이스케이프 처리
              if (typeof value === 'string' && value.includes(',')) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value;
            }).join(','),
          ),
        ].join('\n');

        fs.writeFileSync(outputPath, csvContent, 'utf-8');
        this.logger.log(`CSV 파일 저장 완료: ${outputPath}`);
        resolve();
      } catch (error) {
        this.logger.error('CSV 파일 저장 실패:', error);
        reject(error);
      }
    });
  }
}

