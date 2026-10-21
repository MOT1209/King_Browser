import { useEffect, useState } from 'react';

export interface TitlebarInsets {
  /** Reserved space (CSS px) on the left edge for native window controls. */
  left: number;
  /** Reserved space (CSS px) on the right edge for native window controls. */
  right: number;
  /** True when the native Window Controls Overlay reports live geometry. */
  active: boolean;
}

const ZERO: TitlebarInsets = { left: 0, right: 0, active: false };

function readInsets(): TitlebarInsets {
  try {
    const overlay = (navigator as any).windowControlsOverlay;
    if (!overlay || typeof overlay.getTitlebarAreaRect !== 'function' || !overlay.visible) {
      return ZERO;
    }
    const rect = overlay.getTitlebarAreaRect();
    return {
      left: Math.max(0, Math.round(rect.x)),
      right: Math.max(0, Math.round(window.innerWidth - rect.x - rect.width)),
      active: true,
    };
  } catch {
    return ZERO;
  }
}

/**
 * Reports where the native window controls (minimize/maximize/close) sit so
 * toolbars can reserve exactly that much space. Windows mirrors the caption
 * buttons to the left when the OS UI language is RTL, so a hardcoded
 * right-side spacer leaves the first tab hidden under the controls.
 * getTitlebarAreaRect() returns the usable titlebar area on either side.
 */
export function useTitlebarInsets(): TitlebarInsets {
  const [insets, setInsets] = useState<TitlebarInsets>(readInsets);

  useEffect(() => {
    const overlay = (navigator as any).windowControlsOverlay;
    if (!overlay || typeof overlay.getTitlebarAreaRect !== 'function') return;

    const update = () => setInsets(readInsets());
    update();
    overlay.addEventListener('geometrychange', update);
    window.addEventListener('resize', update);
    return () => {
      overlay.removeEventListener('geometrychange', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return insets;
}
