import { useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Cloud, ChevronLeft, ChevronRight } from 'lucide-react';

export default function QuestionCard({
  question,
  index,
  total,
  answer,
  onChange,
  disabled,
  flagged,
  onToggleFlag,
  onPrev,
  onNext,
  autosaveSeconds = 8,
}) {
  if (!question) return null;
  const isMCQ = question.questionType === 'MCQ';
  const isTrueFalse = question.questionType === 'TRUE_FALSE';
  const isFillBlank = question.questionType === 'FILL_BLANK';
  const isMatching = question.questionType === 'MATCHING';

  const options = Array.isArray(question.options) ? question.options : [];

  const pairsList = useMemo(() => {
    if (!question?.pairs) return [];
    if (Array.isArray(question.pairs)) return question.pairs;
    if (typeof question.pairs === 'string') {
      try {
        return JSON.parse(question.pairs);
      } catch (e) {
        return [];
      }
    }
    return [];
  }, [question?.pairs]);

  const matchingRightOptions = useMemo(() => {
    if (question?.questionType !== 'MATCHING') return [];
    const uniqueRights = [...new Set(pairsList.map(p => p.right).filter(Boolean))];
    return uniqueRights.sort();
  }, [question?.id, question?.questionType, pairsList]);
  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;
  const atStart = index === 0;
  const atEnd = index >= total - 1;
  const isFlagged = flagged?.has?.(question.id);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* ── Top progress bar ── */}
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-1">
        <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--eq-accent)' }}>
          Question {index + 1} of {total}
        </span>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--eq-border)' }}>
          <motion.div
            className="eq-progress-fill h-full rounded-full"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--eq-text-muted)' }}>
          <span style={{ color: 'var(--eq-text)' }}>{Math.round(progress)}%</span> Complete
        </span>
      </div>

      {/* ── Main question card ── */}
      <div className="eq-card flex min-h-0 flex-1 flex-col rounded-2xl">
        <div className="eq-main-scroll px-6 py-6 sm:px-8 sm:py-7 lg:px-10 lg:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={question.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="mx-auto w-full max-w-3xl"
            >
              {/* Header: type badge + bookmark */}
              <div className="mb-5 flex items-start justify-between gap-3">
                <span
                  className="rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                  style={{
                    background: 'var(--eq-accent-soft)',
                    color: 'var(--eq-accent)',
                  }}
                >
                  {isMCQ && 'Multiple Choice'}
                  {isTrueFalse && 'True / False'}
                  {isFillBlank && 'Fill In The Blank'}
                  {isMatching && 'Matching'}
                  {(!question.questionType || question.questionType === 'SHORT_ANSWER') && 'Short Answer'}
                </span>
                <motion.button
                  type="button"
                  onClick={onToggleFlag}
                  whileTap={{ scale: 0.92 }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border transition"
                  style={{
                    borderColor: isFlagged ? 'var(--eq-flag)' : 'var(--eq-border)',
                    background: isFlagged ? 'var(--eq-flag-soft)' : '#fff',
                    color: isFlagged ? 'var(--eq-flag)' : 'var(--eq-text-muted)',
                  }}
                  aria-label={isFlagged ? 'Unflag' : 'Flag for review'}
                >
                  <Bookmark className="h-3.5 w-3.5" fill={isFlagged ? 'var(--eq-flag)' : 'none'} />
                </motion.button>
              </div>

              {/* Question text — balanced SaaS scale */}
              <h2
                className="no-copy mb-7 text-lg font-bold leading-[1.4] tracking-tight sm:text-xl lg:text-2xl xl:text-[26px] xl:leading-[1.35]"
                style={{ color: 'var(--eq-text)', letterSpacing: '-0.01em' }}
                onCopy={e => e.preventDefault()}
              >
                {question.questionText}
              </h2>

              {/* Options — sit under question, full width of centered container */}
              {isMCQ || isTrueFalse ? (
                <div className="flex flex-col gap-3">
                  {options.map((opt, i) => (
                    <OptionCard
                      key={i}
                      index={i}
                      label={opt}
                      selected={String(answer?.selectedOption ?? '') === String(i)}
                      disabled={disabled}
                      onSelect={() => onChange({ selectedOption: i })}
                      questionId={question.id}
                    />
                  ))}
                </div>
              ) : isFillBlank ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={answer?.answerText || ''}
                    onChange={(e) => onChange({ answerText: e.target.value })}
                    disabled={disabled}
                    placeholder="Type the word that fits the blank..."
                    className="w-full rounded-2xl border bg-white p-4 text-[15px] outline-none transition focus:ring-2"
                    style={{
                      borderColor: 'var(--eq-border)',
                      color: 'var(--eq-text)',
                      height: '48px'
                    }}
                  />
                </div>
              ) : isMatching ? (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-slate-500 mb-2">Match each term on the left with its definition on the right:</p>
                  <div className="flex flex-col gap-3">
                    {pairsList.map((pair, idx) => {
                      const leftVal = pair.left;
                      const selectedRight = answer?.matches?.[leftVal] || '';
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="flex-1 text-sm font-semibold text-slate-700">{leftVal}</div>
                          <div className="text-slate-400">→</div>
                          <div className="flex-[1.5]">
                            <select
                              value={selectedRight}
                              disabled={disabled}
                              onChange={(e) => {
                                const currentMatches = answer?.matches || {};
                                const updatedMatches = { ...currentMatches, [leftVal]: e.target.value };
                                onChange({
                                  matches: updatedMatches,
                                  answerText: JSON.stringify(updatedMatches)
                                });
                              }}
                              className="w-full h-10 px-3 border rounded-xl bg-white text-xs text-slate-600 outline-none focus:ring-2"
                              style={{ borderColor: 'var(--eq-border)' }}
                            >
                              <option value="">-- Choose matching definition --</option>
                              {matchingRightOptions.map((rightOpt, oIdx) => (
                                <option key={oIdx} value={rightOpt}>
                                  {rightOpt}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <ShortAnswer
                  value={answer?.answerText || ''}
                  onChange={v => onChange({ answerText: v })}
                  disabled={disabled}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Integrated bottom nav ── */}
        <div
          className="shrink-0 border-t px-6 py-4 sm:px-8 lg:px-10"
          style={{ borderColor: 'var(--eq-border)', background: 'rgba(251, 250, 255, 0.6)' }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <motion.button
              type="button"
              onClick={onPrev}
              disabled={atStart}
              whileTap={!atStart ? { scale: 0.97 } : {}}
              className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: 'var(--eq-border)', color: 'var(--eq-text)' }}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </motion.button>

            <span className="hidden items-center gap-1.5 text-xs md:flex" style={{ color: 'var(--eq-text-muted)' }}>
              <Cloud className="h-3.5 w-3.5 eq-autosave-dot" style={{ color: 'var(--eq-success)' }} />
              Autosaves every {autosaveSeconds}s
            </span>

            <motion.button
              type="button"
              onClick={onNext}
              disabled={atEnd}
              whileHover={!atEnd ? { scale: 1.02 } : {}}
              whileTap={!atEnd ? { scale: 0.97 } : {}}
              className="eq-gradient-btn flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionCard({ index, label, selected, disabled, onSelect, questionId }) {
  const letter = String.fromCharCode(65 + index);

  return (
    <motion.label
      initial={false}
      animate={{
        borderColor: selected ? 'var(--eq-accent)' : 'var(--eq-border)',
        backgroundColor: selected ? 'var(--eq-accent-soft)' : '#ffffff',
      }}
      whileHover={!disabled ? {
        y: -1,
        boxShadow: selected
          ? '0 8px 20px -8px rgba(124, 58, 237, 0.35), 0 0 0 4px rgba(124, 58, 237, 0.08)'
          : '0 4px 12px -4px rgba(15, 17, 51, 0.10)',
      } : {}}
      whileTap={!disabled ? { scale: 0.995 } : {}}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="relative flex cursor-pointer items-center gap-3.5 rounded-xl border px-3.5 py-3"
      style={{
        borderWidth: '1.5px',
        boxShadow: selected
          ? '0 6px 18px -6px rgba(124, 58, 237, 0.3), 0 0 0 4px rgba(124, 58, 237, 0.08)'
          : 'var(--eq-shadow-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <input
        type="radio"
        name={`q-${questionId}`}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />

      {/* Letter badge */}
      <motion.span
        initial={false}
        animate={{
          backgroundColor: selected ? 'var(--eq-accent)' : '#fff',
          color: selected ? '#fff' : 'var(--eq-text-muted)',
        }}
        transition={{ duration: 0.18 }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{
          border: selected ? 'none' : '1.5px solid var(--eq-border)',
          boxShadow: selected ? '0 4px 10px -2px rgba(124, 58, 237, 0.4)' : 'none',
        }}
        aria-hidden
      >
        {letter}
      </motion.span>

      {/* Label */}
      <motion.span
        initial={false}
        animate={{ fontWeight: selected ? 600 : 500 }}
        className="flex-1 text-[14px] leading-snug sm:text-[15px]"
        style={{ color: 'var(--eq-text)' }}
      >
        {label}
      </motion.span>

      {/* Right radio indicator */}
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all"
        style={{
          background: selected ? 'var(--eq-accent)' : 'transparent',
          border: `1.5px solid ${selected ? 'var(--eq-accent)' : 'var(--eq-border-strong)'}`,
        }}
      >
        {selected && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className="h-2 w-2 rounded-full bg-white"
          />
        )}
      </span>
    </motion.label>
  );
}

function ShortAnswer({ value, onChange, disabled }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const block = e => e.preventDefault();
    el.addEventListener('paste', block);
    el.addEventListener('drop', block);
    return () => {
      el.removeEventListener('paste', block);
      el.removeEventListener('drop', block);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={6}
        placeholder="Write your answer here…"
        className="w-full resize-y rounded-2xl border bg-white p-4 text-[15px] leading-relaxed outline-none transition focus:ring-2"
        style={{
          borderColor: 'var(--eq-border)',
          color: 'var(--eq-text)',
        }}
      />
      <div className="flex justify-end">
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--eq-text-light)' }}>
          {value.length} characters
        </span>
      </div>
    </div>
  );
}
