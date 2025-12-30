import {
  DEFAULT_QUESTIONS,
  DEFAULT_SEARCH_QUERY,
} from '../../constants/prompts';
import type { QueryMode } from '../../types/index';

interface QueryInputProps {
  mode: QueryMode;
  setMode: (mode: QueryMode) => void;
  streamingEnabled: boolean;
  setStreamingEnabled: (enabled: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  topK: number;
  setTopK: (topK: number) => void;
  similarityThreshold: number;
  setSimilarityThreshold: (threshold: number) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function QueryInput({
  mode,
  setMode,
  streamingEnabled,
  setStreamingEnabled,
  query,
  setQuery,
  topK,
  setTopK,
  similarityThreshold,
  setSimilarityThreshold,
  onSubmit,
  isLoading,
}: QueryInputProps) {
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      onSubmit();
    }
  };

  return (
    <div className="mb-8">
      <div
        className="flex gap-4 mb-5 p-4 rounded-lg"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-secondary)',
        }}
      >
        <label className="flex items-center cursor-pointer group">
          <input
            type="radio"
            name="mode"
            value="ask"
            checked={mode === 'ask'}
            onChange={e => setMode(e.currentTarget.value as QueryMode)}
            className="mr-2 cursor-pointer w-4 h-4 accent-current"
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          <span
            className="transition-colors"
            style={{
              color:
                mode === 'ask'
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
              fontWeight: mode === 'ask' ? 600 : 400,
            }}
          >
            Ask (RAG + LLM Response)
          </span>
        </label>
        <label className="flex items-center cursor-pointer group">
          <input
            type="radio"
            name="mode"
            value="search"
            checked={mode === 'search'}
            onChange={e => setMode(e.currentTarget.value as QueryMode)}
            className="mr-2 cursor-pointer w-4 h-4"
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          <span
            className="transition-colors"
            style={{
              color:
                mode === 'search'
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
              fontWeight: mode === 'search' ? 600 : 400,
            }}
          >
            Search (RAG)
          </span>
        </label>
      </div>

      {mode === 'ask' && (
        <div
          className="flex gap-4 mb-5 p-4 rounded-lg"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-secondary)',
          }}
        >
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={streamingEnabled}
              onChange={e => setStreamingEnabled(e.currentTarget.checked)}
              className="mr-2 cursor-pointer w-4 h-4"
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            <span
              className="transition-colors"
              style={{
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              Enable Streaming
            </span>
          </label>
        </div>
      )}

      {/* Advanced Settings */}
      <div
        className="mb-5 p-4 rounded-lg"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-secondary)',
        }}
      >
        <div className="mb-3">
          <label
            className="block mb-2 font-medium text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            Top K Results: {topK}
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={topK}
            onChange={e => setTopK(Number(e.currentTarget.value))}
            className="w-full"
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          <div
            className="flex justify-between text-xs mt-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span>1</span>
            <span>20</span>
          </div>
        </div>

        <div>
          <label
            className="block mb-2 font-medium text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            Similarity Threshold: {similarityThreshold.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={similarityThreshold}
            onChange={e =>
              setSimilarityThreshold(Number(e.currentTarget.value))
            }
            className="w-full"
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          <div
            className="flex justify-between text-xs mt-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span>0.0 (More results)</span>
            <span>1.0 (More relevant)</span>
          </div>
        </div>
      </div>

      <div className="mb-5">
        <label
          htmlFor="question"
          className="block mb-2 font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {mode === 'ask' ? 'Your Question:' : 'Search Query:'}
        </label>
        <div className="flex gap-2">
          {mode === 'ask' && (
            <div className="relative flex-1 min-w-[30%]">
              <select
                id="question-select"
                value={DEFAULT_QUESTIONS.includes(query) ? query : ''}
                onChange={e => {
                  setQuery(e.currentTarget.value);
                }}
                className="appearance-none w-full px-4 py-3 rounded-lg text-base transition-all duration-200"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: DEFAULT_QUESTIONS.includes(query)
                    ? 'var(--text-primary)'
                    : 'var(--text-tertiary)',
                  border: '2px solid var(--border-primary)',
                  paddingRight: '2.5rem',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'var(--accent-primary)';
                  e.target.style.boxShadow =
                    '0 0 0 3px rgba(106, 124, 158, 0.1)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'var(--border-primary)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                <option value="" style={{ color: 'var(--text-tertiary)' }}>
                  Custom question...
                </option>
                {DEFAULT_QUESTIONS.map(question => (
                  <option key={question} value={question}>
                    {question}
                  </option>
                ))}
              </select>
              <svg
                style={{
                  position: 'absolute',
                  right: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '1rem',
                  height: '1rem',
                  pointerEvents: 'none',
                  color: 'var(--text-tertiary)',
                }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          )}
          <input
            type="text"
            id="question"
            value={query}
            onChange={e => setQuery(e.currentTarget.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              mode === 'ask'
                ? `e.g., ${DEFAULT_QUESTIONS[0]}`
                : `e.g., ${DEFAULT_SEARCH_QUERY}`
            }
            className="w-full px-4 py-3 rounded-lg text-base transition-all duration-200"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color:
                query.length > 0
                  ? 'var(--text-primary)'
                  : 'var(--text-tertiary)',
              border: '2px solid var(--border-primary)',
            }}
            onFocus={e => {
              e.target.style.borderColor = 'var(--accent-primary)';
              e.target.style.boxShadow = '0 0 0 3px rgba(106, 124, 158, 0.1)';
            }}
            onBlur={e => {
              e.target.style.borderColor = 'var(--border-primary)';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      <div className="flex gap-2.5">
        <button
          onClick={onSubmit}
          disabled={isLoading}
          className="flex-1 px-6 py-3 rounded-lg text-base font-medium transition-all duration-200 flex items-center justify-center gap-2"
          style={{
            backgroundColor: isLoading
              ? 'var(--accent-secondary)'
              : 'var(--accent-primary)',
            color: 'var(--bg-secondary)',
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            boxShadow: isLoading ? 'none' : 'var(--shadow-sm)',
          }}
          onMouseEnter={e => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }
          }}
          onMouseLeave={e => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = 'var(--accent-primary)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
            }
          }}
        >
          {isLoading && (
            <svg
              className="spinner"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
          {mode === 'ask'
            ? streamingEnabled
              ? isLoading
                ? 'Generating...'
                : 'Ask Question (Streaming)'
              : isLoading
                ? 'Generating...'
                : 'Ask Question'
            : isLoading
              ? 'Searching...'
              : 'Search Documents'}
        </button>
      </div>
    </div>
  );
}
