"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ImagePlus, LoaderCircle, Plus, Sparkles, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { cn } from "../../lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  maxLength: number;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
  readOnly?: boolean;
  submitDisabled?: boolean;
  busy?: boolean;
  enterToSend?: boolean;
  context?: ReactNode;
  tools?: ReactNode;
  suggestions?: string[];
  attachment?: { src: string; name: string; remove: () => void };
  onAttach?: (file?: File) => void;
};

/** Expand the compact chat box as text grows. Studio supplies its actions and state. */
export default function PromptComposer({
  value,
  onChange,
  label,
  placeholder,
  maxLength,
  onSubmit,
  submitLabel,
  disabled = false,
  readOnly = false,
  submitDisabled = false,
  busy = false,
  enterToSend = false,
  context,
  tools,
  suggestions,
  attachment,
  onAttach,
}: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const leading = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const refocusInput = useRef(false);
  const id = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [multiline, setMultiline] = useState(false);
  const hasContext = !!context;
  const hasAttachment = !!attachment;
  const hasTools = !!(onAttach || suggestions?.length || tools);
  const blocked = disabled || submitDisabled || busy || !value.trim();

  useLayoutEffect(() => {
    const element = input.current;
    const container = root.current;
    if (!element || !container) return;
    const measure = () => {
      // Tab panels stay mounted to preserve drafts; hidden panels have no
      // measurable inline width. Wait until their next visible resize.
      if (!container.clientWidth) return;
      const style = getComputedStyle(container);
      const gap = parseFloat(style.columnGap) || 10;
      const available =
        container.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        (leading.current?.offsetWidth ?? 0) -
        (action.current?.offsetWidth ?? 0) -
        gap * (hasTools ? 2 : 1);
      // Measure at the pill's inline width even after expansion. That stable
      // threshold prevents the wider multiline layout from collapsing itself.
      element.style.height = "0px";
      element.style.width = Math.max(40, available) + "px";
      element.style.flex = "none";
      const inlineHeight = element.scrollHeight;
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 24;
      const nextMultiline = hasContext || hasAttachment || inlineHeight > lineHeight * 1.5;
      element.style.width = "";
      element.style.flex = "";
      setMultiline((current) => (current === nextMultiline ? current : nextMultiline));
      const natural = element.scrollHeight;
      element.style.height = Math.min(112, Math.max(24, natural)) + "px";
      element.style.overflowY = natural > 112 ? "auto" : "hidden";
    };
    measure();
    let width = container.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth !== width) {
        width = container.clientWidth;
        cancelAnimationFrame(frame);
        // Measuring changes the textarea's height. Defer that write outside
        // ResizeObserver delivery to avoid a resize-notification loop.
        frame = requestAnimationFrame(measure);
      }
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, multiline, hasContext, hasAttachment, hasTools, submitLabel]);

  function focusAfterMenu() {
    refocusInput.current = true;
    setMenuOpen(false);
  }

  return (
    <div className="prompt-composer-wrap min-w-0">
      <div
        ref={root}
        className={cn(
          "prompt-composer flex min-h-[46px] flex-wrap items-center gap-2 rounded-[24px] border border-input bg-background px-2 py-1.5 shadow-sm transition-colors focus-within:border-primary/50",
          multiline && "composer-multiline gap-y-2 p-2.5",
        )}
        role="group"
        aria-label={label}
        aria-busy={busy}
      >
        {context && <div className="order-first w-full min-w-0 px-1">{context}</div>}
        {attachment && (
          <div className="order-first flex w-full items-center gap-2 rounded-2xl bg-secondary p-2 text-xs text-muted-foreground">
            <img
              className="size-9 rounded-lg object-cover"
              src={attachment.src}
              alt="Attached scene reference"
            />
            <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-full"
              type="button"
              aria-label="Remove reference photo"
              disabled={disabled || busy}
              onClick={attachment.remove}
            >
              <X size={14} />
            </Button>
          </div>
        )}
        {hasTools && (
          <div
            ref={leading}
            className={cn("composer-leading shrink-0", multiline ? "order-2" : "order-1")}
          >
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="composer-plus size-8 rounded-full text-muted-foreground"
                  aria-label="Composer tools"
                  title="Tools"
                  disabled={disabled || busy}
                >
                  <Plus
                    className={cn("transition-transform duration-200", menuOpen && "rotate-45")}
                    size={17}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="center"
                sideOffset={8}
                className="studio-popover composer-tool-menu flex w-72 max-w-[calc(100vw-24px)] flex-col gap-1 rounded-2xl border-white/10 bg-[#191c1bf5] p-2 text-[#e3e7e0] shadow-xl"
                aria-label="Composer tools"
                onCloseAutoFocus={(event) => {
                  if (refocusInput.current) {
                    event.preventDefault();
                    refocusInput.current = false;
                    input.current?.focus();
                  }
                }}
              >
                {onAttach && (
                  <label className="composer-attach relative flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-xs text-foreground hover:bg-white/5 focus-within:ring-1 focus-within:ring-ring">
                    <ImagePlus size={16} />
                    <span>Add reference photo</span>
                    <input
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                      type="file"
                      aria-label="Attach reference photo"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={disabled || busy}
                      onChange={(event) => {
                        onAttach(event.target.files?.[0]);
                        event.target.value = "";
                        focusAfterMenu();
                      }}
                    />
                  </label>
                )}
                {!!suggestions?.length && (
                  <div className="composer-suggestions" role="group" aria-label="Suggested edits">
                    <p className="composer-menu-label">
                      <Sparkles size={12} />
                      Try an edit
                    </p>
                    {suggestions.map((text) => (
                      <Button
                        variant="ghost"
                        className="h-auto min-h-9 w-full justify-start whitespace-normal rounded-lg px-3 py-2 text-left text-xs text-muted-foreground"
                        type="button"
                        key={text}
                        disabled={disabled || busy}
                        onClick={() => {
                          onChange(text);
                          focusAfterMenu();
                        }}
                      >
                        {text}
                      </Button>
                    ))}
                  </div>
                )}
                <div
                  className={cn(
                    enterToSend && "composer-scene-tools flex flex-col items-center gap-1",
                  )}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("[data-composer-dismiss]"))
                      setMenuOpen(false);
                  }}
                >
                  {tools}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
        <Textarea
          className={cn(
            "min-h-0 min-w-0 resize-none rounded-none border-0 bg-transparent p-0 text-[14px] leading-[22px] text-foreground shadow-none placeholder:text-muted-foreground focus-visible:outline-none! focus-visible:ring-0 md:text-[14px]",
            multiline ? "order-1 w-full basis-full px-1" : "order-2 flex-1",
          )}
          ref={input}
          aria-label={label}
          aria-describedby={id + "-hint"}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={1}
          value={value}
          disabled={disabled || busy}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229)
              return;
            const submit = enterToSend ? !event.shiftKey : event.metaKey || event.ctrlKey;
            if (submit) {
              event.preventDefault();
              if (!blocked) onSubmit();
            }
          }}
        />
        <Button
          ref={action}
          className={cn(
            "composer-submit order-3 ml-auto shrink-0 rounded-full text-xs",
            enterToSend ? "size-8 p-0" : "h-8 px-3",
          )}
          type="button"
          aria-label={submitLabel}
          title={submitLabel}
          disabled={blocked}
          onClick={onSubmit}
        >
          {!enterToSend && <span>{submitLabel}</span>}
          {busy ? <LoaderCircle size={18} className="scene-spin" /> : <ArrowUp size={16} />}
        </Button>
      </div>
      <p className="sr-only" id={id + "-hint"}>
        {enterToSend
          ? "Enter to send · Shift + Enter for a new line"
          : "⌘ / Ctrl + Enter to continue"}
      </p>
    </div>
  );
}
