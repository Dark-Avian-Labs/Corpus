import { useOutletContext } from 'react-router-dom';

import type { LayoutOutletContext } from './Layout';

export function useLayoutSlots() {
  return useOutletContext<LayoutOutletContext>();
}
