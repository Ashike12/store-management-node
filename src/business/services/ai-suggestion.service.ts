import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandResponse } from '../../shared/response/command.response';
import { GenerateAiSuggestionDto } from '../dto/ai-suggestion/generate-ai-suggestion.dto';

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

@Injectable()
export class AiSuggestionService {
  private readonly logger = new Logger(AiSuggestionService.name);

  constructor(private readonly configService: ConfigService) {}

  async generateSuggestion(
    dto: GenerateAiSuggestionDto,
  ): Promise<CommandResponse> {
    const response = new CommandResponse();
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException('AI suggestion is not configured');
    }

    if (dto.FieldName !== 'Description') {
      throw new BadRequestException('Only description suggestions are supported');
    }

    const suggestion = await this.generateWithGemini(dto, apiKey);
    response.setSuccess({ Suggestion: suggestion });
    return response;
  }

  private async generateWithGemini(
    dto: GenerateAiSuggestionDto,
    apiKey: string,
  ): Promise<string> {
    const models = this.getGeminiModelsToTry();
    const prompt = this.buildProductDescriptionPrompt(dto);

    for (const model of models) {
      try {
        return await this.generateWithGeminiModel(model, prompt, apiKey);
      } catch (error) {
        this.logger.warn(
          `Gemini model ${model} failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    throw new ServiceUnavailableException(
      'AI suggestion failed. All Gemini models are unavailable.',
    );
  }

  private async generateWithGeminiModel(
    model: string,
    prompt: string,
    apiKey: string,
  ): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const aiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 180,
        },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      this.logger.error(
        `Gemini model ${model} failed with status ${aiResponse.status}: ${errorText}`,
      );
      throw new ServiceUnavailableException(
        `Gemini model ${model} failed with status ${aiResponse.status}`,
      );
    }

    const data = (await aiResponse.json()) as GeminiGenerateResponse;
    const suggestion =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim() || '';

    if (!suggestion) {
      throw new ServiceUnavailableException('AI returned an empty suggestion');
    }

    return suggestion;
  }

  private getGeminiModelsToTry(): string[] {
    const primaryModel =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-3.8-flash';
    const fallbackModels = (
      this.configService.get<string>('GEMINI_FALLBACK_MODELS') ||
      'gemini-flash-lite-latest,gemini-3.1-flash-lite'
    )
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean);

    return Array.from(new Set([primaryModel, ...fallbackModels]));
  }

  private buildProductDescriptionPrompt(dto: GenerateAiSuggestionDto): string {
    return [
      'Write a polished ecommerce product description for a Bangladesh store.',
      'Return ONLY Bengali text written in Bangla script.',
      'Do not include English translation, markdown, labels, explanation, or quotation marks.',
      'Even if the input is English, Chinese, mixed language, or romanized Bangla, output only Bengali.',
      'Use 2 to 4 short sentences that feel clear, trustworthy, and useful for Bangladeshi customers.',
      'Do not mention unsupported claims, warranties, medical/safety claims, or exact delivery dates.',
      `Product name: ${dto.ProductName || 'Not provided'}`,
      `Category: ${dto.Category || 'Not provided'}`,
      `Sub category: ${dto.SubCategory || 'Not provided'}`,
      `Current description: ${dto.CurrentValue || 'Not provided'}`,
    ].join('\n');
  }
}
