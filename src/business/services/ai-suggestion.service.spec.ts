import { AiSuggestionService } from './ai-suggestion.service';
import { Logger } from '@nestjs/common';

describe('AI suggestion provider isolation', () => {
  let service: AiSuggestionService;
  let fetchMock: jest.SpyInstance;
  const config = { get: jest.fn() };
  const response = (text: string) =>
    ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    }) as any;
  beforeEach(() => {
    config.get
      .mockReset()
      .mockImplementation(
        (key) =>
          ({
            GEMINI_API_KEY: 'test-key',
            GEMINI_MODEL: 'primary',
            GEMINI_FALLBACK_MODELS: 'primary, fallback, fallback',
          })[key],
      );
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response('  suggestion  '));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    service = new AiSuggestionService(config as any);
  });
  afterEach(() => jest.restoreAllMocks());
  it('requests Bengali-only descriptions regardless of input language', async () => {
    const result = await service.generateSuggestion({
      FieldName: 'Description',
      ProductName: 'Net',
      CurrentValue: 'English input',
    });
    expect(result.Data).toEqual({ Suggestion: 'suggestion' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain(
      'Return ONLY Bengali text written in Bangla script.',
    );
    expect(body.contents[0].parts[0].text).toContain('English input');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not call the provider without configuration', async () => {
    config.get.mockReturnValue(undefined);
    await expect(
      service.generateSuggestion({ FieldName: 'Description' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects unsupported suggestion fields', async () => {
    await expect(
      service.generateSuggestion({ FieldName: 'Password' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('falls back after 503 and deduplicates model names', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'busy',
    } as any);
    await service.generateSuggestion({ FieldName: 'Description' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/fallback:generateContent');
  });
  it('returns 503 when every configured model fails', async () => {
    fetchMock.mockRejectedValue(new Error('Network unavailable'));
    await expect(
      service.generateSuggestion({ FieldName: 'Description' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([
    {},
    { candidates: [] },
    { candidates: [{ content: { parts: [{}] } }] },
  ])('rejects empty provider output', async (body) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => body } as any);
    await expect(
      service.generateSuggestion({ FieldName: 'Description' }),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('joins multipart suggestions', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: 'one ' }, {}, { text: 'two' }] } },
        ],
      }),
    } as any);
    expect(
      (await service.generateSuggestion({ FieldName: 'Description' })).Data,
    ).toEqual({ Suggestion: 'one two' });
  });
});
