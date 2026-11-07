// '예시로 해 보기'용 내장 샘플: 실제 수신 파일의 대표적인 행들과 고정 기준 시각.

export const SAMPLE_NOW_ISO = '2026-11-07T00:00:00Z';

// OpenRouter 모델·가격 목록(data/openrouter_models.json)의 실제 행들
const SAMPLE_MODELS = [
  {
    id: 'inclusionai/ling-3.0-tiny',
    name: 'inclusionAI: Ling 3.0 Tiny',
    created: 1786034890,
    context_length: 262144,
    architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] },
    pricing: { prompt: '0.000000015', completion: '0.000000045' }
  },
  {
    id: 'inclusionai/ling-3.0-flash',
    name: 'inclusionAI: Ling 3.0 Flash',
    created: 1784818580,
    context_length: 262144,
    architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] },
    pricing: { prompt: '0.000000021', completion: '0.000000063' }
  },
  {
    id: 'mistralai/mistral-nemo',
    name: 'Mistral: Mistral Nemo',
    created: 1721347200,
    context_length: 131072,
    architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] },
    pricing: { prompt: '0.000000029', completion: '0.00000003' }
  }
];

// Hugging Face 모델 목록(data/hf_models.json)의 실제 행들
const SAMPLE_HF_ROWS = [
  { id: 'AtomicChat/DeepSeek-V4.1-Flash-1017-Uncensored-GSQ-RCO-GGUF', trendingScore: 293, createdAt: '2026-10-28T04:48:45.000Z' },
  { id: 'LiquidAI/LFM3-1.7B', trendingScore: 230.5, createdAt: '2026-10-23T21:35:42.000Z' },
  { id: 'ccore/Qwen3.5-4B-GLB-3D-Coder', trendingScore: 218, createdAt: '2026-11-04T09:12:33.000Z' },
  { id: 'deep-principle/Hydrogen-1.0', trendingScore: 205, createdAt: '2026-11-03T16:40:02.000Z' },
  { id: 'orcarouter/Flint-abliterated-GGUF', trendingScore: 198, createdAt: '2026-11-06T22:05:18.000Z' },
  { id: 'google/gemma-3-12b-it-q8', trendingScore: 174, createdAt: '2026-10-31T11:24:09.000Z' },
  { id: 'nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB', trendingScore: 78, createdAt: '2026-10-05T04:26:43.000Z' },
  { id: 'Qwen/Qwen3-14B', trendingScore: 61, createdAt: '2026-10-02T10:00:00.000Z' }
];

export function getSampleData() {
  return {
    models: structuredClone(SAMPLE_MODELS),
    hfRows: structuredClone(SAMPLE_HF_ROWS),
    nowIso: SAMPLE_NOW_ISO
  };
}
