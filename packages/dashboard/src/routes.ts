import {
  BarChart3,
  ChartPie,
  FileCode,
  RefreshCw,
  ScrollText,
  Smartphone,
  Terminal,
} from 'lucide-react';

import type { Icon } from './types/dashboard';

export const routes: { path: string; label: string; icon: Icon }[] = [
  { path: '/', label: 'Overview', icon: BarChart3 },
  { path: '/instances', label: 'Instances', icon: Terminal },
  { path: '/devices', label: 'Devices', icon: Smartphone },
  { path: '/bundles', label: 'Bundles', icon: FileCode },
  { path: '/analyze', label: 'Analyze', icon: ChartPie },
  { path: '/logs', label: 'Build Logs', icon: ScrollText },
  { path: '/actions', label: 'Actions', icon: RefreshCw },
];
