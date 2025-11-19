import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenaiService {
  private readonly logger = new Logger(OpenaiService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OpenAI API 키가 설정되지 않았습니다.');
    } else {
      this.openai = new OpenAI({
        apiKey: apiKey,
      });
      this.logger.log('OpenAI 클라이언트 초기화 완료');
    }
  }

  /**
   * 재고 데이터에 대한 AI 인사이트 생성
   */
  async generateInsights(inventoryData: any[]): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    try {
      const dataSummary = this.summarizeData(inventoryData);

      const prompt = `
다음은 브랜드별 악세사리 재고 데이터입니다:

${dataSummary}

이 데이터를 분석하여 다음 인사이트를 제공해주세요:
1. 재고 현황 요약
2. 주의가 필요한 브랜드/제품
3. 재고 최적화 제안
4. 트렌드 분석

한국어로 답변해주세요.
      `;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '당신은 재고 관리 전문가입니다. 데이터를 분석하여 실용적인 인사이트를 제공합니다.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const insights = completion.choices[0]?.message?.content || '인사이트를 생성할 수 없습니다.';
      this.logger.log('AI 인사이트 생성 완료');
      return insights;
    } catch (error) {
      this.logger.error('AI 인사이트 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 데이터 요약 (프롬프트 최적화를 위해)
   */
  private summarizeData(data: any[]): string {
    const brandSummary: { [key: string]: { total: number; items: number } } = {};

    data.forEach((item) => {
      const brand = item.brand || 'Unknown';
      if (!brandSummary[brand]) {
        brandSummary[brand] = { total: 0, items: 0 };
      }
      brandSummary[brand].total += item.quantity || 0;
      brandSummary[brand].items += 1;
    });

    return Object.entries(brandSummary)
      .map(([brand, stats]) => `${brand}: 총 ${stats.total}개 (${stats.items}개 항목)`)
      .join('\n');
  }

  /**
   * 커스텀 프롬프트로 AI 응답 생성
   */
  async generateCustomResponse(prompt: string, context?: any): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: '당신은 재고 관리 및 데이터 분석 전문가입니다.',
        },
      ];

      if (context) {
        messages.push({
          role: 'user',
          content: `컨텍스트: ${JSON.stringify(context, null, 2)}\n\n${prompt}`,
        });
      } else {
        messages.push({
          role: 'user',
          content: prompt,
        });
      }

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      return completion.choices[0]?.message?.content || '응답을 생성할 수 없습니다.';
    } catch (error) {
      this.logger.error('AI 응답 생성 실패:', error);
      throw error;
    }
  }
}

