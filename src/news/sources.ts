import type { NewsSource } from './types';

export const NEWS_SOURCES: readonly NewsSource[] = [
  {
    id: 'openai',
    name: 'OpenAI News',
    feedUrl: 'https://openai.com/news/rss.xml',
    category: 'official',
    language: 'en',
  },
  {
    id: 'google-deepmind',
    name: 'Google DeepMind',
    feedUrl: 'https://deepmind.google/blog/rss.xml',
    category: 'official',
    language: 'en',
  },
  {
    id: 'hugging-face',
    name: 'Hugging Face Blog',
    feedUrl: 'https://huggingface.co/blog/feed.xml',
    category: 'official',
    language: 'en',
  },
  {
    id: 'apple-machine-learning',
    name: 'Apple Machine Learning Research',
    feedUrl: 'https://machinelearning.apple.com/rss.xml',
    category: 'official',
    language: 'en',
  },
  {
    id: 'nvidia-technical-blog',
    name: 'NVIDIA Technical Blog',
    feedUrl: 'https://developer.nvidia.com/blog/feed/',
    category: 'official',
    language: 'en',
  },
  {
    id: 'ars-technica-ai',
    name: 'Ars Technica AI',
    feedUrl: 'https://arstechnica.com/ai/feed/',
    category: 'independent',
    language: 'en',
  },
  {
    id: 'mit-technology-review-ai',
    name: 'MIT Technology Review AI',
    feedUrl: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/',
    category: 'independent',
    language: 'en',
  },
  {
    id: 'the-decoder',
    name: 'The Decoder',
    feedUrl: 'https://the-decoder.com/feed/',
    category: 'independent',
    language: 'en',
  },
];
