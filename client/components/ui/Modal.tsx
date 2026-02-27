import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ariaLabelledBy?: string;
}

export function Modal({
  open,
  onClose,
  children,
  className,
  ariaLabelledBy,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousActiveElement = document.activeElement;
    const modalElement = modalRef.current;
    if (!modalElement) {
      return undefined;
    }

    const focusableSelector =
      'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

    const getFocusableElements = () =>
      Array.from(modalElement.querySelectorAll<HTMLElement>(focusableSelector));

    const initialFocusable = getFocusableElements();
    if (initialFocusable.length > 0) {
      initialFocusable[0].focus();
    } else {
      modalElement.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        modalElement.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (
          !activeElement ||
          activeElement === firstElement ||
          !modalElement.contains(activeElement)
        ) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (
        !activeElement ||
        activeElement === lastElement ||
        !modalElement.contains(activeElement)
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (
        previousActiveElement instanceof HTMLElement &&
        document.contains(previousActiveElement) &&
        previousActiveElement !== document.body &&
        !previousActiveElement.hasAttribute('disabled')
      ) {
        previousActiveElement.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const modalClassName = className ? `modal ${className}` : 'modal';

  const stopPropagation = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div
        ref={modalRef}
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        onClick={stopPropagation}
      >
        {children}
      </div>
    </div>
  );
}
