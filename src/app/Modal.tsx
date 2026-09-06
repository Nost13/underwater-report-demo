import { useEffect, useRef, type ReactNode } from 'react';
export function Modal({ label, children, onClose }: { label: string; children: ReactNode; onClose?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if(dialog?.showModal)dialog.showModal();else dialog?.setAttribute('open',''); return () => dialog?.close?.(); }, []);
  return <dialog ref={ref} className="workflow-modal" aria-label={label} onCancel={(event) => { event.preventDefault(); onClose?.(); }}>{children}</dialog>;
}
