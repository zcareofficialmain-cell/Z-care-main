import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { MAX_QUESTION_LENGTH } from '@/services/ai/chat.service';

interface ChatInputProps {
  disabled: boolean;
  busy: boolean;
  placeholder: string;
  onSend: (question: string) => void;
  onStop: () => void;
}

export default function ChatInput({ disabled, busy, placeholder, onSend, onStop }: ChatInputProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to ~5 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [value]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = value.trim();
    if (!q || disabled) return;
    onSend(q);
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <label htmlFor="ai-question" className="sr-only">
        Your question
      </label>
      <textarea
        id="ai-question"
        ref={ref}
        rows={1}
        value={value}
        maxLength={MAX_QUESTION_LENGTH}
        onChange={e => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled && !busy}
        className="input-field flex-1 resize-none"
        style={{ minHeight: 44, lineHeight: 1.45, paddingTop: 11, paddingBottom: 11, fontSize: 15 }}
      />
      {busy ? (
        <button type="button" onClick={onStop} className="btn btn-outline shrink-0" style={{ height: 44, paddingInline: 14 }} aria-label="Stop generating">
          <Square size={16} />
          <span className="hidden sm:inline">Stop</span>
        </button>
      ) : (
        <button type="submit" disabled={disabled || !value.trim()} className="btn btn-primary shrink-0" style={{ height: 44, paddingInline: 14 }} aria-label="Send question">
          <Send size={16} />
          <span className="hidden sm:inline">Send</span>
        </button>
      )}
    </form>
  );
}
